-- Charging management: who may charge where, and who pays.
--
--   Corporate charging  a company (billing account) is billed monthly for its
--                       drivers; a driver's app account, RFID cards and the
--                       company's vehicles all resolve to that one payer.
--   Whitelist           a driver group that covers named sites: the accounts
--                       on it may see and use a private site, with an optional
--                       discount on the energy price (10000 bps = free).
--
-- Drivers are app accounts (auth.users); operators add them by email or phone.
-- A vehicle's own identifier (Autocharge) is never typed in: the gateway
-- records what the charger read, and it is attached only with consent.

-- ── Private sites ───────────────────────────────────────────────────────────
alter table public.locations add column is_private boolean not null default false;
comment on column public.locations.is_private is
  'Hidden from the driver app and unusable except by accounts on a whitelist that covers this site.';

-- ── Whitelists: coverage and discount ───────────────────────────────────────
alter table public.driver_groups
  add column discount_bps int not null default 0 check (discount_bps between 0 and 10000);
comment on column public.driver_groups.discount_bps is
  'Discount on the energy price for members at the sites this whitelist covers, in basis points (10000 = free).';

create table public.driver_group_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  driver_group_id uuid not null references public.driver_groups (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (driver_group_id, location_id)
);
create index driver_group_locations_tenant_id_idx on public.driver_group_locations (tenant_id);
create index driver_group_locations_location_id_idx on public.driver_group_locations (location_id);

alter table public.driver_group_locations enable row level security;
create policy driver_group_locations_select on public.driver_group_locations
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy driver_group_locations_insert on public.driver_group_locations
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy driver_group_locations_delete on public.driver_group_locations
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
grant select, insert, delete on public.driver_group_locations to authenticated;

-- ── Companies: who may charge on the company's bill ────────────────────────
alter table public.billing_accounts
  add column charging_rule text not null default 'drivers'
    check (charging_rule in ('drivers', 'vehicles', 'vehicle_and_driver'));
comment on column public.billing_accounts.charging_rule is
  'drivers = any listed driver (app or card) · vehicles = only an enrolled vehicle · vehicle_and_driver = both must match.';

-- ── Vehicles ────────────────────────────────────────────────────────────────
-- The identifier a charger reads from a car is an id tag of kind 'vehicle'
-- ("VID:…"), so authorisation and billing resolve it like any other tag.
alter table public.id_tags drop constraint id_tags_kind_check;
alter table public.id_tags
  add constraint id_tags_kind_check check (kind in ('rfid', 'virtual', 'mac', 'vehicle'));

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts (id) on delete cascade,
  plate text not null check (char_length(plate) between 1 and 20),
  vin text check (vin is null or char_length(vin) between 5 and 20),
  label text,
  -- Set when the car's own identifier has been read by a charger and its use
  -- consented to; null = not enrolled for automatic recognition yet.
  id_tag_id uuid references public.id_tags (id) on delete set null,
  consent_at timestamptz,
  consent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index vehicles_tenant_plate_key on public.vehicles (tenant_id, upper(plate));
create index vehicles_tenant_id_idx on public.vehicles (tenant_id);
create index vehicles_billing_account_id_idx on public.vehicles (billing_account_id);
create index vehicles_id_tag_id_idx on public.vehicles (id_tag_id);

alter table public.vehicles enable row level security;
create policy vehicles_select on public.vehicles
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy vehicles_update on public.vehicles
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy vehicles_delete on public.vehicles
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
grant select, insert, update, delete on public.vehicles to authenticated;

-- What the charger read from the car at plug-in, written by the gateway
-- (CLAUDE.md §6). Evidence for enrolment; meaningless until consented to.
alter table public.charging_sessions add column vehicle_identifier text;
comment on column public.charging_sessions.vehicle_identifier is
  'Vehicle identifier the charger reported for this session (Autocharge "VID:…"), if any.';

-- ── Is this account on a whitelist covering the site? ───────────────────────
create function public.driver_on_whitelist(p_user uuid, p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1
    from public.driver_group_locations gl
    join public.driver_group_members m on m.driver_group_id = gl.driver_group_id
    where gl.location_id = p_location
      and (
        m.driver_user_id = p_user
        or m.id_tag_id in (select t.id from public.id_tags t where t.driver_user_id = p_user)
        or m.billing_account_id in (
          select t.billing_account_id from public.id_tags t
          where t.driver_user_id = p_user and t.billing_account_id is not null
        )
      )
  );
$$;
revoke execute on function public.driver_on_whitelist(uuid, uuid) from anon, public;
grant execute on function public.driver_on_whitelist(uuid, uuid) to authenticated;

-- ── Operators find a driver by email or phone ───────────────────────────────
-- Exact match only: an operator can confirm an address has an app account,
-- never browse accounts.
create function public.admin_find_driver(p_contact text)
returns table (user_id uuid, email text, phone text, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contact text := lower(btrim(coalesce(p_contact, '')));
  v_digits text := regexp_replace(coalesce(p_contact, ''), '[^0-9]', '', 'g');
begin
  if public.jwt_tenant_id() is null or not public.is_tenant_admin() then
    raise exception 'Only owners and admins may look up drivers' using errcode = '42501';
  end if;
  if v_contact = '' then return; end if;
  return query
    select u.id, u.email::text, u.phone::text, p.display_name
    from auth.users u
    left join public.driver_profiles p on p.user_id = u.id
    where lower(u.email) = v_contact
       or (length(v_digits) >= 8 and (
            regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_digits
            or regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_digits))
    limit 1;
end;
$$;
revoke execute on function public.admin_find_driver(text) from anon, public;
grant execute on function public.admin_find_driver(text) to authenticated;

-- ── Add a driver to a company and/or a whitelist ────────────────────────────
-- Makes sure the account has an app tag with this operator, then:
--   company   → every tag of that account here bills to it (one company per
--               account; adding to another moves it)
--   whitelist → the account becomes a member
create function public.admin_add_driver(
  p_contact text,
  p_billing_account_id uuid default null,
  p_driver_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_user uuid;
  v_name text;
begin
  select f.user_id, f.display_name into v_user, v_name from public.admin_find_driver(p_contact) f;
  if v_user is null then
    raise exception 'No app account uses that email or phone number. Ask the driver to sign up in the app first.'
      using errcode = '22023';
  end if;

  if p_billing_account_id is not null and not exists (
    select 1 from public.billing_accounts where id = p_billing_account_id and tenant_id = v_tenant
  ) then
    raise exception 'That company does not belong to your operator' using errcode = '42501';
  end if;
  if p_driver_group_id is not null and not exists (
    select 1 from public.driver_groups where id = p_driver_group_id and tenant_id = v_tenant
  ) then
    raise exception 'That whitelist does not belong to your operator' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.id_tags where tenant_id = v_tenant and driver_user_id = v_user
  ) then
    insert into public.id_tags (tenant_id, tag, label, kind, status, driver_user_id)
    values (v_tenant, 'APP-' || upper(encode(extensions.gen_random_bytes(8), 'hex')),
            nullif('App · ' || coalesce(v_name, ''), 'App · '), 'virtual', 'active', v_user);
  end if;

  if p_billing_account_id is not null then
    update public.id_tags set billing_account_id = p_billing_account_id
    where tenant_id = v_tenant and driver_user_id = v_user;
  end if;

  if p_driver_group_id is not null and not exists (
    select 1 from public.driver_group_members
    where driver_group_id = p_driver_group_id and driver_user_id = v_user
  ) then
    insert into public.driver_group_members (tenant_id, driver_group_id, driver_user_id)
    values (v_tenant, p_driver_group_id, v_user);
  end if;

  return v_user;
end;
$$;
revoke execute on function public.admin_add_driver(text, uuid, uuid) from anon, public;
grant execute on function public.admin_add_driver(text, uuid, uuid) to authenticated;

-- ── The operator's drivers, with how each can start a charge ────────────────
create function public.admin_list_drivers()
returns table (
  user_id uuid, email text, phone text, display_name text,
  billing_account_id uuid, tags jsonb, group_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
begin
  if v_tenant is null or not public.is_tenant_operator() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(u.phone, p.phone)::text, p.display_name,
           (array_agg(t.billing_account_id) filter (where t.billing_account_id is not null))[1],
           jsonb_agg(jsonb_build_object('id', t.id, 'tag', t.tag, 'kind', t.kind,
                                        'status', t.status, 'label', t.label) order by t.created_at),
           coalesce((select array_agg(m.driver_group_id) from public.driver_group_members m
                     where m.tenant_id = v_tenant and m.driver_user_id = u.id), '{}')
    from public.id_tags t
    join auth.users u on u.id = t.driver_user_id
    left join public.driver_profiles p on p.user_id = u.id
    where t.tenant_id = v_tenant
    group by u.id, u.email, u.phone, p.phone, p.display_name;
end;
$$;
revoke execute on function public.admin_list_drivers() from anon, public;
grant execute on function public.admin_list_drivers() to authenticated;

-- ── Driver discovery: private sites only for whitelisted accounts ───────────
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
    select cp.id as charge_point_id, cp.ocpp_identity as charge_point_name, cp.connection_state, cp.tenant_id, cp.location_id,
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
      -- A private site exists only for the accounts on a whitelist covering it.
      and (not l.is_private or public.driver_on_whitelist((select auth.uid()), l.id))
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
                     'max_kw', k.max_kw, 'parking_lot', k.parking_lot, 'status', case when p.connection_state = 'online' then k.status else 'Offline' end)
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
