-- ============================================================================
-- Local development seed. Applied by `supabase db reset` LOCALLY ONLY —
-- `supabase db push` never runs this against hosted projects.
--
-- Fixed UUIDs on purpose: the RLS integration tests in tests/integration
-- assert against them.
--
-- Local logins:
--   jared@voltara.com.my / voltara-dev   (owner of Voltara, platform admin)
--   ops@democpo.test     / demo-dev      (owner of Demo CPO — second tenant
--                                         proving cross-tenant isolation)
-- ============================================================================

-- ── Tenants ─────────────────────────────────────────────────────────────────

insert into public.tenants (id, slug, name, plan, is_first_party) values
  ('11111111-1111-4111-8111-111111111111', 'voltara', 'Voltara', 'internal', true),
  ('22222222-2222-4222-8222-222222222222', 'demo-cpo', 'Demo CPO Sdn Bhd', 'starter', false);

insert into public.tenant_settings (tenant_id, app_name, support_email) values
  ('11111111-1111-4111-8111-111111111111', 'Voltara Charge', 'support@voltara.com.my'),
  ('22222222-2222-4222-8222-222222222222', 'Demo CPO', 'ops@democpo.test');

-- ── Auth users (local-only pattern: direct inserts with bcrypt passwords) ──

-- GoTrue scans the token columns as non-nullable strings, so they must be ''
-- (not NULL) when inserting users directly.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-4999-8999-999999999991',
    'authenticated', 'authenticated',
    'jared@voltara.com.my',
    crypt('voltara-dev', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-4999-8999-999999999992',
    'authenticated', 'authenticated',
    'ops@democpo.test',
    crypt('demo-dev', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(), '99999999-9999-4999-8999-999999999991', '99999999-9999-4999-8999-999999999991',
    'email',
    '{"sub":"99999999-9999-4999-8999-999999999991","email":"jared@voltara.com.my","email_verified":true,"phone_verified":false}'::jsonb,
    now(), now(), now()
  ),
  (
    gen_random_uuid(), '99999999-9999-4999-8999-999999999992', '99999999-9999-4999-8999-999999999992',
    'email',
    '{"sub":"99999999-9999-4999-8999-999999999992","email":"ops@democpo.test","email_verified":true,"phone_verified":false}'::jsonb,
    now(), now(), now()
  );

insert into public.memberships (user_id, tenant_id, role) values
  ('99999999-9999-4999-8999-999999999991', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('99999999-9999-4999-8999-999999999992', '22222222-2222-4222-8222-222222222222', 'owner');

insert into public.platform_admins (user_id) values
  ('99999999-9999-4999-8999-999999999991');

-- ── Locations ───────────────────────────────────────────────────────────────

insert into public.locations (id, tenant_id, name, address, city, state, postcode, site_type, jmb_name, lat, lng) values
  (
    '33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111',
    'Voltara HQ — Petaling Jaya', 'Jalan PJU 1A/46, Ara Damansara', 'Petaling Jaya', 'Selangor', '47301',
    'workplace', null, 3.1120, 101.5750
  ),
  (
    '33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111',
    'Vantage Residences — Bangsar', 'Jalan Maarof, Bangsar', 'Kuala Lumpur', 'Kuala Lumpur', '59000',
    'condo', 'JMB Vantage Residences', 3.1290, 101.6790
  ),
  (
    '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
    'Demo Mall — Subang Jaya', 'Persiaran Kewajipan, USJ 1', 'Subang Jaya', 'Selangor', '47600',
    'public', null, 3.0480, 101.5860
  );

-- ── Vendor / model registry ────────────────────────────────────────────────

insert into public.charge_point_vendors (id, name, quirks) values
  ('44444444-4444-4444-8444-444444444441', 'Solidstudio', '{}'::jsonb),
  ('44444444-4444-4444-8444-444444444442', 'Autel', '{}'::jsonb),
  ('44444444-4444-4444-8444-444444444443', 'Star Charge', '{}'::jsonb);

insert into public.charge_point_models (id, vendor_id, name, power_kw, connector_count, connector_types, ocpp_versions) values
  (
    '55555555-5555-4555-8555-555555555551', '44444444-4444-4444-8444-444444444441',
    'Virtual Charge Point', 22, 1, '{Type2}', '{1.6,2.0.1}'
  ),
  (
    '55555555-5555-4555-8555-555555555552', '44444444-4444-4444-8444-444444444442',
    'MaxiCharger AC Wallbox 7kW', 7.4, 1, '{Type2}', '{1.6}'
  ),
  (
    '55555555-5555-4555-8555-555555555553', '44444444-4444-4444-8444-444444444443',
    'Aurora 120kW DC', 120, 2, '{CCS2,CCS2}', '{1.6,2.0.1}'
  );

-- ── Demo charge point (matches the simulator config in infra/) ─────────────

-- Basic Auth keys for local/simulator use. Plaintext (never stored) is:
--   VCP-DEMO-001 → demo-charger-key-001
--   VCP-DEMO-002 → demo-charger-key-002   (Demo CPO tenant — proves the gateway
--                                          resolves tenant from identity)
-- Production keys are generated at registration and shown exactly once.

insert into public.charge_points (
  id, tenant_id, location_id, ocpp_identity, name, model_id, ocpp_version, lifecycle, auth_key_hash
) values
  (
    '66666666-6666-4666-8666-666666666661',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333331',
    'VCP-DEMO-001', 'HQ Bay 1 — Virtual', '55555555-5555-4555-8555-555555555551', '1.6', 'active',
    crypt('demo-charger-key-001', gen_salt('bf'))
  ),
  (
    '66666666-6666-4666-8666-666666666662',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'VCP-DEMO-002', 'Demo Mall Bay 1', '55555555-5555-4555-8555-555555555551', '1.6', 'active',
    crypt('demo-charger-key-002', gen_salt('bf'))
  ),
  (
    '66666666-6666-4666-8666-666666666663',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333331',
    'VCP-RETIRED-001', 'HQ Bay 9 — Retired', '55555555-5555-4555-8555-555555555551', '1.6', 'decommissioned',
    crypt('demo-charger-key-003', gen_salt('bf'))
  );

insert into public.evses (id, tenant_id, charge_point_id, evse_number) values
  ('77777777-7777-4777-8777-777777777771', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666661', 1),
  ('77777777-7777-4777-8777-777777777772', '22222222-2222-4222-8222-222222222222', '66666666-6666-4666-8666-666666666662', 1);

insert into public.connectors (
  id, tenant_id, evse_id, charge_point_id, ocpp_connector_id, connector_type, max_kw
) values
  ('88888888-8888-4888-8888-888888888881', '11111111-1111-4111-8111-111111111111',
   '77777777-7777-4777-8777-777777777771', '66666666-6666-4666-8666-666666666661', 1, 'Type2', 22),
  ('88888888-8888-4888-8888-888888888882', '22222222-2222-4222-8222-222222222222',
   '77777777-7777-4777-8777-777777777772', '66666666-6666-4666-8666-666666666662', 1, 'Type2', 22);

-- ── Sample RFID tag ─────────────────────────────────────────────────────────

insert into public.id_tags (tenant_id, tag, label, kind) values
  ('11111111-1111-4111-8111-111111111111', 'VLT-TAG-0001', 'Jared — test card', 'rfid');

-- ── Phase 3 billing (local dev + integration fixtures) ─────────────────────
-- Voltara: SST at 0% with the machinery live; one "Standard" tariff at
-- RM 1.20/kWh with idle RM 1/min after 15 minutes, assigned tenant-wide.
-- Prices are integer sen per OCPP unit: 120 sen/kWh · 6000 sen/hour.

insert into public.tax_profiles (id, tenant_id, name, code, rate_bps, is_default) values
  ('aaaa0001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SST — not yet applicable', 'SST', 0, true),
  ('aaaa0001-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'SST — not yet applicable', 'SST', 0, true);

insert into public.tariffs (id, tenant_id, name, description, status) values
  ('aaaa0002-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Standard',
   'RM 1.20/kWh · idle RM 1/min after 15 min', 'active'),
  ('aaaa0002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Demo public',
   'RM 1.50/kWh', 'active');

insert into public.tariff_versions (id, tenant_id, tariff_id, version, elements, tax_included, tax_profile_id, display_text, created_by) values
  ('aaaa0003-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaa0002-0000-4000-8000-000000000001', 1,
   '[{"price_components":[{"type":"ENERGY","price_sen":120,"step_size":1}]},
     {"price_components":[{"type":"PARKING_TIME","price_sen":6000,"step_size":60}],"restrictions":{"grace_period_s":900}}]'::jsonb,
   true, 'aaaa0001-0000-4000-8000-000000000001', 'RM 1.20/kWh · idle RM 1/min after 15 min', '99999999-9999-4999-8999-999999999991'),
  ('aaaa0003-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'aaaa0002-0000-4000-8000-000000000002', 1,
   '[{"price_components":[{"type":"ENERGY","price_sen":150,"step_size":1}]}]'::jsonb,
   true, 'aaaa0001-0000-4000-8000-000000000002', 'RM 1.50/kWh', '99999999-9999-4999-8999-999999999992');

insert into public.tariff_assignments (id, tenant_id, tariff_id, scope_type, audience, priority) values
  ('aaaa0004-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaa0002-0000-4000-8000-000000000001', 'tenant', 'all', 0),
  ('aaaa0004-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'aaaa0002-0000-4000-8000-000000000002', 'tenant', 'all', 0);
