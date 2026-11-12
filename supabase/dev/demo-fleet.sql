-- Demo fleet for local development: chargers that are already "connected",
-- with connectors spread across every status, so screens can be built and
-- tried without hardware or the simulator.
--
-- Dev-only. Not part of seed.sql (the integration suite's fixtures stay
-- minimal) and never run against staging or production. Applied by
-- `pnpm dev` and `pnpm db:demo-fleet`; idempotent — rows that already exist
-- are left alone, so statuses changed by later testing are not reset.
--
-- These identities never connect to the gateway, so nothing overwrites the
-- runtime state written here. Ids are md5-derived from the identity so a
-- re-run lands on the same rows.

begin;

create temp table demo_fleet (
  identity text,
  name text,
  location_id uuid,
  model_id uuid,
  connector_type text,
  max_kw numeric,
  online boolean,
  statuses text[]
) on commit drop;

-- Voltara HQ (workplace) and Vantage Residences (condo), both Voltara-tenant
-- locations from seed.sql. Models: 555…551 Virtual 22 kW AC, 555…552 Autel
-- 7.4 kW wallbox, 555…553 Star Charge 120 kW DC.
insert into demo_fleet values
  ('VLT-HQ-02', 'HQ Bay 2 — Twin AC', '33333333-3333-4333-8333-333333333331',
   '55555555-5555-4555-8555-555555555551', 'Type2', 22, true, '{Available,Charging}'),
  ('VLT-HQ-03', 'HQ Bay 3', '33333333-3333-4333-8333-333333333331',
   '55555555-5555-4555-8555-555555555551', 'Type2', 22, true, '{Preparing}'),
  ('VLT-HQ-DC1', 'HQ Rapid — DC', '33333333-3333-4333-8333-333333333331',
   '55555555-5555-4555-8555-555555555553', 'CCS2', 120, true, '{SuspendedEV,Finishing}'),
  ('VLT-HQ-05', 'HQ Bay 5 — Visitor', '33333333-3333-4333-8333-333333333331',
   '55555555-5555-4555-8555-555555555551', 'Type2', 22, true, '{Reserved}'),
  ('VLT-VR-01', 'Vantage B1 — Lots 12/13', '33333333-3333-4333-8333-333333333332',
   '55555555-5555-4555-8555-555555555552', 'Type2', 7.4, true, '{Available,Available}'),
  ('VLT-VR-02', 'Vantage B1 — Lot 14', '33333333-3333-4333-8333-333333333332',
   '55555555-5555-4555-8555-555555555552', 'Type2', 7.4, true, '{Charging}'),
  ('VLT-VR-03', 'Vantage B1 — Lot 15', '33333333-3333-4333-8333-333333333332',
   '55555555-5555-4555-8555-555555555552', 'Type2', 7.4, true, '{SuspendedEVSE}'),
  ('VLT-VR-04', 'Vantage B2 — Lot 30', '33333333-3333-4333-8333-333333333332',
   '55555555-5555-4555-8555-555555555552', 'Type2', 7.4, true, '{Unavailable}'),
  ('VLT-VR-05', 'Vantage B2 — Lot 31', '33333333-3333-4333-8333-333333333332',
   '55555555-5555-4555-8555-555555555552', 'Type2', 7.4, true, '{Faulted}'),
  ('VLT-VR-06', 'Vantage B2 — Lots 32/33', '33333333-3333-4333-8333-333333333332',
   '55555555-5555-4555-8555-555555555552', 'Type2', 7.4, false, '{Offline,Offline}');

insert into public.charge_points (
  id, tenant_id, location_id, ocpp_identity, name, model_id, ocpp_version, lifecycle,
  connection_state, last_seen_at, last_boot_at, vendor_reported, model_reported
)
select
  md5('demo-fleet:' || f.identity)::uuid,
  '11111111-1111-4111-8111-111111111111',
  f.location_id, f.identity, f.name, f.model_id, '1.6', 'active',
  case when f.online then 'online' else 'offline' end,
  case when f.online then now() else now() - interval '3 hours' end,
  now() - interval '2 days',
  v.name, m.name
from demo_fleet f
join public.charge_point_models m on m.id = f.model_id
join public.charge_point_vendors v on v.id = m.vendor_id
on conflict (ocpp_identity) do nothing;

-- One EVSE per connector, as OCPP 1.6 chargers report them.
insert into public.evses (id, tenant_id, charge_point_id, evse_number)
select
  md5('demo-fleet:' || f.identity || ':evse:' || s.n)::uuid,
  '11111111-1111-4111-8111-111111111111',
  md5('demo-fleet:' || f.identity)::uuid,
  s.n
from demo_fleet f, unnest(f.statuses) with ordinality as s(status, n)
on conflict do nothing;

insert into public.connectors (
  id, tenant_id, evse_id, charge_point_id, ocpp_connector_id, connector_type, max_kw,
  status, status_updated_at, last_error_code
)
select
  md5('demo-fleet:' || f.identity || ':connector:' || s.n)::uuid,
  '11111111-1111-4111-8111-111111111111',
  md5('demo-fleet:' || f.identity || ':evse:' || s.n)::uuid,
  md5('demo-fleet:' || f.identity)::uuid,
  s.n, f.connector_type, f.max_kw,
  s.status,
  now() - (s.n * interval '7 minutes'),
  case when s.status = 'Faulted' then 'GroundFailure' end
from demo_fleet f, unnest(f.statuses) with ordinality as s(status, n)
on conflict do nothing;

-- The car park lot each gun serves; only fills lots not set by hand since.
update public.connectors k set parking_lot = v.lot
from (values
  ('VLT-VR-01', 1, 'B1-12'), ('VLT-VR-01', 2, 'B1-13'), ('VLT-VR-02', 1, 'B1-14'),
  ('VLT-VR-03', 1, 'B1-15'), ('VLT-VR-04', 1, 'B2-30'), ('VLT-VR-05', 1, 'B2-31'),
  ('VLT-VR-06', 1, 'B2-32'), ('VLT-VR-06', 2, 'B2-33'),
  ('VLT-HQ-DC1', 1, 'P1-01'), ('VLT-HQ-DC1', 2, 'P1-02'), ('VLT-HQ-02', 1, 'P1-04'),
  ('VLT-HQ-02', 2, 'P1-05'), ('VLT-HQ-03', 1, 'P1-06'), ('VLT-HQ-05', 1, 'P1-08')
) as v(identity, gun, lot)
join public.charge_points cp on cp.ocpp_identity = v.identity
where k.charge_point_id = cp.id and k.ocpp_connector_id = v.gun and k.parking_lot is null;

-- ── Starter charger catalogue ───────────────────────────────────────────────
-- Brands and models for the Add Charger search. The common variant of each
-- model; specs only prefill the form. Dev data: the production catalogue is
-- curated by Voltara (service role) before launch — docs/roadmap.md §8.

insert into public.charge_point_vendors (name)
values ('ABB'), ('Autel'), ('Wallbox'), ('Schneider Electric'), ('Delta'), ('Alpitronic'),
       ('EVBox'), ('Zaptec'), ('Easee')
on conflict (name) do nothing;

insert into public.charge_point_models (vendor_id, name, power_kw, connector_count, connector_types)
select v.id, m.name, m.kw, m.guns, m.types
from (values
  ('ABB', 'Terra AC Wallbox 7.4 kW', 7.4, 1, '{Type2}'::text[]),
  ('ABB', 'Terra AC Wallbox 22 kW', 22, 1, '{Type2}'),
  ('ABB', 'Terra 54', 50, 2, '{CCS2,CHAdeMO}'),
  ('ABB', 'Terra 184', 180, 2, '{CCS2,CCS2}'),
  ('Autel', 'MaxiCharger AC Wallbox 22 kW', 22, 1, '{Type2}'),
  ('Wallbox', 'Pulsar Plus 7.4 kW', 7.4, 1, '{Type2}'),
  ('Wallbox', 'Pulsar Plus 22 kW', 22, 1, '{Type2}'),
  ('Wallbox', 'Commander 2 22 kW', 22, 1, '{Type2}'),
  ('Schneider Electric', 'EVlink Pro AC 7.4 kW', 7.4, 1, '{Type2}'),
  ('Schneider Electric', 'EVlink Pro AC 22 kW', 22, 1, '{Type2}'),
  ('Delta', 'AC MAX 7.4 kW', 7.4, 1, '{Type2}'),
  ('Delta', 'AC MAX 22 kW', 22, 1, '{Type2}'),
  ('Delta', 'DC Wallbox 25 kW', 25, 1, '{CCS2}'),
  ('Alpitronic', 'Hypercharger HYC150', 150, 2, '{CCS2,CCS2}'),
  ('Alpitronic', 'Hypercharger HYC300', 300, 2, '{CCS2,CCS2}'),
  ('EVBox', 'Elvi 22 kW', 22, 1, '{Type2}'),
  ('EVBox', 'BusinessLine 22 kW', 22, 2, '{Type2,Type2}'),
  ('Zaptec', 'Pro 22 kW', 22, 1, '{Type2}'),
  ('Easee', 'Charge 22 kW', 22, 1, '{Type2}')
) as m(vendor, name, kw, guns, types)
join public.charge_point_vendors v on v.name = m.vendor
on conflict (vendor_id, name) do nothing;

commit;
