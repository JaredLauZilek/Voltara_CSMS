-- ============================================================================
-- Core tenancy: tenants, memberships, platform admins, JWT claim helpers,
-- and the custom access token auth hook. See CLAUDE.md §5.
--
-- RLS is ENABLEd (not FORCEd) everywhere: migrations and seed run as the
-- table owner (postgres) and must bypass policies; anon/authenticated always
-- go through policies; service_role carries BYPASSRLS.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists moddatetime with schema extensions;

-- ── Tenants ─────────────────────────────────────────────────────────────────

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  plan text not null default 'internal' check (plan in ('internal', 'starter', 'growth', 'enterprise')),
  -- Voltara's own operations run as a first-party tenant (tenant #1); the
  -- platform must stay tenant-generic — this flag is for reporting, never logic.
  is_first_party boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

-- ── Memberships & platform admins ───────────────────────────────────────────

create table public.memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create index memberships_tenant_id_idx on public.memberships (tenant_id);

alter table public.memberships enable row level security;

-- Voltara staff with cross-tenant access. Read by the auth hook; the
-- platform-admin console (Phase 6) builds on the resulting JWT claim.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- ── JWT claim helpers ───────────────────────────────────────────────────────
-- Claims are injected by the auth hook below and read ONLY from app_metadata.
-- user_metadata is end-user writable and must never appear in a policy.
-- Policies must call these wrapped in a scalar subquery — e.g.
--   using (tenant_id = (select public.jwt_tenant_id()))
-- so Postgres evaluates them once per statement (initPlan), not per row.

create or replace function public.jwt_tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

create or replace function public.jwt_tenant_role()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'tenant_role'
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.jwt_tenant_role() in ('owner', 'admin')
$$;

create or replace function public.is_tenant_operator()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.jwt_tenant_role() in ('owner', 'admin', 'operator')
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_admin')::boolean, false)
$$;

-- ── Custom access token hook ────────────────────────────────────────────────
-- Injects tenant_id + tenant_role (earliest membership wins for now; the
-- tenant switcher in Phase 6 updates app_metadata + forces a token refresh)
-- and platform_admin for Voltara staff. Enabled in supabase/config.toml
-- locally and under Authentication → Hooks on hosted projects.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  m record;
  is_pa boolean;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  select tenant_id, role into m
  from public.memberships
  where user_id = (event ->> 'user_id')::uuid
  order by created_at asc
  limit 1;

  if found then
    claims := jsonb_set(claims, '{app_metadata,tenant_id}', to_jsonb(m.tenant_id::text));
    claims := jsonb_set(claims, '{app_metadata,tenant_role}', to_jsonb(m.role));
  end if;

  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (event ->> 'user_id')::uuid
  ) into is_pa;

  if is_pa then
    claims := jsonb_set(claims, '{app_metadata,platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth service may execute the hook; it also needs to read the
-- membership tables (supabase_auth_admin has no BYPASSRLS).
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on table public.memberships to supabase_auth_admin;
grant select on table public.platform_admins to supabase_auth_admin;

create policy memberships_auth_admin_read on public.memberships
  for select to supabase_auth_admin using (true);

create policy platform_admins_auth_admin_read on public.platform_admins
  for select to supabase_auth_admin using (true);

-- ── RLS policies ────────────────────────────────────────────────────────────

-- Members see their own tenant; platform admins see all (for the Phase 6 console).
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = (select public.jwt_tenant_id()) or (select public.is_platform_admin()));
-- Tenant writes are service-role only (platform provisioning).

-- Users see their own memberships plus everyone in their tenant.
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id = (select public.jwt_tenant_id())
  );
-- Membership writes are service-role only (admin-invite edge function).

-- platform_admins: no authenticated policies — service-role only.
