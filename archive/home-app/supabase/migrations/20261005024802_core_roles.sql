-- ============================================================================
-- Voltara Home — core identity & roles.
--
-- Single-tenant (Voltara only). Three kinds of people:
--   * homeowners (any auth user; access flows from charger ownership),
--   * dealer members (installers and dealer admins, grouped by dealer),
--   * Voltara staff (admin / support / viewer).
-- Role helpers read the role tables directly (SECURITY DEFINER, STABLE) so
-- RLS works with no auth-hook configuration; a JWT claims hook can replace
-- the lookups later without touching a policy. Policies call helpers wrapped
-- in `(select …)` so Postgres evaluates them once per statement.
--
-- RLS is ENABLEd (not FORCEd): migrations/seed run as the table owner and
-- bypass it; service_role carries BYPASSRLS; everyone else goes through
-- policies. New-project default: nothing in public is exposed to the API
-- roles without an explicit GRANT, so every table grants deliberately.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists moddatetime with schema extensions;

grant usage on schema public to anon, authenticated;

-- ── Profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

-- Keep a profile row for every auth user. Display name comes from sign-up
-- metadata (display only — never an authorization input).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Staff (Voltara employees) ───────────────────────────────────────────────

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin', 'support', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;
grant select, update, delete on public.staff to authenticated;
-- inserts: service role only (admin-invite edge function creates the auth user first)

-- ── Dealers & installers ───────────────────────────────────────────────────

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Voltara's own installation team is a dealer too, so one commissioning
  -- flow serves everyone. Reporting only — never logic.
  is_first_party boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dealers_set_updated_at
  before update on public.dealers
  for each row execute function extensions.moddatetime(updated_at);

alter table public.dealers enable row level security;
grant select, insert, update, delete on public.dealers to authenticated;

create table public.dealer_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  role text not null default 'installer' check (role in ('dealer_admin', 'installer')),
  created_at timestamptz not null default now(),
  primary key (user_id, dealer_id)
);

create index dealer_members_dealer_id_idx on public.dealer_members (dealer_id);

alter table public.dealer_members enable row level security;
grant select, update, delete on public.dealer_members to authenticated;
-- inserts: service role (admin-invite) or staff admin via policy below

-- ── Role helpers ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can read the role tables without recursing into
-- the role tables' own policies. STABLE so the planner hoists them.

create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s where s.user_id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid())
$$;

create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.role = 'admin')
$$;

-- admin or support: may change operational data (not team/roles).
create or replace function public.is_staff_support()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s where s.user_id = auth.uid() and s.role in ('admin', 'support')
  )
$$;

-- A person belongs to at most one dealer in practice; earliest wins if not.
create or replace function public.my_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dm.dealer_id from public.dealer_members dm
  where dm.user_id = auth.uid()
  order by dm.created_at asc
  limit 1
$$;

create or replace function public.dealer_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select dm.role from public.dealer_members dm
  where dm.user_id = auth.uid()
  order by dm.created_at asc
  limit 1
$$;

create or replace function public.is_dealer_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.dealer_role() = 'dealer_admin'
$$;

-- Any dealer member (installer or dealer admin) may commission chargers.
create or replace function public.is_dealer_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.dealer_role() is not null
$$;

-- What the signed-in person is, for the app shell: 'staff' | 'dealer' | 'owner'.
create or replace function public.my_actor()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'staff_role', public.staff_role(),
    'dealer_id', public.my_dealer_id(),
    'dealer_role', public.dealer_role()
  )
$$;

-- ── Policies ────────────────────────────────────────────────────────────────

-- profiles: yourself; staff see everyone; dealer members see colleagues.
-- (Owners of a dealer's chargers are added in the chargers migration.)
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using ((select public.is_staff()));

create policy profiles_select_dealer_colleagues on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.dealer_members dm
      where dm.user_id = public.profiles.id
        and dm.dealer_id = (select public.my_dealer_id())
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- staff: see yourself and (if staff) the whole team; admins manage roles.
create policy staff_select on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy staff_update_admin on public.staff
  for update to authenticated
  using ((select public.is_staff_admin()))
  with check ((select public.is_staff_admin()));

create policy staff_delete_admin on public.staff
  for delete to authenticated
  using ((select public.is_staff_admin()) and user_id <> (select auth.uid()));

-- dealers: staff see all; members see their own; staff admins write;
-- dealer admins may edit their own contact details (guarded below).
create policy dealers_select on public.dealers
  for select to authenticated
  using ((select public.is_staff()) or id = (select public.my_dealer_id()));

create policy dealers_insert_staff on public.dealers
  for insert to authenticated
  with check ((select public.is_staff_admin()));

create policy dealers_update on public.dealers
  for update to authenticated
  using (
    (select public.is_staff_admin())
    or (id = (select public.my_dealer_id()) and (select public.is_dealer_admin()))
  )
  with check (
    (select public.is_staff_admin())
    or (id = (select public.my_dealer_id()) and (select public.is_dealer_admin()))
  );

create policy dealers_delete_staff on public.dealers
  for delete to authenticated
  using ((select public.is_staff_admin()));

-- Dealer admins may change name/phone/email only.
create or replace function public.dealers_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_staff_admin() then
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

create trigger dealers_guard_update
  before update on public.dealers
  for each row execute function public.dealers_guard_update();

-- dealer_members: yourself, your dealer's people, or staff.
create policy dealer_members_select on public.dealer_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or dealer_id = (select public.my_dealer_id())
    or (select public.is_staff())
  );

create policy dealer_members_update on public.dealer_members
  for update to authenticated
  using (
    (select public.is_staff_admin())
    or (dealer_id = (select public.my_dealer_id()) and (select public.is_dealer_admin()))
  )
  with check (
    (select public.is_staff_admin())
    or (dealer_id = (select public.my_dealer_id()) and (select public.is_dealer_admin()))
  );

create policy dealer_members_delete on public.dealer_members
  for delete to authenticated
  using (
    (select public.is_staff_admin())
    or (
      dealer_id = (select public.my_dealer_id())
      and (select public.is_dealer_admin())
      and user_id <> (select auth.uid())
    )
  );
