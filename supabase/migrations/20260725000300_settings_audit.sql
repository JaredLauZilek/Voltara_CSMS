-- ============================================================================
-- Tenant settings/branding, append-only audit log, polymorphic notes.
-- ============================================================================

-- ── Tenant settings & branding (1:1 with tenants) ──────────────────────────
-- theme holds white-label token overrides validated against a schema in
-- Phase 6; the Voltara palette in @voltara/ui is always the default.

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  app_name text,
  logo_path text,
  theme jsonb not null default '{}'::jsonb,
  support_email text,
  support_phone text,
  default_currency text not null default 'MYR',
  -- Nullable on purpose: SST applicability to EV charging is unresolved.
  -- Tax is always stored as a separate component, never hardcoded.
  sst_registration_no text,
  updated_at timestamptz not null default now()
);

create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute function extensions.moddatetime (updated_at);

alter table public.tenant_settings enable row level security;

create policy tenant_settings_select on public.tenant_settings
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy tenant_settings_upsert on public.tenant_settings
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy tenant_settings_update on public.tenant_settings
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Audit log (append-only) ────────────────────────────────────────────────
-- Inserts happen via service role or SECURITY DEFINER helpers only; there are
-- deliberately no UPDATE/DELETE policies for anyone.

create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_user_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user', 'gateway', 'system')),
  action text not null,
  resource_type text,
  resource_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_tenant_id_at_idx on public.audit_log (tenant_id, at desc);

alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Notes (attachable to any resource, Ampeco-style) ───────────────────────

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  author_user_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index notes_tenant_resource_idx on public.notes (tenant_id, resource_type, resource_id);

alter table public.notes enable row level security;

create policy notes_select on public.notes
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (
    tenant_id = (select public.jwt_tenant_id())
    and (select public.is_tenant_operator())
    and author_user_id = (select auth.uid())
  );

create policy notes_update on public.notes
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and author_user_id = (select auth.uid()))
  with check (tenant_id = (select public.jwt_tenant_id()) and author_user_id = (select auth.uid()));

create policy notes_delete on public.notes
  for delete to authenticated
  using (
    tenant_id = (select public.jwt_tenant_id())
    and (author_user_id = (select auth.uid()) or (select public.is_tenant_admin()))
  );

-- ── Explicit table grants ───────────────────────────────────────────────────
-- Default ACLs for postgres-created tables are not guaranteed to cover
-- authenticated/service_role (the local image grants only TRUNCATE/REFERENCES/
-- TRIGGER), and explicit deny-by-default beats implicit grants anyway:
--   authenticated → DML gated row-by-row by RLS policies
--   anon          → schema usage only, NO table grants (guest flows come later
--                   through edge functions, never direct table access)
--   service_role  → full access (gateway + edge functions; BYPASSRLS)

grant usage on schema public to authenticated, anon, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
