-- ============================================================================
-- Phase 3 step 5 — documents are assembled in the database.
--
-- Receipts, invoices and settlement statements are built by SECURITY DEFINER
-- functions that authorise the caller from the JWT: the browser never
-- composes a billing document or touches a CDR's invoice link directly. Each
-- function snapshots the seller (tenant_settings) and buyer (billing account)
-- as they are at that moment, so a document renders identically forever.
-- ============================================================================

alter table public.documents
  add column if not exists cdr_id uuid references public.cdrs (id) on delete set null;
create index if not exists documents_cdr_id_idx on public.documents (cdr_id);

-- ── Seller / buyer snapshots ────────────────────────────────────────────────

create or replace function public.seller_snapshot(p_tenant uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'name', coalesce(ts.legal_name, ts.app_name, t.name),
    'trading_name', coalesce(ts.app_name, t.name),
    'business_registration_no', ts.business_registration_no,
    'tax_identification_no', ts.tax_identification_no,
    'sst_registration_no', ts.sst_registration_no,
    'address', ts.address,
    'email', ts.support_email,
    'phone', ts.support_phone,
    'logo_path', ts.logo_path
  )
  from public.tenants t
  left join public.tenant_settings ts on ts.tenant_id = t.id
  where t.id = p_tenant;
$$;

create or replace function public.buyer_snapshot(p_account uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'billing_account_id', b.id,
    'name', b.name,
    'legal_name', b.legal_name,
    'kind', b.kind,
    'email', b.email,
    'phone', b.phone,
    'business_registration_no', b.business_registration_no,
    'tax_identification_no', b.tax_identification_no,
    'sst_registration_no', b.sst_registration_no,
    'address', b.address
  )
  from public.billing_accounts b
  where b.id = p_account;
$$;

revoke execute on function public.seller_snapshot(uuid) from anon, authenticated, public;
revoke execute on function public.buyer_snapshot(uuid) from anon, authenticated, public;

-- ── Receipt for one session ─────────────────────────────────────────────────

create or replace function public.create_receipt(p_cdr_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  c record;
  v_lines jsonb;
  v_id uuid;
begin
  if v_tenant is null or not public.is_tenant_operator() then
    raise exception 'Only operators and above may issue receipts' using errcode = '42501';
  end if;
  select * into c from public.cdrs where id = p_cdr_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Session record not found' using errcode = '42704';
  end if;
  if not c.billable then
    raise exception 'This session is not billable (%)', coalesce(c.unbillable_reason, 'unknown') using errcode = '22023';
  end if;
  select id into v_id from public.documents where cdr_id = p_cdr_id and kind = 'receipt' and status <> 'void' limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'description', l ->> 'label',
      'quantity', l -> 'volume',
      'unit', l ->> 'unit',
      'unit_price_sen', l -> 'unitPriceSen',
      'amount_excl_sen', l -> 'amountExclSen',
      'tax_rate_bps', c.tax_rate_bps,
      'tax_sen', l -> 'taxSen',
      'amount_incl_sen', l -> 'amountInclSen'
    )), '[]'::jsonb)
  into v_lines
  from jsonb_array_elements(c.lines) l;

  insert into public.documents (
    tenant_id, kind, number, status, billing_account_id, location_id, cdr_id,
    period_start, period_end, currency, seller, buyer, lines,
    subtotal_sen, tax_sen, total_sen, tax_summary, issued_at, created_by
  ) values (
    v_tenant, 'receipt', public.next_document_number('receipt'), 'issued',
    c.billing_account_id, c.location_id, c.id,
    (c.start_at at time zone 'Asia/Kuala_Lumpur')::date, (c.end_at at time zone 'Asia/Kuala_Lumpur')::date,
    c.currency, public.seller_snapshot(v_tenant),
    coalesce(public.buyer_snapshot(c.billing_account_id), jsonb_build_object('name', coalesce(c.id_tag, 'Ad-hoc driver'))),
    v_lines, c.subtotal_sen, c.tax_sen, c.total_sen,
    jsonb_build_array(jsonb_build_object('rate_bps', c.tax_rate_bps, 'taxable_sen', c.subtotal_sen, 'tax_sen', c.tax_sen)),
    now(), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_receipt(uuid) from anon, public;
grant execute on function public.create_receipt(uuid) to authenticated;

-- ── Invoice run for one payer and period ────────────────────────────────────
-- Picks up every billable, uninvoiced, non-credit CDR attributed to the
-- account in [period_start, period_end]; one line per session. The document
-- starts as a draft so the operator can review before issuing.

create or replace function public.run_invoice(
  p_billing_account_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_days int default 14
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_lines jsonb;
  v_sub bigint;
  v_tax bigint;
  v_total bigint;
  v_summary jsonb;
  v_id uuid;
  v_count int;
begin
  if v_tenant is null or not public.is_tenant_admin() then
    raise exception 'Only owners and admins may run invoices' using errcode = '42501';
  end if;
  if not exists (select 1 from public.billing_accounts where id = p_billing_account_id and tenant_id = v_tenant) then
    raise exception 'Billing account not found' using errcode = '42704';
  end if;
  if p_period_end < p_period_start then
    raise exception 'Period end is before its start' using errcode = '22023';
  end if;

  -- Two runs inside one transaction (a batch invoicing several accounts) must not collide.
  drop table if exists _inv_cdrs;
  create temp table _inv_cdrs on commit drop as
    select c.*
    from public.cdrs c
    where c.tenant_id = v_tenant
      and c.billing_account_id = p_billing_account_id
      and c.billable and not c.credit
      and c.invoice_document_id is null
      and (c.start_at at time zone 'Asia/Kuala_Lumpur')::date between p_period_start and p_period_end;

  select count(*) into v_count from _inv_cdrs;
  if v_count = 0 then
    raise exception 'No uninvoiced sessions for this account between % and %', p_period_start, p_period_end
      using errcode = '02000';
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'cdr_id', c.id,
      'date', c.start_at,
      'description', format('%s · connector %s · %s kWh',
                            coalesce(cp.name, c.ocpp_identity, 'Charger'), c.ocpp_connector_id,
                            to_char(c.total_energy_wh / 1000.0, 'FM999990.000')),
      'quantity', c.total_energy_wh,
      'unit', 'Wh',
      'amount_excl_sen', c.subtotal_sen,
      'tax_rate_bps', c.tax_rate_bps,
      'tax_sen', c.tax_sen,
      'amount_incl_sen', c.total_sen
    ) order by c.start_at),
    sum(c.subtotal_sen), sum(c.tax_sen), sum(c.total_sen)
  into v_lines, v_sub, v_tax, v_total
  from _inv_cdrs c
  left join public.charge_points cp on cp.id = c.charge_point_id;

  select coalesce(jsonb_agg(jsonb_build_object('rate_bps', r.tax_rate_bps, 'taxable_sen', r.sub, 'tax_sen', r.tax)), '[]'::jsonb)
  into v_summary
  from (select tax_rate_bps, sum(subtotal_sen) as sub, sum(tax_sen) as tax from _inv_cdrs group by tax_rate_bps) r;

  insert into public.documents (
    tenant_id, kind, number, status, billing_account_id, period_start, period_end, currency,
    seller, buyer, lines, subtotal_sen, tax_sen, total_sen, tax_summary, due_at, created_by
  ) values (
    v_tenant, 'invoice', public.next_document_number('invoice'), 'draft', p_billing_account_id,
    p_period_start, p_period_end, 'MYR',
    public.seller_snapshot(v_tenant), public.buyer_snapshot(p_billing_account_id),
    v_lines, v_sub, v_tax, v_total, v_summary, current_date + p_due_days, auth.uid()
  ) returning id into v_id;

  update public.cdrs set invoice_document_id = v_id where id in (select id from _inv_cdrs);

  insert into public.audit_log (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, after)
  values (v_tenant, auth.uid(), 'user', 'document.created', 'document', v_id::text,
          jsonb_build_object('kind', 'invoice', 'sessions', v_count, 'total_sen', v_total));
  return v_id;
end;
$$;

revoke execute on function public.run_invoice(uuid, date, date, int) from anon, public;
grant execute on function public.run_invoice(uuid, date, date, int) to authenticated;

-- ── Settlement statement for a site host ────────────────────────────────────
-- Gross = billable CDR revenue (excl. tax) at the location in the period.
-- Share is applied per AC/DC (by connector standard). Electricity is either
-- deducted from the host's share (host does not pay the utility) or added
-- (host pays the utility and is reimbursed). A fixed platform fee is a
-- deduction. A negative total means the host owes the operator.

create or replace function public.run_settlement(p_location_id uuid, p_period_start date, p_period_end date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  a record;
  v_gross_ac bigint := 0;
  v_gross_dc bigint := 0;
  v_energy_wh bigint := 0;
  v_sessions int := 0;
  v_share_ac bigint;
  v_share_dc bigint;
  v_elec bigint;
  v_lines jsonb := '[]'::jsonb;
  v_total bigint;
  v_id uuid;
begin
  if v_tenant is null or not public.is_tenant_admin() then
    raise exception 'Only owners and admins may run settlements' using errcode = '42501';
  end if;
  select * into a
  from public.site_host_agreements s
  where s.tenant_id = v_tenant and s.location_id = p_location_id
    and s.valid_from <= p_period_end and (s.valid_to is null or s.valid_to >= p_period_start)
  order by s.valid_from desc limit 1;
  if not found then
    raise exception 'No site host agreement covers this site and period' using errcode = '42704';
  end if;

  select
    coalesce(sum(c.subtotal_sen) filter (where coalesce(k.connector_type, 'Type2') not in ('CCS2', 'CHAdeMO', 'GBT_DC')), 0),
    coalesce(sum(c.subtotal_sen) filter (where coalesce(k.connector_type, 'Type2') in ('CCS2', 'CHAdeMO', 'GBT_DC')), 0),
    coalesce(sum(c.total_energy_wh), 0), count(*)
  into v_gross_ac, v_gross_dc, v_energy_wh, v_sessions
  from public.cdrs c
  left join public.connectors k on k.charge_point_id = c.charge_point_id and k.ocpp_connector_id = c.ocpp_connector_id
  where c.tenant_id = v_tenant and c.location_id = p_location_id and c.billable and not c.credit
    and (c.start_at at time zone 'Asia/Kuala_Lumpur')::date between p_period_start and p_period_end;

  v_share_ac := round(v_gross_ac * a.revenue_share_bps_ac / 10000.0);
  v_share_dc := round(v_gross_dc * a.revenue_share_bps_dc / 10000.0);
  v_elec := round(v_energy_wh / 1000.0 * a.electricity_sen_per_kwh);

  v_lines := v_lines
    || jsonb_build_object('description', format('Charging revenue (excl. tax) · %s sessions · %s kWh', v_sessions, to_char(v_energy_wh / 1000.0, 'FM999990.0')),
                          'amount_sen', v_gross_ac + v_gross_dc, 'kind', 'info')
    || jsonb_build_object('description', format('Host share on AC revenue (%s%%)', a.revenue_share_bps_ac / 100.0), 'amount_sen', v_share_ac, 'kind', 'credit');
  if v_gross_dc > 0 or a.revenue_share_bps_dc > 0 then
    v_lines := v_lines || jsonb_build_object('description', format('Host share on DC revenue (%s%%)', a.revenue_share_bps_dc / 100.0), 'amount_sen', v_share_dc, 'kind', 'credit');
  end if;
  v_total := v_share_ac + v_share_dc;
  if a.electricity_basis = 'deduct_from_share' and v_elec > 0 then
    v_lines := v_lines || jsonb_build_object('description', format('Electricity at RM %s/kWh (deducted)', to_char(a.electricity_sen_per_kwh / 100.0, 'FM990.00')), 'amount_sen', -v_elec, 'kind', 'debit');
    v_total := v_total - v_elec;
  elsif a.electricity_basis = 'reimburse_host' and v_elec > 0 then
    v_lines := v_lines || jsonb_build_object('description', format('Electricity reimbursed at RM %s/kWh', to_char(a.electricity_sen_per_kwh / 100.0, 'FM990.00')), 'amount_sen', v_elec, 'kind', 'credit');
    v_total := v_total + v_elec;
  end if;
  if a.fixed_monthly_fee_sen > 0 then
    v_lines := v_lines || jsonb_build_object('description', 'Platform fee', 'amount_sen', -a.fixed_monthly_fee_sen, 'kind', 'debit');
    v_total := v_total - a.fixed_monthly_fee_sen;
  end if;

  insert into public.documents (
    tenant_id, kind, number, status, billing_account_id, location_id, period_start, period_end, currency,
    seller, buyer, lines, subtotal_sen, tax_sen, total_sen, tax_summary, created_by
  ) values (
    v_tenant, 'settlement', public.next_document_number('settlement'), 'draft', a.host_account_id, p_location_id,
    p_period_start, p_period_end, 'MYR',
    public.seller_snapshot(v_tenant), public.buyer_snapshot(a.host_account_id),
    v_lines, v_total, 0, v_total, '[]'::jsonb, auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.run_settlement(uuid, date, date) from anon, public;
grant execute on function public.run_settlement(uuid, date, date) to authenticated;

-- ── Issue / void ────────────────────────────────────────────────────────────

create or replace function public.issue_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
begin
  if v_tenant is null or not public.is_tenant_admin() then
    raise exception 'Only owners and admins may issue documents' using errcode = '42501';
  end if;
  update public.documents set status = 'issued', issued_at = now()
  where id = p_document_id and tenant_id = v_tenant and status = 'draft';
  if not found then
    raise exception 'Only a draft can be issued' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.void_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
begin
  if v_tenant is null or not public.is_tenant_admin() then
    raise exception 'Only owners and admins may void documents' using errcode = '42501';
  end if;
  update public.documents set status = 'void'
  where id = p_document_id and tenant_id = v_tenant and status <> 'void';
  if not found then
    raise exception 'Document not found or already void' using errcode = '22023';
  end if;
  -- Sessions on a voided invoice become invoiceable again.
  update public.cdrs set invoice_document_id = null where invoice_document_id = p_document_id;
end;
$$;

revoke execute on function public.issue_document(uuid) from anon, public;
revoke execute on function public.void_document(uuid) from anon, public;
grant execute on function public.issue_document(uuid) to authenticated;
grant execute on function public.void_document(uuid) to authenticated;

-- ── Revenue summary for reports ─────────────────────────────────────────────
-- SECURITY INVOKER: RLS on cdrs scopes it. One row per site × charger ×
-- driver group; the report groups further client-side.

create or replace function public.revenue_summary(p_from date, p_to date)
returns table (
  location_id uuid, location_name text, charge_point_id uuid, charge_point_name text,
  driver_group_id uuid, driver_group_name text,
  sessions int, unbillable_sessions int, energy_wh bigint, idle_s bigint,
  subtotal_sen bigint, tax_sen bigint, total_sen bigint
)
language sql
stable
set search_path = ''
as $$
  select c.location_id, l.name, c.charge_point_id, cp.name, c.driver_group_id, g.name,
         count(*)::int, count(*) filter (where not c.billable)::int,
         coalesce(sum(c.total_energy_wh), 0), coalesce(sum(c.total_parking_time_s), 0),
         coalesce(sum(c.subtotal_sen) filter (where c.billable), 0),
         coalesce(sum(c.tax_sen) filter (where c.billable), 0),
         coalesce(sum(c.total_sen) filter (where c.billable), 0)
  from public.cdrs c
  left join public.locations l on l.id = c.location_id
  left join public.charge_points cp on cp.id = c.charge_point_id
  left join public.driver_groups g on g.id = c.driver_group_id
  where not c.credit
    and (c.start_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
  group by 1, 2, 3, 4, 5, 6;
$$;

revoke execute on function public.revenue_summary(date, date) from anon, public;
grant execute on function public.revenue_summary(date, date) to authenticated;
