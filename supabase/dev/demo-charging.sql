-- Demo data for Charging management: two companies with drivers, RFID cards
-- and vehicles, and two whitelists (one over a private site).
--
-- Dev-only, like demo-fleet.sql: applied by `pnpm dev` and
-- `pnpm db:demo-fleet`, never against staging or production. Idempotent —
-- rows that already exist are left alone. Everyone here is invented; the
-- driver accounts cannot sign in (no password, example.com addresses).

begin;

create temp table demo_drivers (
  key text, email text, phone text, name text, company text, card text
) on commit drop;

insert into demo_drivers values
  ('aiman',  'aiman.rahman@example.com',  '60123450001', 'Aiman Rahman',   'kinta', 'KL-CARD-0001'),
  ('mei',    'mei.ling.tan@example.com',  '60123450002', 'Tan Mei Ling',   'kinta', 'KL-CARD-0002'),
  ('kumar',  'kumar.siva@example.com',    '60123450003', 'Kumar Sivalingam', 'kinta', null),
  ('weijie', 'weijie.lim@example.com',    '6591230001',  'Lim Wei Jie',    'selat', 'SF-CARD-0001'),
  ('nurul',  'nurul.huda@example.com',    '6591230002',  'Nurul Huda',     'selat', null),
  ('daniel', 'daniel.wong@example.com',   '60123450006', 'Daniel Wong',    null,    null),
  ('priya',  'priya.nair@example.com',    '60123450007', 'Priya Nair',     null,    null);

-- App accounts, as if each had signed up in the driver app.
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
from demo_drivers d
on conflict do nothing;

insert into public.driver_profiles (user_id, display_name, phone)
select md5('demo-driver:' || d.key)::uuid, d.name, d.phone from demo_drivers d
on conflict (user_id) do nothing;

-- ── Corporate charging: two companies ───────────────────────────────────────
insert into public.billing_accounts (
  id, tenant_id, kind, name, legal_name, email, phone, billing_model, charging_rule, notes
) values
  (md5('demo-company:kinta')::uuid, '11111111-1111-4111-8111-111111111111', 'corporate',
   'Kinta Logistics', 'Kinta Logistics Sdn Bhd', 'accounts@kintalogistics.example', '60355550100',
   'postpaid_invoice', 'drivers', 'Demo company. Any listed driver may charge on the company bill.'),
  (md5('demo-company:selat')::uuid, '11111111-1111-4111-8111-111111111111', 'corporate',
   'Selat Fleet Services', 'Selat Fleet Services Pte Ltd', 'finance@selatfleet.example', '6562220100',
   'postpaid_invoice', 'vehicles', 'Demo company. Set to company vehicles only.')
on conflict (id) do nothing;

-- Each driver's app tag, tied to their company where they have one.
insert into public.id_tags (id, tenant_id, tag, label, kind, driver_user_id, billing_account_id)
select
  md5('demo-tag:app:' || d.key)::uuid, '11111111-1111-4111-8111-111111111111',
  'APP-' || upper(left(md5('demo-app:' || d.key), 16)), d.name, 'virtual',
  md5('demo-driver:' || d.key)::uuid,
  case when d.company is not null then md5('demo-company:' || d.company)::uuid end
from demo_drivers d
on conflict do nothing;

-- RFID cards for the drivers who carry one.
insert into public.id_tags (id, tenant_id, tag, label, kind, driver_user_id, billing_account_id)
select
  md5('demo-tag:card:' || d.key)::uuid, '11111111-1111-4111-8111-111111111111',
  d.card, d.name, 'rfid', md5('demo-driver:' || d.key)::uuid,
  md5('demo-company:' || d.company)::uuid
from demo_drivers d
where d.card is not null
on conflict do nothing;

-- One car already recognised by chargers (its identifier read at a charger,
-- then consented to); the rest are listed but not enrolled.
insert into public.id_tags (id, tenant_id, tag, label, kind, billing_account_id)
values (md5('demo-tag:vehicle:SMX1234A')::uuid, '11111111-1111-4111-8111-111111111111',
        'VID:8C1F64A1B2C3', 'SMX1234A', 'vehicle', md5('demo-company:selat')::uuid)
on conflict do nothing;

insert into public.vehicles (id, tenant_id, billing_account_id, plate, vin, label, id_tag_id, consent_at)
select md5('demo-vehicle:' || v.plate)::uuid, '11111111-1111-4111-8111-111111111111',
       md5('demo-company:' || v.company)::uuid, v.plate, v.vin, v.label,
       case when v.enrolled then md5('demo-tag:vehicle:' || v.plate)::uuid end,
       case when v.enrolled then now() - interval '9 days' end
from (values
  ('kinta', 'VKL 2481', null,                'BYD Atto 3',       false),
  ('kinta', 'VKL 7730', null,                'BYD Dolphin',      false),
  ('kinta', 'BRA 1905', 'LGXCE4CB5R0123456', 'BYD Seal',         false),
  ('selat', 'SMX1234A', 'LRW3F7EK4PC123456', 'Tesla Model 3',    true),
  ('selat', 'SNB5678C', null,                'Hyundai Ioniq 5',  false)
) as v(company, plate, vin, label, enrolled)
on conflict do nothing;

-- ── Whitelists ──────────────────────────────────────────────────────────────
-- Vantage residents: the condo goes private (hidden from the map), residents
-- get 20% off energy. Voltara HQ fleet partners: HQ stays public, the whole
-- of Kinta Logistics plus one named driver charge energy free there.
with created as (
  insert into public.driver_groups (id, tenant_id, name, kind, description, discount_bps) values
    (md5('demo-whitelist:vantage')::uuid, '11111111-1111-4111-8111-111111111111',
     'Vantage residents', 'residents', 'Residents of Vantage Residences. 20% off energy.', 2000),
    (md5('demo-whitelist:hq')::uuid, '11111111-1111-4111-8111-111111111111',
     'HQ fleet partners', 'partner', 'Free energy at Voltara HQ.', 10000)
  on conflict do nothing
  returning id
)
update public.locations set is_private = true
where id = '33333333-3333-4333-8333-333333333332'
  and exists (select 1 from created where id = md5('demo-whitelist:vantage')::uuid);

insert into public.driver_group_locations (tenant_id, driver_group_id, location_id)
select '11111111-1111-4111-8111-111111111111', g.id, v.location_id
from (values
  ('demo-whitelist:vantage', '33333333-3333-4333-8333-333333333332'::uuid),
  ('demo-whitelist:hq',      '33333333-3333-4333-8333-333333333331'::uuid)
) as v(key, location_id)
join public.driver_groups g on g.id = md5(v.key)::uuid
on conflict do nothing;

insert into public.driver_group_members (tenant_id, driver_group_id, driver_user_id)
select '11111111-1111-4111-8111-111111111111', g.id, md5('demo-driver:' || v.driver)::uuid
from (values
  ('demo-whitelist:vantage', 'daniel'), ('demo-whitelist:vantage', 'priya'),
  ('demo-whitelist:vantage', 'mei'), ('demo-whitelist:hq', 'nurul')
) as v(key, driver)
join public.driver_groups g on g.id = md5(v.key)::uuid
on conflict do nothing;

insert into public.driver_group_members (tenant_id, driver_group_id, billing_account_id)
select '11111111-1111-4111-8111-111111111111', g.id, md5('demo-company:kinta')::uuid
from public.driver_groups g where g.id = md5('demo-whitelist:hq')::uuid
on conflict do nothing;

commit;
