-- Two operator accounts for local development, one per country, so both
-- country set-ups can be tried side by side:
--
--   Voltara Singapore  (SG · SGD · GST)   the seeded dev login (user …9991)
--   Voltara Malaysia   (MY · MYR · SST)   jaredmy@…, password 123456
--
-- An operator's country is fixed when the platform creates the account
-- (tenants.country, immutable). Dev-only: applied by `pnpm dev` and
-- `pnpm db:demo-fleet`, never against staging or production. Idempotent.

begin;

-- ── The Malaysian operator is the seeded tenant, with all its demo data ─────
update public.tenants set name = 'Voltara Malaysia'
where id = '11111111-1111-4111-8111-111111111111' and name = 'Voltara';

-- ── The Singapore operator ──────────────────────────────────────────────────
insert into public.tenants (id, slug, name, is_first_party, country) values
  ('11111111-1111-4111-8111-111111111112', 'voltara-sg', 'Voltara Singapore', true, 'SG')
on conflict (id) do nothing;

insert into public.tenant_settings (
  tenant_id, app_name, legal_name, business_registration_no, support_email, support_phone,
  default_currency, address
) values (
  '11111111-1111-4111-8111-111111111112', 'Voltara Charge', 'Voltara Charging Pte. Ltd.',
  '202612345K', 'support@voltaracharging.com', '+65 6123 4567', 'SGD',
  E'60 Paya Lebar Road\n#07-54 Paya Lebar Square\nSingapore 409051'
)
on conflict (tenant_id) do nothing;

-- ── Logins ──────────────────────────────────────────────────────────────────
-- The seeded dev login moves to the Singapore operator; a second login owns
-- the Malaysian one.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-99999999999a',
  'authenticated', 'authenticated', 'jaredmy@voltara.com.my',
  extensions.crypt('123456', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true,
                     'phone_verified', false),
  now(), now(), now()
from auth.users u
where u.id = '99999999-9999-4999-8999-99999999999a'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

update public.memberships set tenant_id = '11111111-1111-4111-8111-111111111112'
where user_id = '99999999-9999-4999-8999-999999999991'
  and tenant_id = '11111111-1111-4111-8111-111111111111';

insert into public.memberships (user_id, tenant_id, role) values
  ('99999999-9999-4999-8999-99999999999a', '11111111-1111-4111-8111-111111111111', 'owner')
on conflict do nothing;

-- ── Singapore demo data ─────────────────────────────────────────────────────
-- GST at 9%, prices shown inclusive; one tariff at S$ 0.55/kWh.
insert into public.tax_profiles (id, tenant_id, name, code, rate_bps, is_default) values
  ('aaaa0001-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111112',
   'GST 9%', 'GST', 900, true)
on conflict (id) do nothing;

insert into public.tariffs (id, tenant_id, name, description, status, currency) values
  ('aaaa0002-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111112', 'Standard',
   'S$ 0.55/kWh · idle S$ 0.50/min after 15 min', 'active', 'SGD')
on conflict (id) do nothing;

insert into public.tariff_versions (
  id, tenant_id, tariff_id, version, elements, tax_included, tax_profile_id, display_text
) values (
  'aaaa0003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111112',
  'aaaa0002-0000-4000-8000-000000000003', 1,
  '[{"price_components":[{"type":"ENERGY","price_sen":55,"step_size":1}]},
    {"price_components":[{"type":"PARKING_TIME","price_sen":3000,"step_size":60}],"restrictions":{"grace_period_s":900}}]'::jsonb,
  true, 'aaaa0001-0000-4000-8000-000000000003', 'S$ 0.55/kWh · idle S$ 0.50/min after 15 min'
)
on conflict (id) do nothing;

insert into public.tariff_assignments (id, tenant_id, tariff_id, scope_type, audience, priority) values
  ('aaaa0004-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111112',
   'aaaa0002-0000-4000-8000-000000000003', 'tenant', 'all', 0)
on conflict (id) do nothing;

insert into public.locations (id, tenant_id, name, address, city, postcode, site_type, lat, lng) values
  ('33333333-3333-4333-8333-333333333341', '11111111-1111-4111-8111-111111111112',
   'Paya Lebar Square', '60 Paya Lebar Road', 'Singapore', '409051', 'public', 1.3187, 103.8925),
  ('33333333-3333-4333-8333-333333333342', '11111111-1111-4111-8111-111111111112',
   'The Tampines Trilliant', '21 Tampines Central 7', 'Singapore', '528769', 'condo', 1.3560, 103.9440)
on conflict (id) do nothing;

create temp table demo_sg_fleet (
  identity text, location_id uuid, model_id uuid, connector_type text, max_kw numeric,
  online boolean, statuses text[], lots text[]
) on commit drop;

insert into demo_sg_fleet values
  ('VSG-PL-01', '33333333-3333-4333-8333-333333333341', '55555555-5555-4555-8555-555555555551',
   'Type2', 22, true, '{Available,Charging}', '{B2-101,B2-102}'),
  ('VSG-PL-DC1', '33333333-3333-4333-8333-333333333341', '55555555-5555-4555-8555-555555555553',
   'CCS2', 120, true, '{Charging,Available}', '{B2-110,B2-111}'),
  ('VSG-TT-01', '33333333-3333-4333-8333-333333333342', '55555555-5555-4555-8555-555555555552',
   'Type2', 7.4, true, '{Available}', '{B1-23}'),
  ('VSG-TT-02', '33333333-3333-4333-8333-333333333342', '55555555-5555-4555-8555-555555555552',
   'Type2', 7.4, false, '{Offline}', '{B1-24}');

insert into public.charge_points (
  id, tenant_id, location_id, ocpp_identity, name, model_id, ocpp_version, lifecycle,
  connection_state, last_seen_at, last_boot_at, vendor_reported, model_reported
)
select
  md5('demo-fleet:' || f.identity)::uuid, '11111111-1111-4111-8111-111111111112',
  f.location_id, f.identity, f.identity, f.model_id, '1.6', 'active',
  case when f.online then 'online' else 'offline' end,
  case when f.online then now() else now() - interval '3 hours' end,
  now() - interval '2 days', v.name, m.name
from demo_sg_fleet f
join public.charge_point_models m on m.id = f.model_id
join public.charge_point_vendors v on v.id = m.vendor_id
on conflict (ocpp_identity) do nothing;

insert into public.evses (id, tenant_id, charge_point_id, evse_number)
select
  md5('demo-fleet:' || f.identity || ':evse:' || s.n)::uuid,
  '11111111-1111-4111-8111-111111111112', md5('demo-fleet:' || f.identity)::uuid, s.n
from demo_sg_fleet f, unnest(f.statuses) with ordinality as s(status, n)
on conflict do nothing;

insert into public.connectors (
  id, tenant_id, evse_id, charge_point_id, ocpp_connector_id, connector_type, max_kw,
  status, status_updated_at, parking_lot
)
select
  md5('demo-fleet:' || f.identity || ':connector:' || s.n)::uuid,
  '11111111-1111-4111-8111-111111111112',
  md5('demo-fleet:' || f.identity || ':evse:' || s.n)::uuid,
  md5('demo-fleet:' || f.identity)::uuid,
  s.n, f.connector_type, f.max_kw, s.status, now() - (s.n * interval '9 minutes'), f.lots[s.n]
from demo_sg_fleet f, unnest(f.statuses) with ordinality as s(status, n)
on conflict do nothing;

-- A Singapore company, with the identity fields a Singapore invoice needs.
insert into public.billing_accounts (
  id, tenant_id, kind, name, legal_name, business_registration_no, sst_registration_no,
  email, phone, billing_model, address, notes
) values (
  md5('demo-company:merlion')::uuid, '11111111-1111-4111-8111-111111111112', 'corporate',
  'Merlion Mobility', 'Merlion Mobility Pte. Ltd.', '201812345Z', '201812345Z',
  'finance@merlionmobility.example', '+65 6222 0100', 'postpaid_invoice',
  E'1 Raffles Place\n#20-61 One Raffles Place\nSingapore 048616', 'Demo company.'
)
on conflict (id) do nothing;

insert into auth.users (
  instance_id, id, aud, role, email, phone, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', md5('demo-driver:' || d.key)::uuid,
  'authenticated', 'authenticated', d.email, d.phone, '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('weijie', 'weijie.lim@example.com', '6591230001'),
  ('nurul', 'nurul.huda@example.com', '6591230002'),
  ('rachel', 'rachel.ong@example.com', '6591230003')
) as d(key, email, phone)
on conflict do nothing;

insert into public.driver_profiles (user_id, display_name, phone)
select md5('demo-driver:' || d.key)::uuid, d.name, d.phone
from (values
  ('weijie', 'Lim Wei Jie', '6591230001'),
  ('nurul', 'Nurul Huda', '6591230002'),
  ('rachel', 'Rachel Ong', '6591230003')
) as d(key, name, phone)
on conflict (user_id) do nothing;

insert into public.id_tags (id, tenant_id, tag, label, kind, driver_user_id, billing_account_id)
select
  md5('demo-tag:sg:' || d.kind || ':' || d.key)::uuid, '11111111-1111-4111-8111-111111111112',
  d.tag, d.name, d.kind, md5('demo-driver:' || d.key)::uuid,
  case when d.company then md5('demo-company:merlion')::uuid end
from (values
  ('weijie', 'Lim Wei Jie', 'virtual', 'APP-' || upper(left(md5('demo-app:sg:weijie'), 16)), true),
  ('weijie', 'Lim Wei Jie', 'rfid', 'SG-CARD-0001', true),
  ('nurul', 'Nurul Huda', 'virtual', 'APP-' || upper(left(md5('demo-app:sg:nurul'), 16)), true),
  ('rachel', 'Rachel Ong', 'virtual', 'APP-' || upper(left(md5('demo-app:sg:rachel'), 16)), false)
) as d(key, name, kind, tag, company)
on conflict do nothing;

insert into public.vehicles (id, tenant_id, billing_account_id, plate, label)
select md5('demo-vehicle:' || v.plate)::uuid, '11111111-1111-4111-8111-111111111112',
       md5('demo-company:merlion')::uuid, v.plate, v.label
from (values ('SMX1234A', 'Tesla Model 3'), ('SNB5678C', 'Hyundai Ioniq 5')) as v(plate, label)
on conflict do nothing;

-- Residents of the condo: private site, 15% off energy.
with created as (
  insert into public.driver_groups (id, tenant_id, name, kind, description, discount_bps) values
    (md5('demo-whitelist:trilliant')::uuid, '11111111-1111-4111-8111-111111111112',
     'Trilliant residents', 'residents', 'Residents of The Tampines Trilliant. 15% off energy.', 1500)
  on conflict do nothing
  returning id
)
update public.locations set is_private = true
where id = '33333333-3333-4333-8333-333333333342' and exists (select 1 from created);

insert into public.driver_group_locations (tenant_id, driver_group_id, location_id)
select '11111111-1111-4111-8111-111111111112', g.id, '33333333-3333-4333-8333-333333333342'
from public.driver_groups g where g.id = md5('demo-whitelist:trilliant')::uuid
on conflict do nothing;

insert into public.driver_group_members (tenant_id, driver_group_id, driver_user_id)
select '11111111-1111-4111-8111-111111111112', g.id, md5('demo-driver:rachel')::uuid
from public.driver_groups g where g.id = md5('demo-whitelist:trilliant')::uuid
on conflict do nothing;

commit;
