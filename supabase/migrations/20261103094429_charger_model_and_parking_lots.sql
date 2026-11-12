-- Registering a charger now records its catalogue model and, per gun, the car
-- park lot it serves — a twin-gun unit usually sits between two lots.
--
-- `parking_lot` is the operator's free-text label for the bay ("B1-12",
-- "Lot 12"): static asset data, written by the admin, never by the gateway.
-- Covered by the existing connectors RLS policies (update = tenant admin).

alter table public.connectors
  add column parking_lot text
    check (parking_lot is null or char_length(parking_lot) between 1 and 40);

comment on column public.connectors.parking_lot is
  'Car park lot/bay this gun serves, as labelled on site. Operator-entered; null = not recorded.';

-- ── register_charge_point(): + model, + per-gun type and lot ────────────────
-- Additive change to the function's interface: the old six-argument form is
-- dropped (two overloads would make the PostgREST call ambiguous) and the new
-- one keeps every old parameter, in order, with the same defaults.

drop function public.register_charge_point(text, uuid, text, int, text, numeric);

create function public.register_charge_point(
  p_name text,
  p_location_id uuid default null,
  p_ocpp_identity text default null,
  p_connector_count int default 1,
  p_connector_type text default 'Type2',
  p_max_kw numeric default null,
  p_model_id uuid default null,
  -- [{ "connector_type": "CCS2", "parking_lot": "B1-12" }, …] — one entry per
  -- gun, in connector order. When given, it decides the gun count.
  p_guns jsonb default null
)
returns table (charge_point_id uuid, ocpp_identity text, auth_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
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

  if p_name is null or btrim(p_name) = '' then
    raise exception 'A charger name is required' using errcode = '22023';
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

  -- Derive an identity from the name when the caller did not supply one.
  v_identity := coalesce(
    nullif(btrim(p_ocpp_identity), ''),
    left(regexp_replace(upper(btrim(p_name)), '[^A-Z0-9]+', '-', 'g'), 40)
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
    tenant_id, location_id, ocpp_identity, name, model_id, lifecycle, security_profile,
    auth_key_hash
  ) values (
    v_tenant, p_location_id, v_identity, btrim(p_name), p_model_id, 'pending', 2,
    extensions.crypt(v_key, extensions.gen_salt('bf'))
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
    jsonb_build_object('ocpp_identity', v_identity, 'connectors', v_count, 'model_id', p_model_id)
  );

  return query select v_cp, v_identity, v_key;
end;
$$;

revoke execute on function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb)
  from anon, public;
grant execute on function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb)
  to authenticated;

comment on function public.register_charge_point(text, uuid, text, int, text, numeric, uuid, jsonb) is
  'Registers a charge point (with its model and per-gun connector type and car park lot) for the caller''s tenant and returns its one-time auth key. The plaintext is never stored.';
