-- ============================================================================
-- Asset hierarchy: locations → charge_points → evses → connectors, plus the
-- global vendor/model registries and id_tags. See CLAUDE.md §5–§6.
--
-- Runtime fields on charge_points/connectors (connection_state, status, …)
-- are written ONLY by the gateway (service role); the policies below gate
-- what tenant admins may touch at the row level. Column-level enforcement
-- arrives with the gateway in Phase 1 if it proves necessary.
-- ============================================================================

-- ── Locations ───────────────────────────────────────────────────────────────

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  address text,
  city text,
  -- Malaysian state/territory; drives the licensing jurisdiction
  -- (Sabah/Labuan → ECoS, Sarawak → own authority, else Suruhanjaya Tenaga).
  state text,
  postcode text,
  country text not null default 'MY',
  lat double precision,
  lng double precision,
  timezone text not null default 'Asia/Kuala_Lumpur',
  site_type text not null default 'public'
    check (site_type in ('public', 'condo', 'workplace', 'home', 'fleet_depot')),
  -- Joint Management Body / Management Corporation name for condo sites;
  -- their consent letter is a prerequisite of the ST EVCS licence.
  jmb_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_tenant_id_idx on public.locations (tenant_id);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function extensions.moddatetime (updated_at);

alter table public.locations enable row level security;

create policy locations_select on public.locations
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy locations_insert on public.locations
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy locations_update on public.locations
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy locations_delete on public.locations
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Vendor / model registries (global, curated by Voltara) ─────────────────

create table public.charge_point_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Compat flags consumed by the gateway quirks layer, e.g.
  -- {"meterValueFormat": "wh_string", "connectorZeroStatus": "ignore"}
  quirks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.charge_point_models (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.charge_point_vendors (id) on delete cascade,
  name text not null,
  power_kw numeric,
  connector_count int not null default 1,
  connector_types text[] not null default '{Type2}',
  ocpp_versions text[] not null default '{1.6}',
  created_at timestamptz not null default now(),
  unique (vendor_id, name)
);

create index charge_point_models_vendor_id_idx on public.charge_point_models (vendor_id);

alter table public.charge_point_vendors enable row level security;
alter table public.charge_point_models enable row level security;

-- Read-only reference data for every signed-in user; writes are service-role
-- only (curated via the charger_compat intake → Phase 1 quirks workflow).
create policy charge_point_vendors_select on public.charge_point_vendors
  for select to authenticated using (true);

create policy charge_point_models_select on public.charge_point_models
  for select to authenticated using (true);

-- ── Charge points ───────────────────────────────────────────────────────────

create table public.charge_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  -- The identity segment of the WebSocket path (/ocpp/{identity}). Globally
  -- unique: the gateway resolves the tenant from it before auth completes.
  ocpp_identity text not null unique
    check (ocpp_identity ~ '^[A-Za-z0-9*_=:+|@.-]{3,48}$'),
  name text not null,
  model_id uuid references public.charge_point_models (id) on delete set null,
  -- What the charger itself reported at BootNotification (may disagree with model_id).
  vendor_reported text,
  model_reported text,
  serial_number text,
  firmware_version text,
  ocpp_version text not null default '1.6',
  -- argon2 hash of the per-charger Basic Auth key; plaintext is shown exactly
  -- once at registration. Written by the registration flow, verified by the
  -- gateway, never logged.
  auth_key_hash text,
  security_profile int not null default 2 check (security_profile in (1, 2, 3)),
  lifecycle text not null default 'pending'
    check (lifecycle in ('pending', 'active', 'decommissioned')),
  connection_state text not null default 'never_connected'
    check (connection_state in ('never_connected', 'online', 'offline')),
  last_seen_at timestamptz,
  last_boot_at timestamptz,
  heartbeat_interval_s int not null default 300,
  -- Last GetConfiguration snapshot, refreshed after boot and on demand.
  config jsonb not null default '{}'::jsonb,
  -- Per-charge-point overrides layered on top of vendor quirks.
  quirks_override jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index charge_points_tenant_id_idx on public.charge_points (tenant_id);
create index charge_points_location_id_idx on public.charge_points (location_id);

create trigger charge_points_set_updated_at
  before update on public.charge_points
  for each row execute function extensions.moddatetime (updated_at);

alter table public.charge_points enable row level security;

create policy charge_points_select on public.charge_points
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy charge_points_insert on public.charge_points
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy charge_points_update on public.charge_points
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy charge_points_delete on public.charge_points
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── EVSEs & connectors ──────────────────────────────────────────────────────
-- Modeled as separate tables from day one so the domain stays OCPI/OCPP-2.0.1
-- shaped. Under 1.6J the registration flow creates one EVSE per connector.

create table public.evses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  evse_number int not null default 1,
  created_at timestamptz not null default now(),
  unique (charge_point_id, evse_number)
);

create index evses_tenant_id_idx on public.evses (tenant_id);
create index evses_charge_point_id_idx on public.evses (charge_point_id);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  evse_id uuid not null references public.evses (id) on delete cascade,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  -- OCPP 1.6 connectorId (1-based; 0 addresses the whole charge point and is
  -- never stored as a connector row).
  ocpp_connector_id int not null check (ocpp_connector_id >= 1),
  connector_type text not null default 'Type2'
    check (connector_type in ('Type2', 'CCS2', 'CHAdeMO', 'Type1', 'GBT_AC', 'GBT_DC', 'Schuko', 'Other')),
  max_kw numeric,
  status text not null default 'Unknown'
    check (status in ('Available', 'Preparing', 'Charging', 'SuspendedEVSE', 'SuspendedEV',
                      'Finishing', 'Reserved', 'Unavailable', 'Faulted', 'Unknown', 'Offline')),
  status_updated_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique (charge_point_id, ocpp_connector_id)
);

create index connectors_tenant_id_idx on public.connectors (tenant_id);
create index connectors_charge_point_id_idx on public.connectors (charge_point_id);
create index connectors_evse_id_idx on public.connectors (evse_id);

alter table public.evses enable row level security;
alter table public.connectors enable row level security;

create policy evses_select on public.evses
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy evses_write on public.evses
  for all to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy connectors_select on public.connectors
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy connectors_write on public.connectors
  for all to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── ID tags (RFID / virtual driver credentials) ────────────────────────────

create table public.id_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tag text not null,
  label text,
  kind text not null default 'rfid' check (kind in ('rfid', 'virtual', 'mac')),
  status text not null default 'active' check (status in ('active', 'blocked', 'expired')),
  expires_at timestamptz,
  parent_tag text,
  -- Filled when a driver account owns this credential (Phase 4).
  driver_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, tag)
);

create index id_tags_tenant_id_idx on public.id_tags (tenant_id);

alter table public.id_tags enable row level security;

create policy id_tags_select on public.id_tags
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy id_tags_write on public.id_tags
  for all to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
