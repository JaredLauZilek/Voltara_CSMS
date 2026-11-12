-- Chargers are identified by what is on the unit, not by a made-up name:
-- operators by the charge point ID and serial number, drivers by the car park
-- lot a gun serves. `name` stops being collected or shown.
--
-- Serial numbers: `registered_serial` is what the operator enters (required
-- for new chargers); `serial_number` stays what the charger reports at boot,
-- written by the gateway (CLAUDE.md §6). If the two differ, the unit using
-- this ID may not be the one that was registered.

alter table public.charge_points alter column name drop not null;

comment on column public.charge_points.name is
  'Legacy free-text name: no longer collected or displayed. Chargers are identified by ocpp_identity; guns by connectors.parking_lot.';

alter table public.charge_points
  add column registered_serial text
    check (registered_serial is null or char_length(registered_serial) between 1 and 64);

comment on column public.charge_points.registered_serial is
  'Serial number entered by the operator at registration. serial_number is what the charger reports at boot.';

-- Serials are unique within an operator. Not across operators: a global check
-- would tell one tenant which serials another tenant holds.
create unique index charge_points_tenant_serial_key
  on public.charge_points (tenant_id, lower(registered_serial))
  where registered_serial is not null;

-- ── register_charge_point(): serial required, name optional ────────────────
-- Same parameters as before plus p_serial_number at the end; p_name gains a
-- default. The old form is dropped so the PostgREST call stays unambiguous.

drop function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb);

create function public.register_charge_point(
  p_name text default null,
  p_location_id uuid default null,
  p_ocpp_identity text default null,
  p_connector_count int default 1,
  p_connector_type text default 'Type2',
  p_max_kw numeric default null,
  p_model_id uuid default null,
  -- [{ "connector_type": "CCS2", "parking_lot": "B1-12" }, …] — one entry per
  -- gun, in connector order. When given, it decides the gun count.
  p_guns jsonb default null,
  p_serial_number text default null
)
returns table (charge_point_id uuid, ocpp_identity text, auth_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_serial text := nullif(btrim(p_serial_number), '');
  v_identity text;
  v_key text;
  v_cp uuid;
  v_evse uuid;
  v_count int;
  v_gun jsonb;
  n int;
begin
  if v_tenant is null then
    raise exception 'No tenant in session' using errcode = '42501';
  end if;
  if not public.is_tenant_admin() then
    raise exception 'Only owners and admins may register chargers' using errcode = '42501';
  end if;

  if v_serial is null then
    raise exception 'A serial number is required' using errcode = '22023';
  end if;
  if char_length(v_serial) > 64 then
    raise exception 'A serial number is at most 64 characters' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.charge_points
    where tenant_id = v_tenant and lower(registered_serial) = lower(v_serial)
  ) then
    raise exception 'Serial number "%" is already registered', v_serial using errcode = '23505';
  end if;

  if p_guns is not null and jsonb_typeof(p_guns) <> 'array' then
    raise exception 'Guns must be a list' using errcode = '22023';
  end if;
  v_count := coalesce(jsonb_array_length(p_guns), p_connector_count);
  if v_count < 1 or v_count > 16 then
    raise exception 'A charger has between 1 and 16 guns' using errcode = '22023';
  end if;

  if p_model_id is not null
     and not exists (select 1 from public.charge_point_models where id = p_model_id) then
    raise exception 'Unknown charger model' using errcode = '22023';
  end if;

  -- Many installers set the charger's OCPP ID to its serial number; default
  -- to that when the caller did not supply one.
  v_identity := coalesce(
    nullif(btrim(p_ocpp_identity), ''),
    left(regexp_replace(upper(v_serial), '[^A-Z0-9]+', '-', 'g'), 48)
  );
  v_identity := btrim(v_identity, '-');

  if v_identity !~ '^[A-Za-z0-9*_=:+|@.-]{3,48}$' then
    raise exception 'Charge point ID must be 3-48 characters, letters, digits or - _ . : = + | @ *'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.charge_points where charge_points.ocpp_identity = v_identity) then
    -- Identities are globally unique: the gateway resolves the tenant from the
    -- identity before authentication, so two tenants cannot share one.
    raise exception 'Charge point ID "%" is already in use', v_identity using errcode = '23505';
  end if;

  if p_location_id is not null and not exists (
    select 1 from public.locations
    where id = p_location_id and locations.tenant_id = v_tenant
  ) then
    raise exception 'That location does not belong to your operator' using errcode = '42501';
  end if;

  -- 16 bytes of entropy as 32 hex characters: comfortably inside the 40-char
  -- AuthorizationKey ceiling that some 1.6 firmware silently truncates at.
  v_key := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.charge_points (
    tenant_id, location_id, ocpp_identity, name, registered_serial, model_id, lifecycle,
    security_profile, auth_key_hash
  ) values (
    v_tenant, p_location_id, v_identity, nullif(btrim(p_name), ''), v_serial, p_model_id,
    'pending', 2, extensions.crypt(v_key, extensions.gen_salt('bf'))
  )
  returning id into v_cp;

  for n in 1..v_count loop
    v_gun := coalesce(p_guns -> (n - 1), '{}'::jsonb);

    insert into public.evses (tenant_id, charge_point_id, evse_number)
    values (v_tenant, v_cp, n)
    returning id into v_evse;

    insert into public.connectors (
      tenant_id, evse_id, charge_point_id, ocpp_connector_id, connector_type, max_kw, parking_lot
    ) values (
      v_tenant, v_evse, v_cp, n,
      coalesce(nullif(v_gun ->> 'connector_type', ''), p_connector_type, 'Type2'),
      p_max_kw,
      nullif(btrim(v_gun ->> 'parking_lot'), '')
    );
  end loop;

  insert into public.audit_log (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, after)
  values (
    v_tenant, auth.uid(), 'user', 'charge_point.registered', 'charge_point', v_cp::text,
    jsonb_build_object('ocpp_identity', v_identity, 'serial', v_serial, 'connectors', v_count,
                       'model_id', p_model_id)
  );

  return query select v_cp, v_identity, v_key;
end;
$$;

revoke execute on function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb, text)
  from anon, public;
grant execute on function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb, text)
  to authenticated;

comment on function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb, text) is
  'Registers a charge point (serial, model, per-gun connector type and car park lot) for the caller''s tenant and returns its one-time auth key. The plaintext is never stored.';

-- ── Driver discovery: guns carry their car park lot ─────────────────────────
-- Same signature; `charge_point_name` now carries the charge point ID (names
-- are gone) and each connector gains `parking_lot`, which is what the driver
-- app shows.

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

-- ── Revenue summary: chargers by charge point ID ────────────────────────────

create or replace function public.revenue_summary(p_from date, p_to date)
returns table (
  location_id uuid, location_name text, charge_point_id uuid, charge_point_name text,
  driver_group_id uuid, driver_group_name text,
  sessions int, unbillable_sessions int, energy_wh bigint, idle_s bigint,
  subtotal_sen bigint, tax_sen bigint, total_sen bigint
)
language sql
stable
set search_path = ''
as $$
  select c.location_id, l.name, c.charge_point_id, cp.ocpp_identity, c.driver_group_id, g.name,
         count(*)::int, count(*) filter (where not c.billable)::int,
         coalesce(sum(c.total_energy_wh), 0), coalesce(sum(c.total_parking_time_s), 0),
         coalesce(sum(c.subtotal_sen) filter (where c.billable), 0),
         coalesce(sum(c.tax_sen) filter (where c.billable), 0),
         coalesce(sum(c.total_sen) filter (where c.billable), 0)
  from public.cdrs c
  left join public.locations l on l.id = c.location_id
  left join public.charge_points cp on cp.id = c.charge_point_id
  left join public.driver_groups g on g.id = c.driver_group_id
  where not c.credit
    and (c.start_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
  group by 1, 2, 3, 4, 5, 6;
$$;
