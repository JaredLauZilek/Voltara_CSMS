-- ============================================================================
-- register_charge_point(): the admin portal's charger onboarding call.
--
-- The auth key is generated and hashed INSIDE the database and returned exactly
-- once. The browser never chooses the secret, and nothing but this response
-- ever holds the plaintext — `auth_key_hash` is a bcrypt digest, so a lost key
-- is re-issued, never recovered (CLAUDE.md §10).
--
-- SECURITY DEFINER because it must write the hash, so it authorises the caller
-- itself: tenant comes from the JWT, never from a parameter, and the role must
-- be admin or owner.
-- ============================================================================

create or replace function public.register_charge_point(
  p_name text,
  p_location_id uuid default null,
  p_ocpp_identity text default null,
  p_connector_count int default 1,
  p_connector_type text default 'Type2',
  p_max_kw numeric default null
)
returns table (charge_point_id uuid, ocpp_identity text, auth_key text)
language plpgsql
security definer
-- Empty search_path with everything schema-qualified: the hardened form for a
-- SECURITY DEFINER function. Note the quoting trap — `set search_path =
-- 'public, extensions'` sets ONE schema whose name contains commas, which
-- silently resolves nothing.
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_identity text;
  v_key text;
  v_cp uuid;
  v_evse uuid;
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

  if p_connector_count < 1 or p_connector_count > 16 then
    raise exception 'Connector count must be between 1 and 16' using errcode = '22023';
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
    tenant_id, location_id, ocpp_identity, name, lifecycle, security_profile, auth_key_hash
  ) values (
    v_tenant, p_location_id, v_identity, btrim(p_name), 'pending', 2,
    extensions.crypt(v_key, extensions.gen_salt('bf'))
  )
  returning id into v_cp;

  for n in 1..p_connector_count loop
    insert into public.evses (tenant_id, charge_point_id, evse_number)
    values (v_tenant, v_cp, n)
    returning id into v_evse;

    insert into public.connectors (
      tenant_id, evse_id, charge_point_id, ocpp_connector_id, connector_type, max_kw
    ) values (
      v_tenant, v_evse, v_cp, n, coalesce(p_connector_type, 'Type2'), p_max_kw
    );
  end loop;

  insert into public.audit_log (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, after)
  values (
    v_tenant, auth.uid(), 'user', 'charge_point.registered', 'charge_point', v_cp::text,
    jsonb_build_object('ocpp_identity', v_identity, 'connectors', p_connector_count)
  );

  return query select v_cp, v_identity, v_key;
end;
$$;

revoke execute on function public.register_charge_point(text, uuid, text, int, text, numeric) from anon, public;
grant execute on function public.register_charge_point(text, uuid, text, int, text, numeric) to authenticated;

comment on function public.register_charge_point(text, uuid, text, int, text, numeric) is
  'Registers a charge point for the caller''s tenant and returns its one-time auth key. The plaintext is never stored.';
