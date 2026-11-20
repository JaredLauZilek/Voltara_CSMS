-- The sessions report is read and downloaded a window at a time: at most 45
-- days per request, enforced here so no screen, export or script can ask the
-- database for a charger's whole history in one go. With no dates given it
-- returns the most recent 45 days.

create or replace function public.admin_list_sessions(
  p_location_id uuid default null,
  p_charge_point_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 2000
)
returns table (
  id uuid,
  ocpp_transaction_id int,
  status text,
  offline boolean,
  started_at timestamptz,
  ended_at timestamptz,
  energy_wh bigint,
  meter_start_wh bigint,
  amount_gross numeric,
  amount_tax numeric,
  amount_discount numeric,
  currency text,
  id_tag text,
  start_source text,
  charge_point_id uuid,
  charge_point_identity text,
  ocpp_connector_id int,
  connector_type text,
  max_kw numeric,
  parking_lot text,
  location_id uuid,
  location_name text,
  driver_user_id uuid,
  driver_name text,
  driver_email text,
  driver_phone text,
  vehicle_plate text,
  billing_account_id uuid,
  billing_account_name text,
  billing_account_kind text,
  driver_group_id uuid,
  driver_group_name text,
  discount_bps int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_contacts boolean := public.is_tenant_operator();
  v_to timestamptz := coalesce(p_to, now() + interval '1 day');
  v_from timestamptz := coalesce(p_from, coalesce(p_to, now()) - interval '45 days');
begin
  if v_tenant is null then
    raise exception 'No tenant in session' using errcode = '42501';
  end if;
  -- An hour of slack for day boundaries in the caller's timezone.
  if v_to - v_from > interval '45 days 1 hour' and p_to is not null and p_from is not null then
    raise exception 'Choose a date range of 45 days or less' using errcode = '22023';
  end if;
  if p_to is null then
    v_to := least(v_to, v_from + interval '45 days');
  end if;
  return query
    select
      s.id, s.ocpp_transaction_id, s.status, s.offline, s.started_at, s.ended_at,
      s.energy_wh, s.meter_start_wh, s.amount_gross, s.amount_tax, s.amount_discount, s.currency,
      s.id_tag, s.start_source,
      cp.id, cp.ocpp_identity, s.ocpp_connector_id, k.connector_type, k.max_kw, k.parking_lot,
      l.id, l.name,
      t.driver_user_id, p.display_name,
      case when v_contacts then u.email::text end,
      case when v_contacts then coalesce(u.phone, p.phone)::text end,
      coalesce(v.plate, p.vehicle_plate),
      b.id, b.name, b.kind,
      g.id, g.name,
      nullif(s.tariff_snapshot #>> '{resolved_by,discount_bps}', '')::int
    from public.charging_sessions s
    join public.charge_points cp on cp.id = s.charge_point_id
    left join public.locations l on l.id = cp.location_id
    left join public.connectors k on k.id = s.connector_id
    left join public.id_tags t on t.id = s.id_tag_id
    left join auth.users u on u.id = t.driver_user_id
    left join public.driver_profiles p on p.user_id = t.driver_user_id
    left join public.vehicles v on v.id_tag_id = s.id_tag_id and v.tenant_id = v_tenant
    left join public.billing_accounts b on b.id = s.billing_account_id
    left join public.driver_groups g on g.id = s.driver_group_id
    where s.tenant_id = v_tenant
      and (p_location_id is null or cp.location_id = p_location_id)
      and (p_charge_point_id is null or s.charge_point_id = p_charge_point_id)
      and s.started_at >= v_from
      and s.started_at < v_to
    order by s.started_at desc
    limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end;
$$;
