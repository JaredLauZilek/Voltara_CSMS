-- ============================================================================
-- Chargers: model registry, units, household access, settings, events.
--
-- A unit's life: registered (factory/dealer stock, has a claim code)
--   → commissioned (installer set the circuit rating on site)
--   → claimed (homeowner proved the claim code from the app)
--   → decommissioned.
-- Writes that move a unit along that path go through SECURITY DEFINER RPCs
-- (register_charger / commission_charger / claim_charger / release_charger);
-- plain UPDATEs are limited per role by a column-guard trigger.
-- ============================================================================

-- Migrations, seed and service-role code run with no JWT; they are not end
-- users and must not be blocked by the dealer column guard in core_roles.
create or replace function public.dealers_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_staff_admin() then
    return new;
  end if;
  if new.code is distinct from old.code
     or new.status is distinct from old.status
     or new.is_first_party is distinct from old.is_first_party then
    raise exception 'Only Voltara staff may change a dealer''s code, status or ownership'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Model registry ─────────────────────────────────────────────────────────

create table public.charger_models (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  name text not null,
  rated_kw numeric(5, 2) not null check (rated_kw > 0),
  rated_amps int not null check (rated_amps between 6 and 63),
  phases int not null check (phases in (1, 3)),
  connector_type text not null default 'Type2' check (connector_type in ('Type2', 'Type1', 'GBT')),
  -- Which driver in the app talks to this model. See @voltara/shared CHARGER_PROTOCOLS.
  protocol text not null default 'hici-v1' check (protocol in ('hici-v1', 'mock')),
  ble_name_prefix text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand, model)
);

alter table public.charger_models enable row level security;
grant select, insert, update, delete on public.charger_models to authenticated;

create policy charger_models_select on public.charger_models
  for select to authenticated using (true);

create policy charger_models_write on public.charger_models
  for all to authenticated
  using ((select public.is_staff_admin()))
  with check ((select public.is_staff_admin()));

-- ── Units ──────────────────────────────────────────────────────────────────

create table public.chargers (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique check (serial ~ '^[A-Z0-9-]{4,40}$'),
  model_id uuid not null references public.charger_models (id),
  name text not null default 'Home charger',
  lifecycle text not null default 'registered'
    check (lifecycle in ('registered', 'commissioned', 'claimed', 'decommissioned')),
  -- bcrypt of the claim code printed on the unit / QR. Verified in claim_charger().
  claim_code_hash text,
  owner_user_id uuid references auth.users (id) on delete set null,
  dealer_id uuid references public.dealers (id) on delete set null,
  installed_by uuid references auth.users (id) on delete set null,
  commissioned_at timestamptz,
  claimed_at timestamptz,
  firmware_version text,
  -- Advertised BLE local name if it differs from the serial.
  ble_name text,
  -- Installer-set circuit limit; the owner's max_current_a can never exceed it.
  rated_current_a int not null default 32 check (rated_current_a between 6 and 63),
  phase_mode text not null default 'auto' check (phase_mode in ('auto', 'single', 'three')),
  site_label text,
  city text,
  state text,
  postcode text,
  notes text,
  last_seen_at timestamptz,
  -- Latest reading as the app reported it (ReadingRow shape). Derivable from
  -- charger_readings but kept here so fleet lists need no partition scan.
  last_status jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chargers_owner_user_id_idx on public.chargers (owner_user_id);
create index chargers_dealer_id_idx on public.chargers (dealer_id);
create index chargers_model_id_idx on public.chargers (model_id);
create index chargers_lifecycle_idx on public.chargers (lifecycle);
create index chargers_last_seen_at_idx on public.chargers (last_seen_at desc);

alter table public.chargers enable row level security;
grant select, update, delete on public.chargers to authenticated;
-- inserts: register_charger() only

-- Household access beyond the owner.
create table public.charger_members (
  charger_id uuid not null references public.chargers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'guest')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (charger_id, user_id)
);

create index charger_members_user_id_idx on public.charger_members (user_id);

alter table public.charger_members enable row level security;
grant select, insert, update, delete on public.charger_members to authenticated;

-- Desired configuration. The app applies it over BLE on connect and reports
-- back the version it applied, so "pending" vs "applied" is visible.
create table public.charger_settings (
  charger_id uuid primary key references public.chargers (id) on delete cascade,
  max_current_a int not null default 32 check (max_current_a between 6 and 63),
  cable_locked boolean not null default false,
  led_brightness int not null default 100 check (led_brightness between 0 and 100),
  -- { enabled: bool, start: 'HH:MM', end: 'HH:MM', days: [0..6] } — applied later
  schedule jsonb,
  version int not null default 1,
  applied_version int,
  applied_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.charger_settings enable row level security;
grant select on public.charger_settings to authenticated;
grant update (max_current_a, cable_locked, led_brightness, schedule) on public.charger_settings
  to authenticated;

create table public.charger_events (
  id bigint generated always as identity primary key,
  charger_id uuid not null references public.chargers (id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  message text,
  data jsonb,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index charger_events_charger_id_created_at_idx
  on public.charger_events (charger_id, created_at desc);
create index charger_events_severity_created_at_idx
  on public.charger_events (severity, created_at desc);

alter table public.charger_events enable row level security;
grant select, insert on public.charger_events to authenticated;

-- ── Access helpers ─────────────────────────────────────────────────────────

-- The signed-in person's relationship to one charger, highest first:
-- 'staff' | 'owner' | 'member' | 'guest' | 'dealer' | null.
create or replace function public.charger_role(p_charger_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_staff() then 'staff'
    when exists (
      select 1 from public.chargers c
      where c.id = p_charger_id and c.owner_user_id = auth.uid()
    ) then 'owner'
    when exists (
      select 1 from public.charger_members m
      where m.charger_id = p_charger_id and m.user_id = auth.uid() and m.role = 'member'
    ) then 'member'
    when exists (
      select 1 from public.charger_members m
      where m.charger_id = p_charger_id and m.user_id = auth.uid() and m.role = 'guest'
    ) then 'guest'
    when exists (
      select 1 from public.chargers c
      where c.id = p_charger_id
        and c.dealer_id is not null
        and c.dealer_id = public.my_dealer_id()
    ) then 'dealer'
  end
$$;

-- True inside the RPCs below, so the column guard lets them through.
create or replace function public.in_rpc()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('voltara.rpc', true), '') = 'on'
$$;

-- ── Chargers policies ──────────────────────────────────────────────────────

create policy chargers_select on public.chargers
  for select to authenticated
  using (
    (select public.is_staff())
    or owner_user_id = (select auth.uid())
    or (dealer_id is not null and dealer_id = (select public.my_dealer_id()))
    or exists (
      select 1 from public.charger_members m
      where m.charger_id = public.chargers.id and m.user_id = (select auth.uid())
    )
  );

create policy chargers_update on public.chargers
  for update to authenticated
  using ((select public.charger_role(id)) in ('staff', 'owner', 'dealer'))
  with check ((select public.charger_role(id)) in ('staff', 'owner', 'dealer'));

create policy chargers_delete_staff on public.chargers
  for delete to authenticated
  using ((select public.is_staff_admin()));

-- Column guard: which columns each role may change with a plain UPDATE.
--   staff admin/support  anything
--   staff viewer         nothing
--   owner                name, site fields, notes
--   dealer/installer     site fields, notes, firmware_version, rated_current_a, phase_mode
-- Lifecycle / ownership / claim code / telemetry columns only move via RPCs.
create or replace function public.chargers_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  identity_changed boolean;
  commissioning_changed boolean;
  naming_changed boolean;
begin
  new.updated_at := now();
  -- No JWT = migration, seed or service-role code: not an end user, no guard.
  if auth.uid() is null or public.in_rpc() then
    return new;
  end if;

  if public.is_staff() then
    if public.staff_role() = 'viewer' then
      raise exception 'Viewers cannot edit chargers' using errcode = '42501';
    end if;
    return new;
  end if;

  r := public.charger_role(old.id);

  identity_changed :=
       new.serial is distinct from old.serial
    or new.model_id is distinct from old.model_id
    or new.lifecycle is distinct from old.lifecycle
    or new.claim_code_hash is distinct from old.claim_code_hash
    or new.owner_user_id is distinct from old.owner_user_id
    or new.dealer_id is distinct from old.dealer_id
    or new.installed_by is distinct from old.installed_by
    or new.commissioned_at is distinct from old.commissioned_at
    or new.claimed_at is distinct from old.claimed_at
    or new.last_seen_at is distinct from old.last_seen_at
    or new.last_status is distinct from old.last_status
    or new.ble_name is distinct from old.ble_name;

  commissioning_changed :=
       new.rated_current_a is distinct from old.rated_current_a
    or new.phase_mode is distinct from old.phase_mode
    or new.firmware_version is distinct from old.firmware_version;

  naming_changed := new.name is distinct from old.name;

  if identity_changed then
    raise exception 'That change is only possible through the registration, commissioning or claim flow'
      using errcode = '42501';
  end if;

  if r = 'owner' then
    if commissioning_changed then
      raise exception 'Circuit rating and phase mode are set by your installer'
        using errcode = '42501';
    end if;
    return new;
  elsif r = 'dealer' then
    if naming_changed then
      raise exception 'Only the owner may rename a charger' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Not allowed' using errcode = '42501';
end;
$$;

create trigger chargers_guard_update
  before update on public.chargers
  for each row execute function public.chargers_guard_update();

-- Owners of a dealer's chargers are visible to that dealer (admin portal).
create policy profiles_select_dealer_customers on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.chargers c
      where c.owner_user_id = public.profiles.id
        and c.dealer_id is not null
        and c.dealer_id = (select public.my_dealer_id())
    )
  );

-- Household members are visible to anyone with access to that charger.
create policy profiles_select_household on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.charger_members m
      where m.user_id = public.profiles.id
        and (select public.charger_role(m.charger_id)) is not null
    )
    or exists (
      select 1 from public.chargers c
      where c.owner_user_id = public.profiles.id
        and (select public.charger_role(c.id)) is not null
    )
  );

-- ── charger_members policies ───────────────────────────────────────────────

create policy charger_members_select on public.charger_members
  for select to authenticated
  using ((select public.charger_role(charger_id)) is not null);

create policy charger_members_insert on public.charger_members
  for insert to authenticated
  with check (
    (select public.charger_role(charger_id)) in ('staff', 'owner')
    and user_id <> (select auth.uid())
  );

create policy charger_members_update on public.charger_members
  for update to authenticated
  using ((select public.charger_role(charger_id)) in ('staff', 'owner'))
  with check ((select public.charger_role(charger_id)) in ('staff', 'owner'));

create policy charger_members_delete on public.charger_members
  for delete to authenticated
  using (
    (select public.charger_role(charger_id)) in ('staff', 'owner')
    or user_id = (select auth.uid())  -- leave a household
  );

-- ── charger_settings policies ──────────────────────────────────────────────

create policy charger_settings_select on public.charger_settings
  for select to authenticated
  using ((select public.charger_role(charger_id)) is not null);

-- Owners, members, dealers (installer sets the initial limit) and staff.
create policy charger_settings_update on public.charger_settings
  for update to authenticated
  using ((select public.charger_role(charger_id)) in ('staff', 'owner', 'member', 'dealer'))
  with check ((select public.charger_role(charger_id)) in ('staff', 'owner', 'member', 'dealer'));

-- Bump the version on every change and clamp the limit to the circuit rating.
create or replace function public.charger_settings_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rated int;
begin
  select rated_current_a into rated from public.chargers where id = new.charger_id;
  if new.max_current_a > rated then
    new.max_current_a := rated;
  end if;
  if row(new.max_current_a, new.cable_locked, new.led_brightness, new.schedule)
     is distinct from row(old.max_current_a, old.cable_locked, old.led_brightness, old.schedule) then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger charger_settings_before_update
  before update on public.charger_settings
  for each row execute function public.charger_settings_before_update();

-- ── charger_events policies ────────────────────────────────────────────────

create policy charger_events_select on public.charger_events
  for select to authenticated
  using ((select public.charger_role(charger_id)) is not null);

-- The app logs connect/disconnect/fault observations; it must sign them.
create policy charger_events_insert on public.charger_events
  for insert to authenticated
  with check (
    (select public.charger_role(charger_id)) is not null
    and actor_user_id = (select auth.uid())
  );

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Six-digit claim code from a cryptographic source (random() is not).
create or replace function public.generate_claim_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad(
    ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text,
    6, '0'
  )
$$;

revoke execute on function public.generate_claim_code() from anon, authenticated, public;

-- Staff (admin/support) or any dealer member registers a unit. Dealer members
-- can only register into their own dealer. Returns the claim code exactly
-- once — it is stored hashed.
create or replace function public.register_charger(
  p_serial text,
  p_model_id uuid,
  p_dealer_id uuid default null,
  p_claim_code text default null,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial text := upper(trim(p_serial));
  v_dealer uuid := p_dealer_id;
  v_code text := coalesce(nullif(trim(p_claim_code), ''), public.generate_claim_code());
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if public.is_staff_support() then
    null; -- any dealer, or none
  elsif public.is_dealer_member() then
    v_dealer := public.my_dealer_id();
  else
    raise exception 'Only Voltara staff or dealers may register chargers' using errcode = '42501';
  end if;

  if v_code !~ '^[0-9]{6}$' then
    raise exception 'Claim code must be 6 digits';
  end if;

  perform set_config('voltara.rpc', 'on', true);

  insert into public.chargers (serial, model_id, dealer_id, claim_code_hash, name)
  values (
    v_serial, p_model_id, v_dealer,
    extensions.crypt(v_code, extensions.gen_salt('bf')),
    coalesce(nullif(trim(p_name), ''), 'Home charger')
  )
  returning id into v_id;

  insert into public.charger_settings (charger_id, max_current_a)
  select v_id, m.rated_amps from public.charger_models m where m.id = p_model_id;

  insert into public.charger_events (charger_id, type, message, actor_user_id)
  values (v_id, 'registered', 'Registered', auth.uid());

  return jsonb_build_object('id', v_id, 'serial', v_serial, 'claim_code', v_code);
end;
$$;

-- Installer on site: sets the circuit rating/phase mode, records who did it.
-- A unit with no dealer yet is adopted by the installer's dealer.
create or replace function public.commission_charger(
  p_charger_id uuid,
  p_rated_current_a int,
  p_phase_mode text default 'auto',
  p_firmware_version text default null,
  p_site jsonb default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chargers%rowtype;
begin
  select * into c from public.chargers where id = p_charger_id;
  if not found then
    raise exception 'Charger not found';
  end if;

  if public.is_staff_support() then
    null;
  elsif public.is_dealer_member() and (c.dealer_id is null or c.dealer_id = public.my_dealer_id()) then
    null;
  else
    raise exception 'Only the installing dealer or Voltara staff may commission this charger'
      using errcode = '42501';
  end if;

  if c.lifecycle = 'decommissioned' then
    raise exception 'Charger is decommissioned';
  end if;

  perform set_config('voltara.rpc', 'on', true);

  update public.chargers set
    lifecycle = case when lifecycle = 'registered' then 'commissioned' else lifecycle end,
    commissioned_at = coalesce(commissioned_at, now()),
    installed_by = auth.uid(),
    dealer_id = coalesce(dealer_id, public.my_dealer_id()),
    rated_current_a = p_rated_current_a,
    phase_mode = p_phase_mode,
    firmware_version = coalesce(p_firmware_version, firmware_version),
    site_label = coalesce(p_site ->> 'site_label', site_label),
    city = coalesce(p_site ->> 'city', city),
    state = coalesce(p_site ->> 'state', state),
    postcode = coalesce(p_site ->> 'postcode', postcode),
    notes = coalesce(p_notes, notes)
  where id = p_charger_id;

  -- The owner's limit can never exceed the circuit.
  update public.charger_settings
  set max_current_a = least(max_current_a, p_rated_current_a)
  where charger_id = p_charger_id;

  insert into public.charger_events (charger_id, type, message, data, actor_user_id)
  values (
    p_charger_id, 'commissioned', 'Commissioned',
    jsonb_build_object('rated_current_a', p_rated_current_a, 'phase_mode', p_phase_mode),
    auth.uid()
  );
end;
$$;

-- Homeowner proves possession with the claim code from the unit / QR.
-- Ten wrong codes in an hour lock the unit for that hour.
create or replace function public.claim_charger(
  p_serial text,
  p_claim_code text,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chargers%rowtype;
  v_serial text := upper(trim(p_serial));
  failures int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into c from public.chargers where serial = v_serial;
  if not found then
    raise exception 'No charger with that serial';
  end if;
  if c.lifecycle = 'decommissioned' then
    raise exception 'That charger has been decommissioned';
  end if;
  if c.owner_user_id is not null then
    if c.owner_user_id = auth.uid() then
      return c.id;
    end if;
    raise exception 'That charger already belongs to someone. Ask them to add you as a member.';
  end if;

  select count(*) into failures
  from public.charger_events e
  where e.charger_id = c.id and e.type = 'claim_failed' and e.created_at > now() - interval '1 hour';
  if failures >= 10 then
    raise exception 'Too many attempts. Try again in an hour.';
  end if;

  perform set_config('voltara.rpc', 'on', true);

  if c.claim_code_hash is null
     or extensions.crypt(trim(p_claim_code), c.claim_code_hash) <> c.claim_code_hash then
    insert into public.charger_events (charger_id, type, severity, message, actor_user_id)
    values (c.id, 'claim_failed', 'warning', 'Wrong claim code', auth.uid());
    raise exception 'Wrong claim code';
  end if;

  update public.chargers set
    owner_user_id = auth.uid(),
    lifecycle = 'claimed',
    claimed_at = now(),
    name = coalesce(nullif(trim(p_name), ''), name)
  where id = c.id;

  insert into public.charger_events (charger_id, type, message, actor_user_id)
  values (c.id, 'claimed', 'Claimed by owner', auth.uid());

  return c.id;
end;
$$;

-- Owner (or staff) hands the unit back: household removed, ready to re-claim.
create or replace function public.release_charger(p_charger_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff_support() or public.charger_role(p_charger_id) = 'owner') then
    raise exception 'Only the owner or Voltara staff may release a charger' using errcode = '42501';
  end if;
  perform set_config('voltara.rpc', 'on', true);
  delete from public.charger_members where charger_id = p_charger_id;
  update public.chargers set
    owner_user_id = null,
    lifecycle = case when commissioned_at is null then 'registered' else 'commissioned' end,
    claimed_at = null
  where id = p_charger_id;
  insert into public.charger_events (charger_id, type, message, actor_user_id)
  values (p_charger_id, 'released', 'Ownership released', auth.uid());
end;
$$;

-- Staff only: retire a unit.
create or replace function public.decommission_charger(p_charger_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff_support() then
    raise exception 'Only Voltara staff may decommission a charger' using errcode = '42501';
  end if;
  perform set_config('voltara.rpc', 'on', true);
  update public.chargers set lifecycle = 'decommissioned' where id = p_charger_id;
  insert into public.charger_events (charger_id, type, severity, message, actor_user_id)
  values (p_charger_id, 'decommissioned', 'warning', coalesce(p_reason, 'Decommissioned'), auth.uid());
end;
$$;

-- The app confirms it pushed settings version N to the charger.
create or replace function public.report_settings_applied(p_charger_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.charger_role(p_charger_id) is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.charger_settings
  set applied_version = p_version, applied_at = now()
  where charger_id = p_charger_id and (applied_version is null or applied_version < p_version);
end;
$$;

revoke execute on function public.register_charger(text, uuid, uuid, text, text) from anon, public;
revoke execute on function public.commission_charger(uuid, int, text, text, jsonb, text) from anon, public;
revoke execute on function public.claim_charger(text, text, text) from anon, public;
revoke execute on function public.release_charger(uuid) from anon, public;
revoke execute on function public.decommission_charger(uuid, text) from anon, public;
revoke execute on function public.report_settings_applied(uuid, int) from anon, public;

-- Owner (or staff) adds a household member by email. The person must already
-- have signed in once (auth.users row); profiles are not searchable by
-- email under RLS, hence SECURITY DEFINER.
create or replace function public.invite_charger_member(
  p_charger_id uuid,
  p_email text,
  p_role text default 'member'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not (public.is_staff_support() or public.charger_role(p_charger_id) = 'owner') then
    raise exception 'Only the owner may add household members' using errcode = '42501';
  end if;
  if p_role not in ('member', 'guest') then
    raise exception 'Role must be member or guest';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No Voltara Home account with that email yet. Ask them to install the app and sign in first.';
  end if;
  if v_user = auth.uid() then
    raise exception 'That is you';
  end if;
  if exists (select 1 from public.chargers where id = p_charger_id and owner_user_id = v_user) then
    raise exception 'That person already owns this charger';
  end if;
  insert into public.charger_members (charger_id, user_id, role, invited_by)
  values (p_charger_id, v_user, p_role, auth.uid())
  on conflict (charger_id, user_id) do update set role = excluded.role;
  insert into public.charger_events (charger_id, type, message, data, actor_user_id)
  values (p_charger_id, 'member_added', 'Household member added',
          jsonb_build_object('email', lower(trim(p_email)), 'role', p_role), auth.uid());
end;
$$;

revoke execute on function public.invite_charger_member(uuid, text, text) from anon, public;
