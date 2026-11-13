-- The sessions list as an operator reads it: every session with its site,
-- charger, gun, driver, vehicle number, payer and discount in one row.
--
-- Driver emails live in auth.users, which the browser cannot read, so the
-- join happens here. Scoped to the caller's operator; emails and phones are
-- only returned to operators and above (viewers see the rest).

-- What the whitelist discount took off, so "amount", "discount" and "final
-- amount" can be shown and exported without re-pricing. Written by the
-- gateway with the rest of the session cost (CLAUDE.md §6).
alter table public.charging_sessions add column amount_discount numeric;
comment on column public.charging_sessions.amount_discount is
  'Whitelist discount taken off this session, in major currency units. amount_gross is after discount.';

alter table public.cdrs add column discount_sen bigint not null default 0 check (discount_sen >= 0);
comment on column public.cdrs.discount_sen is
  'Whitelist discount already taken off total_sen, in minor units. List price = total_sen + discount_sen.';

create function public.admin_list_sessions(
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
begin
  if v_tenant is null then
    raise exception 'No tenant in session' using errcode = '42501';
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
      -- A company vehicle the charger recognised, else the plate the driver
      -- entered in the app.
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
      and (p_from is null or s.started_at >= p_from)
      and (p_to is null or s.started_at < p_to)
    order by s.started_at desc
    limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end;
$$;

revoke execute on function public.admin_list_sessions(uuid, uuid, timestamptz, timestamptz, int)
  from anon, public;
grant execute on function public.admin_list_sessions(uuid, uuid, timestamptz, timestamptz, int)
  to authenticated;
