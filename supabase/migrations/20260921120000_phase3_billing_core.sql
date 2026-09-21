-- ============================================================================
-- Phase 3 — billing core (docs/phase3-billing-design.md, ADR-0005, ADR-0006).
--
-- Tariffs are OCPI 2.2.1-shaped: a tariff has immutable versions, each a list
-- of elements (price components + restrictions) stored as jsonb and validated
-- by the shared zod schema. Assignments bind a tariff to a scope (tenant /
-- location / charge point / connector) for an audience (everyone / ad-hoc /
-- a driver group). Sessions freeze the resolved version at start; CDRs are the
-- immutable priced record written at stop; documents (receipt / invoice /
-- credit note / settlement) are built from CDRs.
--
-- Money is integer sen. Tax is a separate component on every line: SST's
-- applicability to EV charging is unresolved, so the rate is per tenant,
-- re-rateable, and never folded into a price.
-- ============================================================================

-- ── Tenant identity for documents (MyInvois fields) ─────────────────────────

alter table public.tenant_settings
  add column if not exists legal_name text,
  add column if not exists business_registration_no text,
  add column if not exists tax_identification_no text,
  add column if not exists address text,
  add column if not exists payment_provider text
    check (payment_provider in ('stripe', 'none')) default 'none';

comment on column public.tenant_settings.tax_identification_no is
  'LHDN TIN of the operator — the seller identity on invoices (MyInvois).';

-- ── Tax profiles ────────────────────────────────────────────────────────────
-- One row per rate the tenant may apply. rate_bps = basis points (800 = 8%).
-- Starting position is 0% with the machinery live; the rate flips when the
-- SST position on EV charging is confirmed. Historic documents keep the rate
-- they were issued with — nothing is re-rated retroactively by editing this.

create table public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  -- The label that prints on documents ("SST 8%", "Not taxable").
  code text not null default 'SST',
  rate_bps int not null default 0 check (rate_bps >= 0 and rate_bps <= 10000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tax_profiles_tenant_id_idx on public.tax_profiles (tenant_id);
create unique index tax_profiles_one_default_idx on public.tax_profiles (tenant_id) where is_default;

create trigger tax_profiles_set_updated_at
  before update on public.tax_profiles
  for each row execute function extensions.moddatetime (updated_at);

alter table public.tax_profiles enable row level security;

create policy tax_profiles_select on public.tax_profiles
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy tax_profiles_insert on public.tax_profiles
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy tax_profiles_update on public.tax_profiles
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy tax_profiles_delete on public.tax_profiles
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Billing accounts (the payer) ────────────────────────────────────────────

create table public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null default 'individual'
    check (kind in ('individual', 'corporate', 'site_host')),
  name text not null,
  email text,
  phone text,
  -- How this payer settles (AMPECO's models). Phase 3 stores and reports on
  -- it; Phase 5 moves the money.
  billing_model text not null default 'postpaid_invoice'
    check (billing_model in (
      'postpaid_card', 'preauth', 'wallet', 'postpaid_invoice', 'corporate',
      'subscription', 'voucher', 'open'
    )),
  -- MyInvois buyer identity.
  legal_name text,
  business_registration_no text,
  tax_identification_no text,
  sst_registration_no text,
  address text,
  -- Corporate caps (sen, per billing period). Null = uncapped.
  pool_cap_sen bigint check (pool_cap_sen is null or pool_cap_sen >= 0),
  per_driver_cap_sen bigint check (per_driver_cap_sen is null or per_driver_cap_sen >= 0),
  -- Site hosts (JMB, landlord) are payers for their own sessions AND payees
  -- under site_host_agreements.
  location_id uuid references public.locations (id) on delete set null,
  -- Provider-agnostic (ADR-0005): the Stripe customer id lives here.
  provider_customer_id text,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_accounts_tenant_id_idx on public.billing_accounts (tenant_id, status);
create index billing_accounts_location_id_idx on public.billing_accounts (location_id);

create trigger billing_accounts_set_updated_at
  before update on public.billing_accounts
  for each row execute function extensions.moddatetime (updated_at);

alter table public.billing_accounts enable row level security;

create policy billing_accounts_select on public.billing_accounts
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy billing_accounts_insert on public.billing_accounts
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy billing_accounts_update on public.billing_accounts
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy billing_accounts_delete on public.billing_accounts
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- An ID tag can belong to a payer: a resident's card bills the resident.
alter table public.id_tags
  add column if not exists billing_account_id uuid references public.billing_accounts (id) on delete set null;
create index if not exists id_tags_billing_account_id_idx on public.id_tags (billing_account_id);

-- ── Driver groups (Monta price groups) ──────────────────────────────────────

create table public.driver_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  kind text not null default 'custom'
    check (kind in ('residents', 'staff', 'fleet', 'partner', 'custom')),
  description text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index driver_groups_tenant_id_idx on public.driver_groups (tenant_id);

alter table public.driver_groups enable row level security;

create policy driver_groups_select on public.driver_groups
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy driver_groups_insert on public.driver_groups
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy driver_groups_update on public.driver_groups
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy driver_groups_delete on public.driver_groups
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- Membership by ID tag or by billing account (a whole corporate account's
-- drivers). Driver app users arrive in Phase 4 as a third identity.
create table public.driver_group_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  driver_group_id uuid not null references public.driver_groups (id) on delete cascade,
  id_tag_id uuid references public.id_tags (id) on delete cascade,
  billing_account_id uuid references public.billing_accounts (id) on delete cascade,
  driver_user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(id_tag_id, billing_account_id, driver_user_id) = 1)
);

create index driver_group_members_tenant_id_idx on public.driver_group_members (tenant_id);
create index driver_group_members_group_idx on public.driver_group_members (driver_group_id);
create index driver_group_members_id_tag_idx on public.driver_group_members (id_tag_id);
create index driver_group_members_account_idx on public.driver_group_members (billing_account_id);
create index driver_group_members_user_idx on public.driver_group_members (driver_user_id);
create unique index driver_group_members_unique_tag on public.driver_group_members (driver_group_id, id_tag_id) where id_tag_id is not null;
create unique index driver_group_members_unique_account on public.driver_group_members (driver_group_id, billing_account_id) where billing_account_id is not null;
create unique index driver_group_members_unique_user on public.driver_group_members (driver_group_id, driver_user_id) where driver_user_id is not null;

alter table public.driver_group_members enable row level security;

create policy driver_group_members_select on public.driver_group_members
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy driver_group_members_insert on public.driver_group_members
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy driver_group_members_delete on public.driver_group_members
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Tariffs & immutable versions ────────────────────────────────────────────

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text,
  currency text not null default 'MYR',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index tariffs_tenant_id_idx on public.tariffs (tenant_id, status);

create trigger tariffs_set_updated_at
  before update on public.tariffs
  for each row execute function extensions.moddatetime (updated_at);

alter table public.tariffs enable row level security;

create policy tariffs_select on public.tariffs
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy tariffs_insert on public.tariffs
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy tariffs_update on public.tariffs
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy tariffs_delete on public.tariffs
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- Editing a tariff = inserting the next version. Versions never change: a
-- session snapshot and a CDR both point at one by id and must stay true.
create table public.tariff_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tariff_id uuid not null references public.tariffs (id) on delete cascade,
  version int not null,
  -- OCPI 2.2.1 TariffElement[] — validated by @voltara/shared before insert
  -- and structurally here. Prices are integer sen per OCPI unit
  -- (ENERGY: per kWh · TIME/PARKING_TIME: per hour · FLAT: once).
  elements jsonb not null,
  min_price_sen bigint check (min_price_sen is null or min_price_sen >= 0),
  max_price_sen bigint check (max_price_sen is null or max_price_sen >= 0),
  -- Whether the sen amounts in `elements` already include tax (retail
  -- convention) or exclude it (B2B convention). The engine derives the other.
  tax_included boolean not null default true,
  tax_profile_id uuid references public.tax_profiles (id) on delete restrict,
  -- What drivers see ("RM 1.20/kWh · idle RM 1/min after 15 min").
  display_text text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tariff_id, version),
  check (jsonb_typeof(elements) = 'array' and jsonb_array_length(elements) >= 1)
);

create index tariff_versions_tenant_id_idx on public.tariff_versions (tenant_id);
create index tariff_versions_tariff_idx on public.tariff_versions (tariff_id, version desc);
create index tariff_versions_tax_profile_idx on public.tariff_versions (tax_profile_id);
create index tariff_versions_created_by_idx on public.tariff_versions (created_by);

alter table public.tariff_versions enable row level security;

create policy tariff_versions_select on public.tariff_versions
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy tariff_versions_insert on public.tariff_versions
  for insert to authenticated
  with check (
    tenant_id = (select public.jwt_tenant_id())
    and (select public.is_tenant_admin())
    and created_by = (select auth.uid())
  );
-- No update/delete policies for anyone, and a belt-and-braces trigger so even
-- the service role cannot rewrite history by accident.

create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '55000';
end;
$$;

revoke execute on function public.forbid_mutation() from anon, authenticated, public;

create trigger tariff_versions_immutable
  before update or delete on public.tariff_versions
  for each row execute function public.forbid_mutation();

-- Allocates the next version number atomically.
create or replace function public.next_tariff_version(p_tariff_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(max(version), 0) + 1 from public.tariff_versions where tariff_id = p_tariff_id;
$$;

revoke execute on function public.next_tariff_version(uuid) from anon, public;
grant execute on function public.next_tariff_version(uuid) to authenticated;

-- ── Tariff assignments ──────────────────────────────────────────────────────
-- Which tariff applies where, for whom. Resolution: most specific scope wins
-- (connector › charge point › location › tenant); within a scope, a group
-- match beats ad-hoc, which beats 'all'; then priority desc; then newest.

create table public.tariff_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tariff_id uuid not null references public.tariffs (id) on delete cascade,
  scope_type text not null check (scope_type in ('tenant', 'location', 'charge_point', 'connector')),
  location_id uuid references public.locations (id) on delete cascade,
  charge_point_id uuid references public.charge_points (id) on delete cascade,
  connector_id uuid references public.connectors (id) on delete cascade,
  audience text not null default 'all' check (audience in ('all', 'ad_hoc', 'group')),
  driver_group_id uuid references public.driver_groups (id) on delete cascade,
  priority int not null default 0,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  check (
    (scope_type = 'tenant' and location_id is null and charge_point_id is null and connector_id is null) or
    (scope_type = 'location' and location_id is not null and charge_point_id is null and connector_id is null) or
    (scope_type = 'charge_point' and charge_point_id is not null and connector_id is null) or
    (scope_type = 'connector' and connector_id is not null)
  ),
  check ((audience = 'group') = (driver_group_id is not null)),
  check (valid_to is null or valid_to > valid_from)
);

create index tariff_assignments_tenant_id_idx on public.tariff_assignments (tenant_id);
create index tariff_assignments_tariff_idx on public.tariff_assignments (tariff_id);
create index tariff_assignments_location_idx on public.tariff_assignments (location_id);
create index tariff_assignments_charge_point_idx on public.tariff_assignments (charge_point_id);
create index tariff_assignments_connector_idx on public.tariff_assignments (connector_id);
create index tariff_assignments_group_idx on public.tariff_assignments (driver_group_id);

alter table public.tariff_assignments enable row level security;

create policy tariff_assignments_select on public.tariff_assignments
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy tariff_assignments_insert on public.tariff_assignments
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy tariff_assignments_update on public.tariff_assignments
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy tariff_assignments_delete on public.tariff_assignments
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Site host agreements (revenue share) ────────────────────────────────────

create table public.site_host_agreements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  host_account_id uuid not null references public.billing_accounts (id) on delete restrict,
  revenue_share_bps_ac int not null default 0 check (revenue_share_bps_ac between 0 and 10000),
  revenue_share_bps_dc int not null default 0 check (revenue_share_bps_dc between 0 and 10000),
  fixed_monthly_fee_sen bigint not null default 0 check (fixed_monthly_fee_sen >= 0),
  -- Electricity is either deducted from the shared revenue at this rate, or
  -- reimbursed to the host who pays the utility bill.
  electricity_sen_per_kwh int not null default 0 check (electricity_sen_per_kwh >= 0),
  electricity_basis text not null default 'none'
    check (electricity_basis in ('none', 'deduct_from_share', 'reimburse_host')),
  valid_from date not null default current_date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_host_agreements_tenant_id_idx on public.site_host_agreements (tenant_id);
create index site_host_agreements_location_idx on public.site_host_agreements (location_id);
create index site_host_agreements_host_idx on public.site_host_agreements (host_account_id);

create trigger site_host_agreements_set_updated_at
  before update on public.site_host_agreements
  for each row execute function extensions.moddatetime (updated_at);

alter table public.site_host_agreements enable row level security;

create policy site_host_agreements_select on public.site_host_agreements
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy site_host_agreements_insert on public.site_host_agreements
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy site_host_agreements_update on public.site_host_agreements
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy site_host_agreements_delete on public.site_host_agreements
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── Sessions: what the gateway resolves at start and tracks to stop ─────────

alter table public.charging_sessions
  add column if not exists billing_account_id uuid references public.billing_accounts (id) on delete set null,
  add column if not exists driver_group_id uuid references public.driver_groups (id) on delete set null,
  add column if not exists tariff_version_id uuid references public.tariff_versions (id) on delete set null,
  -- Moment the EV stopped drawing power (connector left Charging for good);
  -- idle time is counted from here to ended_at.
  add column if not exists charging_ended_at timestamptz,
  add column if not exists idle_seconds int check (idle_seconds is null or idle_seconds >= 0);

create index if not exists charging_sessions_billing_account_idx on public.charging_sessions (billing_account_id);
create index if not exists charging_sessions_driver_group_idx on public.charging_sessions (driver_group_id);
create index if not exists charging_sessions_tariff_version_idx on public.charging_sessions (tariff_version_id);

-- ── CDRs (immutable) ────────────────────────────────────────────────────────

create table public.cdrs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charging_session_id uuid references public.charging_sessions (id) on delete set null,
  charge_point_id uuid references public.charge_points (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  ocpp_connector_id int,
  ocpp_identity text,
  billing_account_id uuid references public.billing_accounts (id) on delete set null,
  driver_group_id uuid references public.driver_groups (id) on delete set null,
  id_tag text,
  auth_method text not null default 'whitelist'
    check (auth_method in ('whitelist', 'auth_request', 'command', 'ad_hoc')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  total_energy_wh bigint not null default 0,
  total_time_s int not null default 0,
  total_parking_time_s int not null default 0,
  currency text not null default 'MYR',
  tariff_id uuid references public.tariffs (id) on delete set null,
  tariff_version_id uuid references public.tariff_versions (id) on delete set null,
  -- Frozen copies: the priced record must be reproducible from itself.
  tariff_snapshot jsonb,
  charging_periods jsonb not null default '[]'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  total_energy_cost_sen bigint not null default 0,
  total_time_cost_sen bigint not null default 0,
  total_parking_cost_sen bigint not null default 0,
  total_fixed_cost_sen bigint not null default 0,
  subtotal_sen bigint not null default 0,
  tax_rate_bps int not null default 0,
  tax_sen bigint not null default 0,
  total_sen bigint not null default 0,
  -- Orphaned stops, sessions without a tariff, or free access are recorded
  -- but flagged so an invoice run never bills them silently.
  billable boolean not null default true,
  unbillable_reason text,
  -- Corrections are new rows (OCPI credit CDRs), never edits.
  credit boolean not null default false,
  credit_reference_id uuid references public.cdrs (id) on delete restrict,
  invoice_document_id uuid,
  remark text,
  created_at timestamptz not null default now()
);

create unique index cdrs_session_idx on public.cdrs (charging_session_id) where charging_session_id is not null and not credit;
create index cdrs_tenant_id_idx on public.cdrs (tenant_id, start_at desc);
create index cdrs_tenant_billable_idx on public.cdrs (tenant_id, billing_account_id, start_at desc) where billable;
create index cdrs_charge_point_idx on public.cdrs (charge_point_id);
create index cdrs_location_idx on public.cdrs (location_id);
create index cdrs_billing_account_idx on public.cdrs (billing_account_id);
create index cdrs_driver_group_idx on public.cdrs (driver_group_id);
create index cdrs_tariff_idx on public.cdrs (tariff_id);
create index cdrs_tariff_version_idx on public.cdrs (tariff_version_id);
create index cdrs_credit_reference_idx on public.cdrs (credit_reference_id);
create index cdrs_invoice_document_idx on public.cdrs (invoice_document_id);

alter table public.cdrs enable row level security;

create policy cdrs_select on public.cdrs
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
-- Writes are the gateway's (service role) and the invoice run's. The only
-- column that may ever change is the invoice link; everything else is frozen.

create or replace function public.cdrs_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CDRs cannot be deleted; issue a credit CDR' using errcode = '55000';
  end if;
  if to_jsonb(new) - 'invoice_document_id' <> to_jsonb(old) - 'invoice_document_id' then
    raise exception 'CDRs are immutable except for invoice_document_id; issue a credit CDR' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke execute on function public.cdrs_guard_mutation() from anon, authenticated, public;

create trigger cdrs_immutable
  before update or delete on public.cdrs
  for each row execute function public.cdrs_guard_mutation();

-- ── Documents ───────────────────────────────────────────────────────────────

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('receipt', 'invoice', 'credit_note', 'settlement')),
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  billing_account_id uuid references public.billing_accounts (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  period_start date,
  period_end date,
  currency text not null default 'MYR',
  -- Snapshots: the seller and buyer as they were when issued (MyInvois needs
  -- both), and the lines. A document must render identically forever.
  seller jsonb not null default '{}'::jsonb,
  buyer jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  subtotal_sen bigint not null default 0,
  tax_sen bigint not null default 0,
  total_sen bigint not null default 0,
  tax_summary jsonb not null default '[]'::jsonb,
  references_document_id uuid references public.documents (id) on delete set null,
  pdf_path text,
  einvoice_status text not null default 'not_submitted'
    check (einvoice_status in ('not_submitted', 'submitted', 'validated', 'rejected', 'exempt')),
  einvoice_uuid text,
  issued_at timestamptz,
  due_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create index documents_tenant_id_idx on public.documents (tenant_id, kind, status, created_at desc);
create index documents_billing_account_idx on public.documents (billing_account_id);
create index documents_location_idx on public.documents (location_id);
create index documents_references_idx on public.documents (references_document_id);
create index documents_created_by_idx on public.documents (created_by);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function extensions.moddatetime (updated_at);

alter table public.documents enable row level security;

create policy documents_select on public.documents
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    tenant_id = (select public.jwt_tenant_id())
    and (select public.is_tenant_admin())
    and created_by = (select auth.uid())
  );
create policy documents_update on public.documents
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
-- No delete: void it instead.

-- An issued document is frozen except for its lifecycle/e-invoice fields.
create or replace function public.documents_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  frozen text[] := array['kind', 'number', 'billing_account_id', 'period_start', 'period_end',
                         'currency', 'seller', 'buyer', 'lines', 'subtotal_sen', 'tax_sen',
                         'total_sen', 'tax_summary', 'issued_at'];
  col text;
begin
  if old.status = 'issued' then
    foreach col in array frozen loop
      if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
        raise exception 'issued documents are immutable (%); issue a credit note', col using errcode = '55000';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke execute on function public.documents_guard_mutation() from anon, authenticated, public;

create trigger documents_immutable_when_issued
  before update on public.documents
  for each row execute function public.documents_guard_mutation();

alter table public.cdrs
  add constraint cdrs_invoice_document_fk
  foreign key (invoice_document_id) references public.documents (id) on delete set null;

-- Per-tenant, per-kind, per-month numbering: R-202609-0001, INV-…, CN-…, ST-….
create table public.document_sequences (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null,
  period text not null,
  next int not null default 1,
  primary key (tenant_id, kind, period)
);

alter table public.document_sequences enable row level security;
-- No authenticated policies: only the numbering function touches it.

create or replace function public.next_document_number(p_kind text, p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_period text := to_char(p_at at time zone 'Asia/Kuala_Lumpur', 'YYYYMM');
  v_prefix text;
  v_next int;
begin
  if v_tenant is null then
    raise exception 'No tenant in session' using errcode = '42501';
  end if;
  v_prefix := case p_kind
    when 'receipt' then 'R' when 'invoice' then 'INV'
    when 'credit_note' then 'CN' when 'settlement' then 'ST'
    else null end;
  if v_prefix is null then
    raise exception 'Unknown document kind %', p_kind using errcode = '22023';
  end if;

  insert into public.document_sequences (tenant_id, kind, period, next)
  values (v_tenant, p_kind, v_period, 2)
  on conflict (tenant_id, kind, period) do update set next = public.document_sequences.next + 1
  returning next - 1 into v_next;

  return format('%s-%s-%s', v_prefix, v_period, lpad(v_next::text, 4, '0'));
end;
$$;

revoke execute on function public.next_document_number(text, timestamptz) from anon, public;
grant execute on function public.next_document_number(text, timestamptz) to authenticated;

-- ── Webhooks (skeleton) ─────────────────────────────────────────────────────

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null,
  -- HMAC-SHA256 signing secret. Shown once at creation; readable by admins.
  secret text not null,
  events text[] not null default '{session.completed}',
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index webhooks_tenant_id_idx on public.webhooks (tenant_id) where active;

create trigger webhooks_set_updated_at
  before update on public.webhooks
  for each row execute function extensions.moddatetime (updated_at);

alter table public.webhooks enable row level security;

create policy webhooks_select on public.webhooks
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy webhooks_insert on public.webhooks
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy webhooks_update on public.webhooks
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
create policy webhooks_delete on public.webhooks
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  last_status_code int,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index webhook_deliveries_tenant_id_idx on public.webhook_deliveries (tenant_id, created_at desc);
create index webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);
create index webhook_deliveries_pending_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';

alter table public.webhook_deliveries enable row level security;

create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));
-- Writes are the dispatcher's (service role).
