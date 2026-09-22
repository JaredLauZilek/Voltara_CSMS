-- ============================================================================
-- Phase 4 — driver access (docs/phase4-driver-app-design.md).
--
-- A driver is an auth user with NO tenant membership: the JWT hook injects
-- nothing, so every tenant-scoped policy already denies them. This migration
-- only ADDS access keyed on auth.uid(): their profile, their virtual tags,
-- their sessions/records/receipts — and SECURITY DEFINER functions for the
-- two cross-tenant things a driver does: find chargers and start/stop one.
-- ============================================================================

-- ── Driver profile ──────────────────────────────────────────────────────────

create table public.driver_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone text,
  -- Vehicle is optional, informational, and never a billing key.
  vehicle_plate text,
  vehicle_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger driver_profiles_set_updated_at
  before update on public.driver_profiles
  for each row execute function extensions.moddatetime (updated_at);

alter table public.driver_profiles enable row level security;

create policy driver_profiles_own_select on public.driver_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy driver_profiles_own_insert on public.driver_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy driver_profiles_own_update on public.driver_profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── A driver sees their own tags, sessions, records and receipts ────────────
-- Additive policies: OR-ed with the tenant policies by Postgres, so an
-- operator's view is unchanged and a driver sees only rows tied to them.

create policy id_tags_driver_select on public.id_tags
  for select to authenticated using (driver_user_id = (select auth.uid()));

create policy charging_sessions_driver_select on public.charging_sessions
  for select to authenticated
  using (id_tag_id in (select t.id from public.id_tags t where t.driver_user_id = (select auth.uid())));

create policy cdrs_driver_select on public.cdrs
  for select to authenticated
  using (
    charging_session_id in (
      select s.id from public.charging_sessions s
      join public.id_tags t on t.id = s.id_tag_id
      where t.driver_user_id = (select auth.uid())
    )
  );

create policy documents_driver_select on public.documents
  for select to authenticated
  using (
    kind = 'receipt' and status = 'issued'
    and cdr_id in (
      select c.id from public.cdrs c
      join public.charging_sessions s on s.id = c.charging_session_id
      join public.id_tags t on t.id = s.id_tag_id
      where t.driver_user_id = (select auth.uid())
    )
  );

-- Drivers see the public shape of the sites and chargers they have sessions
-- on (for history); discovery of everything else goes through the RPC below.
create policy locations_driver_select on public.locations
  for select to authenticated
  using (id in (
    select cp.location_id from public.charge_points cp
    join public.charging_sessions s on s.charge_point_id = cp.id
    join public.id_tags t on t.id = s.id_tag_id
    where t.driver_user_id = (select auth.uid())
  ));

-- Command outcomes for a driver's own start/stop — the app watches the row.
create policy remote_commands_driver_select on public.remote_commands
  for select to authenticated using (requested_by = (select auth.uid()));

-- Public site channels: any signed-in user may listen to connector status.
do $$
begin
  execute $p$
    create policy site_broadcast_read on realtime.messages
      for select to authenticated
      using (realtime.topic() like 'site:%')
  $p$;
exception
  when duplicate_object then null;
  when undefined_table or undefined_function or insufficient_privilege then
    raise notice 'realtime.messages policy skipped: %', sqlerrm;
end;
$$;

-- ── Discovery (cross-tenant, public shape only) ─────────────────────────────

create or replace function public.driver_nearby_chargers(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default 25,
  p_limit int default 100
)
returns table (
  location_id uuid, tenant_id uuid, operator_name text, site_name text, site_type text,
  address text, city text, lat double precision, lng double precision, distance_km double precision,
  charge_point_id uuid, charge_point_name text, connection_state text,
  connectors jsonb, tariff_text text, is_free boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with pts as (
    select cp.id as charge_point_id, cp.name as charge_point_name, cp.connection_state, cp.tenant_id, cp.location_id,
           l.name as site_name, l.site_type, l.address, l.city, l.lat, l.lng,
           coalesce(ts.app_name, t.name) as operator_name,
           case when p_lat is null or p_lng is null or l.lat is null or l.lng is null then null
                else 6371 * acos(least(1, greatest(-1,
                  cos(radians(p_lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(p_lng))
                  + sin(radians(p_lat)) * sin(radians(l.lat))))) end as distance_km
    from public.charge_points cp
    join public.locations l on l.id = cp.location_id
    join public.tenants t on t.id = cp.tenant_id and t.status = 'active'
    left join public.tenant_settings ts on ts.tenant_id = t.id
    where cp.lifecycle = 'active'
      and l.site_type in ('public', 'condo', 'workplace')
  ),
  tariff as (
    -- The tariff an ad-hoc driver would get at this charger, for display only.
    select p.charge_point_id,
           (select v.display_text
            from public.tariff_assignments a
            join public.tariffs tf on tf.id = a.tariff_id and tf.status = 'active'
            join lateral (select * from public.tariff_versions v where v.tariff_id = tf.id order by v.version desc limit 1) v on true
            where a.tenant_id = p.tenant_id and a.audience in ('all', 'ad_hoc')
              and a.valid_from <= now() and (a.valid_to is null or a.valid_to > now())
              and (a.scope_type = 'tenant'
                   or (a.scope_type = 'location' and a.location_id = p.location_id)
                   or (a.scope_type = 'charge_point' and a.charge_point_id = p.charge_point_id))
            order by case a.scope_type when 'charge_point' then 3 when 'location' then 2 else 1 end desc,
                     case a.audience when 'ad_hoc' then 2 else 1 end desc, a.priority desc, a.created_at desc
            limit 1) as tariff_text
    from pts p
  )
  select p.location_id, p.tenant_id, p.operator_name, p.site_name, p.site_type, p.address, p.city, p.lat, p.lng, p.distance_km,
         p.charge_point_id, p.charge_point_name, p.connection_state,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', k.id, 'ocpp_connector_id', k.ocpp_connector_id, 'type', k.connector_type,
                     'max_kw', k.max_kw, 'status', case when p.connection_state = 'online' then k.status else 'Offline' end)
                   order by k.ocpp_connector_id)
                  from public.connectors k where k.charge_point_id = p.charge_point_id), '[]'::jsonb),
         t.tariff_text,
         coalesce(t.tariff_text ilike 'free%', false)
  from pts p
  left join tariff t on t.charge_point_id = p.charge_point_id
  where p.distance_km is null or p.distance_km <= p_radius_km
  order by p.distance_km nulls last, p.site_name, p.charge_point_name
  limit p_limit;
$$;

revoke execute on function public.driver_nearby_chargers(double precision, double precision, double precision, int) from anon, public;
grant execute on function public.driver_nearby_chargers(double precision, double precision, double precision, int) to authenticated;

-- Branding + membership context for one site.
create or replace function public.driver_site_context(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'location_id', l.id,
    'tenant_id', l.tenant_id,
    'site_name', l.name,
    'operator_name', coalesce(ts.app_name, t.name),
    'logo_path', ts.logo_path,
    'theme', coalesce(ts.theme, '{}'::jsonb),
    'support_email', ts.support_email,
    'support_phone', ts.support_phone,
    -- Is this driver already a member here (has a tag for this tenant)?
    'member_tag_id', (select tg.id from public.id_tags tg
                      where tg.tenant_id = l.tenant_id and tg.driver_user_id = auth.uid() and tg.status = 'active' limit 1),
    'groups', coalesce((select jsonb_agg(g.name) from public.driver_group_members m
                        join public.driver_groups g on g.id = m.driver_group_id
                        where m.tenant_id = l.tenant_id and (m.driver_user_id = auth.uid()
                          or m.id_tag_id in (select tg.id from public.id_tags tg where tg.tenant_id = l.tenant_id and tg.driver_user_id = auth.uid()))), '[]'::jsonb)
  )
  from public.locations l
  join public.tenants t on t.id = l.tenant_id
  left join public.tenant_settings ts on ts.tenant_id = t.id
  where l.id = p_location_id;
$$;

revoke execute on function public.driver_site_context(uuid) from anon, public;
grant execute on function public.driver_site_context(uuid) to authenticated;

-- ── Membership: join a site by code ─────────────────────────────────────────
-- A tenant issues join codes (a condo's residents get one on the notice
-- board). Redeeming one creates the driver's virtual tag for that tenant,
-- puts it in the code's driver group, and binds it to the code's billing
-- account (or a new individual account for the driver).

create table public.driver_join_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  label text,
  location_id uuid references public.locations (id) on delete cascade,
  driver_group_id uuid references public.driver_groups (id) on delete set null,
  billing_account_id uuid references public.billing_accounts (id) on delete set null,
  max_uses int,
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index driver_join_codes_tenant_id_idx on public.driver_join_codes (tenant_id);
create index driver_join_codes_location_idx on public.driver_join_codes (location_id);
create index driver_join_codes_group_idx on public.driver_join_codes (driver_group_id);
create index driver_join_codes_account_idx on public.driver_join_codes (billing_account_id);

alter table public.driver_join_codes enable row level security;

create policy driver_join_codes_select on public.driver_join_codes
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy driver_join_codes_insert on public.driver_join_codes
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy driver_join_codes_update on public.driver_join_codes
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy driver_join_codes_delete on public.driver_join_codes
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- Ensures the driver has one active virtual tag for a tenant; returns it.
create or replace function public.driver_ensure_tag(p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tag uuid;
  v_name text;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select id into v_tag from public.id_tags
  where tenant_id = p_tenant and driver_user_id = v_user and status = 'active' limit 1;
  if v_tag is not null then return v_tag; end if;

  select coalesce(display_name, '') into v_name from public.driver_profiles where user_id = v_user;
  -- 'APP-' + 16 hex chars = 20 chars, the OCPP idTag ceiling.
  insert into public.id_tags (tenant_id, tag, label, kind, status, driver_user_id)
  values (p_tenant, 'APP-' || upper(encode(extensions.gen_random_bytes(8), 'hex')),
          nullif('App · ' || v_name, 'App · '), 'virtual', 'active', v_user)
  returning id into v_tag;
  return v_tag;
end;
$$;

revoke execute on function public.driver_ensure_tag(uuid) from anon, public, authenticated;

create or replace function public.driver_join_site(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  c record;
  v_tag uuid;
  v_account uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into c from public.driver_join_codes
  where code = upper(btrim(p_code)) and active
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses < max_uses);
  if not found then
    raise exception 'That code is not valid' using errcode = '22023';
  end if;

  v_tag := public.driver_ensure_tag(c.tenant_id);

  if c.driver_group_id is not null then
    insert into public.driver_group_members (tenant_id, driver_group_id, id_tag_id)
    values (c.tenant_id, c.driver_group_id, v_tag)
    on conflict do nothing;
  end if;

  v_account := c.billing_account_id;
  if v_account is null then
    -- A personal account so the driver's sessions are invoiceable to them.
    insert into public.billing_accounts (tenant_id, kind, name, email, billing_model)
    select c.tenant_id, 'individual', coalesce(p.display_name, u.email, 'Driver'), u.email, 'postpaid_invoice'
    from auth.users u left join public.driver_profiles p on p.user_id = u.id
    where u.id = v_user
    returning id into v_account;
  end if;
  update public.id_tags set billing_account_id = coalesce(billing_account_id, v_account) where id = v_tag;

  update public.driver_join_codes set uses = uses + 1 where id = c.id;

  return jsonb_build_object('tenant_id', c.tenant_id, 'location_id', c.location_id, 'tag_id', v_tag, 'label', c.label);
end;
$$;

revoke execute on function public.driver_join_site(text) from anon, public;
grant execute on function public.driver_join_site(text) to authenticated;

-- ── Start / stop from the app ───────────────────────────────────────────────
-- Inserts the remote command the gateway acts on. The driver never touches
-- remote_commands directly: the function decides whether this driver may
-- start this charger (member, or free tariff — until Phase 5 adds payment).

create or replace function public.driver_start_session(p_charge_point_id uuid, p_ocpp_connector_id int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  cp record;
  v_tag record;
  v_tariff_text text;
  v_cmd uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select cp1.id, cp1.tenant_id, cp1.location_id, cp1.connection_state, cp1.lifecycle
  into cp from public.charge_points cp1 where cp1.id = p_charge_point_id;
  if not found or cp.lifecycle <> 'active' then
    raise exception 'Charger not available' using errcode = '22023';
  end if;
  if cp.connection_state <> 'online' then
    raise exception 'Charger is offline' using errcode = '22023';
  end if;
  if exists (select 1 from public.charging_sessions s
             where s.charge_point_id = cp.id and s.ocpp_connector_id = p_ocpp_connector_id and s.ended_at is null) then
    raise exception 'This connector is already in use' using errcode = '22023';
  end if;

  select t.id, t.tag, t.billing_account_id into v_tag from public.id_tags t
  where t.tenant_id = cp.tenant_id and t.driver_user_id = v_user and t.status = 'active' limit 1;

  if v_tag.id is null then
    -- Not a member: only a free tariff can be started without a way to pay.
    select r.tariff_text into v_tariff_text
    from public.driver_nearby_chargers() r where r.charge_point_id = cp.id;
    if v_tariff_text is null or v_tariff_text not ilike 'free%' then
      raise exception 'Join this site with its code to charge here (payments arrive in a later release)'
        using errcode = '42501';
    end if;
    v_tag.id := public.driver_ensure_tag(cp.tenant_id);
    select t.tag into v_tag.tag from public.id_tags t where t.id = v_tag.id;
  end if;

  insert into public.remote_commands (tenant_id, charge_point_id, action, payload, requested_by)
  values (cp.tenant_id, cp.id, 'RemoteStartTransaction',
          jsonb_build_object('idTag', v_tag.tag, 'connectorId', p_ocpp_connector_id), v_user)
  returning id into v_cmd;

  return jsonb_build_object('command_id', v_cmd, 'tag_id', v_tag.id);
end;
$$;

revoke execute on function public.driver_start_session(uuid, int) from anon, public;
grant execute on function public.driver_start_session(uuid, int) to authenticated;

create or replace function public.driver_stop_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s record;
  v_cmd uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select s1.id, s1.tenant_id, s1.charge_point_id, s1.ocpp_transaction_id, s1.ended_at
  into s
  from public.charging_sessions s1
  join public.id_tags t on t.id = s1.id_tag_id
  where s1.id = p_session_id and t.driver_user_id = v_user;
  if not found then
    raise exception 'Session not found' using errcode = '42704';
  end if;
  if s.ended_at is not null then
    raise exception 'Session already ended' using errcode = '22023';
  end if;

  insert into public.remote_commands (tenant_id, charge_point_id, action, payload, requested_by)
  values (s.tenant_id, s.charge_point_id, 'RemoteStopTransaction',
          jsonb_build_object('transactionId', s.ocpp_transaction_id), v_user)
  returning id into v_cmd;

  return jsonb_build_object('command_id', v_cmd);
end;
$$;

revoke execute on function public.driver_stop_session(uuid) from anon, public;
grant execute on function public.driver_stop_session(uuid) to authenticated;

-- The gateway records app-started sessions with their real source.
comment on column public.charging_sessions.start_source is
  'cable · rfid · remote (operator) · app (driver app via driver_start_session) · unknown';
