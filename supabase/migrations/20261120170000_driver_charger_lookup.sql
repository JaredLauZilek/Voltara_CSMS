-- Driver app: open one charger directly — from a QR code on the charger, or a
-- deep link — without it having to be in the "nearby" list first.
--
-- Both functions read through driver_nearby_chargers(), so everything that
-- decides what a driver may see (active chargers only, private sites only for
-- whitelisted accounts) is decided in exactly one place.

create function public.driver_get_charger(p_charge_point_id uuid)
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
  select n.*
  from public.driver_nearby_chargers(null, null, 100000, 1000000) n
  where n.charge_point_id = p_charge_point_id;
$$;

-- What a charger's QR code carries is its charge point ID (the same ID the
-- charger dials in with). Matching ignores case; an unknown, retired or
-- private-and-not-whitelisted charger simply is not found.
create function public.driver_find_charger_by_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select n.charge_point_id
  from public.driver_nearby_chargers(null, null, 100000, 1000000) n
  where upper(n.charge_point_name) = upper(btrim(p_code))
  limit 1;
$$;

revoke execute on function public.driver_get_charger(uuid) from anon, public;
grant execute on function public.driver_get_charger(uuid) to authenticated;
revoke execute on function public.driver_find_charger_by_code(text) from anon, public;
grant execute on function public.driver_find_charger_by_code(text) to authenticated;
