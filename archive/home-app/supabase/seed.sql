-- ============================================================================
-- Development seed for Voltara Home. Applied locally by `supabase db reset`,
-- and applied ONCE to the hosted dev project (yvtaokyuxniflztesons) on
-- 5 Oct 2026. DELETE every *@dev.voltara.com.my user before that project
-- carries real customers — they have a known password.
--
-- Logins (password for all: voltara-dev):
--   owner@dev.voltara.com.my       homeowner — owns HC-DEMO-0001 and SIM-0001
--   family@dev.voltara.com.my      household member of HC-DEMO-0001
--   installer@dev.voltara.com.my   installer at Voltara (first-party dealer)
--   dealer@dev.voltara.com.my      dealer admin at Demo Dealer
--   admin@dev.voltara.com.my       Voltara staff admin
--   support@dev.voltara.com.my     Voltara staff support
--
-- Unclaimed units for testing the claim flow:
--   HC-DEMO-0002  claim code 246810  (registered, Demo Dealer)
--   HC-DEMO-0003  claim code 135790  (commissioned, Voltara)
-- ============================================================================

-- ── Auth users (direct inserts; token columns must be '' not NULL) ─────────

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, crypt('voltara-dev', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('99999999-9999-4999-8999-999999999901'::uuid, 'owner@dev.voltara.com.my', 'Aiman Owner'),
  ('99999999-9999-4999-8999-999999999902'::uuid, 'family@dev.voltara.com.my', 'Mei Family'),
  ('99999999-9999-4999-8999-999999999903'::uuid, 'installer@dev.voltara.com.my', 'Raj Installer'),
  ('99999999-9999-4999-8999-999999999904'::uuid, 'dealer@dev.voltara.com.my', 'Demo Dealer Admin'),
  ('99999999-9999-4999-8999-999999999905'::uuid, 'admin@dev.voltara.com.my', 'Voltara Admin'),
  ('99999999-9999-4999-8999-999999999906'::uuid, 'support@dev.voltara.com.my', 'Voltara Support')
) as u(id, email, full_name)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  now(), now(), now()
from auth.users u
where u.email like '%@dev.voltara.com.my'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- ── Roles ──────────────────────────────────────────────────────────────────

insert into public.staff (user_id, role) values
  ('99999999-9999-4999-8999-999999999905', 'admin'),
  ('99999999-9999-4999-8999-999999999906', 'support')
on conflict do nothing;

insert into public.dealers (id, code, name, phone, email, is_first_party) values
  ('11111111-1111-4111-8111-111111111101', 'voltara', 'Voltara (in-house installers)', '+60 3-0000 0000', 'install@voltara.com.my', true),
  ('11111111-1111-4111-8111-111111111102', 'demo-dealer', 'Demo Dealer Sdn Bhd', '+60 12-000 0000', 'hello@demodealer.test', false)
on conflict (id) do nothing;

insert into public.dealer_members (user_id, dealer_id, role) values
  ('99999999-9999-4999-8999-999999999903', '11111111-1111-4111-8111-111111111101', 'installer'),
  ('99999999-9999-4999-8999-999999999904', '11111111-1111-4111-8111-111111111102', 'dealer_admin')
on conflict do nothing;

-- ── Models ─────────────────────────────────────────────────────────────────

insert into public.charger_models (id, brand, model, name, rated_kw, rated_amps, phases, protocol, ble_name_prefix) values
  ('22222222-2222-4222-8222-222222222201', 'HiCi', 'HC7K-1P', 'HiCi 7 kW single-phase', 7.4, 32, 1, 'hici-v1', 'HICI'),
  ('22222222-2222-4222-8222-222222222202', 'HiCi', 'HC11K-3P', 'HiCi 11 kW three-phase', 11, 16, 3, 'hici-v1', 'HICI'),
  ('22222222-2222-4222-8222-222222222203', 'HiCi', 'HC22K-3P', 'HiCi 22 kW three-phase', 22, 32, 3, 'hici-v1', 'HICI'),
  ('22222222-2222-4222-8222-222222222204', 'Voltara', 'SIM', 'Simulator (no hardware)', 7.4, 32, 1, 'mock', 'SIM')
on conflict (id) do nothing;

-- ── Chargers ───────────────────────────────────────────────────────────────

insert into public.chargers (
  id, serial, model_id, name, lifecycle, claim_code_hash, owner_user_id, dealer_id, installed_by,
  commissioned_at, claimed_at, firmware_version, rated_current_a, phase_mode,
  site_label, city, state, postcode, last_seen_at
) values
  (
    '33333333-3333-4333-8333-333333333301', 'HC-DEMO-0001', '22222222-2222-4222-8222-222222222201',
    'Porch charger', 'claimed', crypt('111111', gen_salt('bf')),
    '99999999-9999-4999-8999-999999999901', '11111111-1111-4111-8111-111111111101',
    '99999999-9999-4999-8999-999999999903',
    now() - interval '20 days', now() - interval '19 days', '1.2.3', 32, 'single',
    'Taman Megah', 'Petaling Jaya', 'Selangor', '47301', now() - interval '3 hours'
  ),
  (
    '33333333-3333-4333-8333-333333333302', 'HC-DEMO-0002', '22222222-2222-4222-8222-222222222202',
    'Home charger', 'registered', crypt('246810', gen_salt('bf')),
    null, '11111111-1111-4111-8111-111111111102', null,
    null, null, null, 16, 'auto',
    null, null, null, null, null
  ),
  (
    '33333333-3333-4333-8333-333333333303', 'HC-DEMO-0003', '22222222-2222-4222-8222-222222222201',
    'Home charger', 'commissioned', crypt('135790', gen_salt('bf')),
    null, '11111111-1111-4111-8111-111111111101', '99999999-9999-4999-8999-999999999903',
    now() - interval '2 days', null, '1.2.3', 32, 'single',
    'Bukit Jalil', 'Kuala Lumpur', 'Kuala Lumpur', '57000', null
  ),
  (
    '33333333-3333-4333-8333-333333333304', 'SIM-0001', '22222222-2222-4222-8222-222222222204',
    'Simulator', 'claimed', crypt('000000', gen_salt('bf')),
    '99999999-9999-4999-8999-999999999901', '11111111-1111-4111-8111-111111111101', null,
    now() - interval '1 day', now() - interval '1 day', 'sim-1.0.0', 32, 'single',
    'Bench', 'Petaling Jaya', 'Selangor', '47301', null
  )
on conflict (id) do nothing;

insert into public.charger_settings (charger_id, max_current_a, cable_locked) values
  ('33333333-3333-4333-8333-333333333301', 32, true),
  ('33333333-3333-4333-8333-333333333302', 16, false),
  ('33333333-3333-4333-8333-333333333303', 32, false),
  ('33333333-3333-4333-8333-333333333304', 32, false)
on conflict do nothing;

insert into public.charger_members (charger_id, user_id, role, invited_by) values
  ('33333333-3333-4333-8333-333333333301', '99999999-9999-4999-8999-999999999902', 'member',
   '99999999-9999-4999-8999-999999999901')
on conflict do nothing;

insert into public.charger_events (charger_id, type, message, actor_user_id, created_at) values
  ('33333333-3333-4333-8333-333333333301', 'registered', 'Registered', '99999999-9999-4999-8999-999999999905', now() - interval '21 days'),
  ('33333333-3333-4333-8333-333333333301', 'commissioned', 'Commissioned', '99999999-9999-4999-8999-999999999903', now() - interval '20 days'),
  ('33333333-3333-4333-8333-333333333301', 'claimed', 'Claimed by owner', '99999999-9999-4999-8999-999999999901', now() - interval '19 days'),
  ('33333333-3333-4333-8333-333333333302', 'registered', 'Registered', '99999999-9999-4999-8999-999999999904', now() - interval '3 days'),
  ('33333333-3333-4333-8333-333333333303', 'registered', 'Registered', '99999999-9999-4999-8999-999999999905', now() - interval '3 days'),
  ('33333333-3333-4333-8333-333333333303', 'commissioned', 'Commissioned', '99999999-9999-4999-8999-999999999903', now() - interval '2 days');

-- ── Sessions + readings for the claimed unit (last 7 nights) ──────────────

insert into public.charging_sessions (charger_id, started_at, ended_at, start_energy_kwh, end_energy_kwh, max_power_kw, started_by, stop_reason, source)
select
  '33333333-3333-4333-8333-333333333301',
  s.start_at, s.start_at + s.len, 1200 + s.n * 25.0, 1200 + s.n * 25.0 + s.kwh, 7.2,
  '99999999-9999-4999-8999-999999999901', 'Vehicle full', 'ble'
from (
  select
    n,
    date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur'
      - (n || ' days')::interval + interval '21 hours' as start_at,
    (interval '2 hours' + (n % 3) * interval '45 minutes') as len,
    (14 + (n % 4) * 3.5)::numeric as kwh
  from generate_series(1, 7) as n
) s;

-- Readings at 1-minute cadence for the most recent session only.
insert into public.charger_readings (
  charger_id, recorded_at, state, power_kw, current_l1_a, voltage_l1_v,
  energy_total_kwh, session_kwh, temperature_c, source, reported_by
)
select
  cs.charger_id,
  t,
  'Charging',
  round((7.1 + random() * 0.3)::numeric, 3),
  round((31 + random() * 1.5)::numeric, 2),
  round((228 + random() * 5)::numeric, 1),
  round((cs.start_energy_kwh + extract(epoch from (t - cs.started_at)) / 3600 * 7.2)::numeric, 3),
  round((extract(epoch from (t - cs.started_at)) / 3600 * 7.2)::numeric, 3),
  round((33 + random() * 4)::numeric, 1),
  'ble',
  '99999999-9999-4999-8999-999999999901'
from public.charging_sessions cs
cross join lateral generate_series(cs.started_at, cs.ended_at, interval '1 minute') as t
where cs.charger_id = '33333333-3333-4333-8333-333333333301'
order by cs.started_at desc
limit 200
on conflict do nothing;

update public.chargers set last_status = jsonb_build_object(
  'at', (now() - interval '3 hours')::text, 'state', 'Available', 'power_kw', 0,
  'i1', 0, 'i2', 0, 'i3', 0, 'v1', 231.2, 'v2', 0, 'v3', 0,
  'energy_total_kwh', 1375.5, 'session_kwh', 0, 'temperature_c', 31.0, 'source', 'ble'
) where id = '33333333-3333-4333-8333-333333333301';
