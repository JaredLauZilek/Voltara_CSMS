-- ============================================================================
-- OCPP runtime: charging sessions, telemetry, raw frame log, status/connection
-- history, the live connection registry, and the admin→gateway command bus.
--
-- Everything here is written by the gateway (service role). Tenant users get
-- SELECT only — see CLAUDE.md §6: the gateway is the sole writer of charger
-- runtime state, and the admin app requests changes via remote_commands.
-- ============================================================================

-- ── Partition schema ────────────────────────────────────────────────────────
-- Child partitions live outside `public` on purpose. PostgREST exposes every
-- table in `public`, and RLS enabled on a partitioned PARENT does not protect a
-- child queried directly — so a partition in `public` would be a way around
-- tenant isolation. Parents stay in `public` with the policies; children live
-- here, ungranted and unexposed. Reads/writes go through the parent.

create schema if not exists partitions;
revoke all on schema partitions from public;
grant usage on schema partitions to postgres, service_role;

comment on schema partitions is
  'Child partitions of high-volume public tables. Not exposed via PostgREST; query the parent in public so RLS applies.';

-- ── Transaction id sequence ─────────────────────────────────────────────────
-- OCPP 1.6 transactionId is a signed 32-bit int, so it cannot be a uuid and
-- must wrap rather than overflow.

create sequence public.ocpp_transaction_id_seq
  as integer start 1 maxvalue 2147483647 cycle;

grant usage, select on sequence public.ocpp_transaction_id_seq to service_role;

-- ── Charging sessions ───────────────────────────────────────────────────────

create table public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  evse_id uuid references public.evses (id) on delete set null,
  connector_id uuid references public.connectors (id) on delete set null,
  ocpp_connector_id int not null,
  ocpp_transaction_id int not null unique,
  id_tag text,
  id_tag_id uuid references public.id_tags (id) on delete set null,
  status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'finishing', 'completed', 'faulted', 'orphaned')),
  started_at timestamptz not null,
  ended_at timestamptz,
  meter_start_wh bigint,
  meter_stop_wh bigint,
  energy_wh bigint,
  stop_reason text,
  stop_id_tag text,
  start_source text not null default 'cable'
    check (start_source in ('cable', 'rfid', 'remote', 'app', 'unknown')),
  -- True when the charger buffered this transaction while offline and replayed
  -- it on reconnect: the timestamps are historical, not observed live.
  offline boolean not null default false,
  reservation_id int,
  -- Phase 3 fills these; declared now so the cost engine is a pure addition.
  tariff_snapshot jsonb,
  amount_gross numeric(12, 4),
  amount_tax numeric(12, 4),
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index charging_sessions_tenant_id_idx on public.charging_sessions (tenant_id);
create index charging_sessions_charge_point_id_idx on public.charging_sessions (charge_point_id);
create index charging_sessions_connector_id_idx on public.charging_sessions (connector_id);
create index charging_sessions_evse_id_idx on public.charging_sessions (evse_id);
create index charging_sessions_id_tag_id_idx on public.charging_sessions (id_tag_id);
create index charging_sessions_started_at_idx on public.charging_sessions (tenant_id, started_at desc);
-- Partial index: the gateway looks up "the open session on this connector" on
-- every StopTransaction and MeterValues, and open sessions are a tiny minority.
create index charging_sessions_open_idx on public.charging_sessions (charge_point_id, ocpp_connector_id)
  where ended_at is null;

create trigger charging_sessions_set_updated_at
  before update on public.charging_sessions
  for each row execute function extensions.moddatetime (updated_at);

alter table public.charging_sessions enable row level security;

create policy charging_sessions_select on public.charging_sessions
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- ── Meter values (partitioned monthly, 90-day retention) ───────────────────

create table public.meter_values (
  id bigint generated always as identity,
  tenant_id uuid not null,
  charge_point_id uuid not null,
  charging_session_id uuid,
  ocpp_connector_id int not null,
  sampled_at timestamptz not null,
  measurand text not null default 'Energy.Active.Import.Register',
  phase text,
  location text,
  unit text,
  value numeric not null,
  context text,
  format text,
  primary key (id, sampled_at)
) partition by range (sampled_at);

create index meter_values_session_idx on public.meter_values (charging_session_id, sampled_at);
create index meter_values_tenant_idx on public.meter_values (tenant_id, sampled_at desc);

alter table public.meter_values enable row level security;

create policy meter_values_select on public.meter_values
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- ── Per-minute rollup ───────────────────────────────────────────────────────
-- Charts read this, never the raw table. Raw values age out after 90 days;
-- the rollup is small enough to keep indefinitely.

create table public.meter_values_agg_1m (
  charging_session_id uuid not null references public.charging_sessions (id) on delete cascade,
  minute timestamptz not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid not null,
  ocpp_connector_id int not null,
  avg_power_w numeric,
  max_power_w numeric,
  energy_wh bigint,
  soc_percent numeric,
  primary key (charging_session_id, minute)
);

create index meter_values_agg_1m_tenant_idx on public.meter_values_agg_1m (tenant_id, minute desc);

alter table public.meter_values_agg_1m enable row level security;

create policy meter_values_agg_1m_select on public.meter_values_agg_1m
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- ── Raw OCPP frame log (partitioned monthly, 30-day retention) ─────────────
-- Every frame in and out. This is the record that settles arguments with
-- charger vendors, so it stores the payload verbatim — except AuthorizationKey
-- values, which the gateway redacts before the row ever gets here.

create table public.ocpp_messages (
  id bigint generated always as identity,
  tenant_id uuid not null,
  charge_point_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  message_type int not null check (message_type in (2, 3, 4)),
  action text,
  ocpp_message_id text,
  payload jsonb,
  error_code text,
  error_description text,
  recorded_at timestamptz not null default now(),
  primary key (id, recorded_at)
) partition by range (recorded_at);

create index ocpp_messages_cp_idx on public.ocpp_messages (charge_point_id, recorded_at desc);
create index ocpp_messages_tenant_idx on public.ocpp_messages (tenant_id, recorded_at desc);
create index ocpp_messages_action_idx on public.ocpp_messages (tenant_id, action, recorded_at desc);

alter table public.ocpp_messages enable row level security;

create policy ocpp_messages_select on public.ocpp_messages
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- ── Status & connection history ─────────────────────────────────────────────

create table public.charge_point_status_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  ocpp_connector_id int not null,
  status text not null,
  error_code text,
  info text,
  vendor_id text,
  vendor_error_code text,
  recorded_at timestamptz not null default now()
);

create index charge_point_status_log_cp_idx on public.charge_point_status_log (charge_point_id, recorded_at desc);
create index charge_point_status_log_tenant_idx on public.charge_point_status_log (tenant_id, recorded_at desc);

alter table public.charge_point_status_log enable row level security;

create policy charge_point_status_log_select on public.charge_point_status_log
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- Source of truth for uptime reporting (Phase 2 onwards).
create table public.charge_point_connection_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  event text not null check (event in ('connected', 'disconnected', 'rejected')),
  gateway_instance text,
  remote_address text,
  close_code int,
  close_reason text,
  recorded_at timestamptz not null default now()
);

create index charge_point_connection_log_cp_idx on public.charge_point_connection_log (charge_point_id, recorded_at desc);
create index charge_point_connection_log_tenant_idx on public.charge_point_connection_log (tenant_id, recorded_at desc);

alter table public.charge_point_connection_log enable row level security;

create policy charge_point_connection_log_select on public.charge_point_connection_log
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- ── Live connection registry ────────────────────────────────────────────────
-- Which gateway instance currently holds each charger's socket. Single-instance
-- today; this is the routing table when the gateway scales out, so the command
-- bus can be pointed at the right process rather than broadcast.

create table public.charge_point_connections (
  ocpp_identity text primary key,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  gateway_instance text not null,
  connected_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index charge_point_connections_cp_idx on public.charge_point_connections (charge_point_id);

alter table public.charge_point_connections enable row level security;
-- No authenticated policies: service-role only.

-- ── Command bus ─────────────────────────────────────────────────────────────
-- The ONLY channel from the admin app to a charger. Insert a row, a trigger
-- fires pg_notify, the gateway holding that charger's socket picks it up and
-- writes the result back. See CLAUDE.md §6.

create table public.remote_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid not null references public.charge_points (id) on delete cascade,
  action text not null check (action in (
    'RemoteStartTransaction', 'RemoteStopTransaction', 'Reset', 'UnlockConnector',
    'ChangeAvailability', 'ChangeConfiguration', 'GetConfiguration', 'ClearCache',
    'TriggerMessage'
  )),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'accepted', 'rejected', 'timeout', 'failed')),
  requested_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  responded_at timestamptz,
  response jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index remote_commands_cp_idx on public.remote_commands (charge_point_id, created_at desc);
create index remote_commands_tenant_idx on public.remote_commands (tenant_id, created_at desc);
create index remote_commands_requested_by_idx on public.remote_commands (requested_by);
-- Startup reconciliation scans this: commands stranded by a gateway restart.
create index remote_commands_queued_idx on public.remote_commands (created_at)
  where status = 'queued';

alter table public.remote_commands enable row level security;

create policy remote_commands_select on public.remote_commands
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- Operators and above may issue commands; the gateway owns every status change.
create policy remote_commands_insert on public.remote_commands
  for insert to authenticated
  with check (
    tenant_id = (select public.jwt_tenant_id())
    and (select public.is_tenant_operator())
    and status = 'queued'
    and requested_by = (select auth.uid())
  );

create or replace function public.notify_remote_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_notify('voltara_remote_commands', new.id::text);
  return new;
end;
$$;

create trigger remote_commands_notify
  after insert on public.remote_commands
  for each row execute function public.notify_remote_command();

-- ── Partition maintenance ───────────────────────────────────────────────────

create or replace function public.create_monthly_partition(p_table text, p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  part_name text := format('%s_%s', p_table, to_char(p_month, 'YYYYMM'));
  range_start timestamptz := date_trunc('month', p_month::timestamptz);
  range_end timestamptz := date_trunc('month', p_month::timestamptz) + interval '1 month';
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'partitions' and c.relname = part_name
  ) then
    return;
  end if;

  execute format(
    'create table partitions.%I partition of public.%I for values from (%L) to (%L)',
    part_name, p_table, range_start, range_end
  );

  -- Belt and braces: children must never be readable in their own right.
  execute format('revoke all on partitions.%I from authenticated, anon', part_name);
end;
$$;

-- Keeps a rolling window: current month plus `p_months_ahead`, dropping
-- anything whose entire range is older than `p_retention_days`.
create or replace function public.maintain_partitions(
  p_months_ahead int default 2,
  p_meter_retention_days int default 90,
  p_message_retention_days int default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m int;
  child record;
  child_month date;
begin
  for m in 0..p_months_ahead loop
    perform public.create_monthly_partition('meter_values', (current_date + (m || ' month')::interval)::date);
    perform public.create_monthly_partition('ocpp_messages', (current_date + (m || ' month')::interval)::date);
  end loop;

  for child in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'partitions'
      and (c.relname ~ '^meter_values_\d{6}$' or c.relname ~ '^ocpp_messages_\d{6}$')
  loop
    child_month := to_date(right(child.relname, 6), 'YYYYMM');

    -- Drop only once the whole month sits behind the retention horizon.
    if child.relname like 'meter_values%'
       and child_month + interval '1 month' < current_date - (p_meter_retention_days || ' days')::interval then
      execute format('drop table partitions.%I', child.relname);
    elsif child.relname like 'ocpp_messages%'
       and child_month + interval '1 month' < current_date - (p_message_retention_days || ' days')::interval then
      execute format('drop table partitions.%I', child.relname);
    end if;
  end loop;
end;
$$;

revoke execute on function public.create_monthly_partition(text, date) from authenticated, anon, public;
revoke execute on function public.maintain_partitions(int, int, int) from authenticated, anon, public;

-- Seed the window so the gateway can write from the moment it boots.
select public.maintain_partitions();

-- ── Rollup ──────────────────────────────────────────────────────────────────
-- Pivots the measurands we chart (power, energy, state of charge) into one row
-- per session-minute. Idempotent: re-running for the same window overwrites.

create or replace function public.rollup_meter_values(p_since interval default interval '15 minutes')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.meter_values_agg_1m as agg (
    charging_session_id, minute, tenant_id, charge_point_id, ocpp_connector_id,
    avg_power_w, max_power_w, energy_wh, soc_percent
  )
  select
    mv.charging_session_id,
    date_trunc('minute', mv.sampled_at) as minute,
    mv.tenant_id,
    mv.charge_point_id,
    mv.ocpp_connector_id,
    avg(mv.value) filter (where mv.measurand = 'Power.Active.Import'),
    max(mv.value) filter (where mv.measurand = 'Power.Active.Import'),
    max(mv.value) filter (where mv.measurand = 'Energy.Active.Import.Register')::bigint,
    max(mv.value) filter (where mv.measurand = 'SoC')
  from public.meter_values mv
  where mv.charging_session_id is not null
    and mv.sampled_at >= now() - p_since
    and (mv.phase is null or mv.phase = '')
  group by 1, 2, 3, 4, 5
  on conflict (charging_session_id, minute) do update
    set avg_power_w = excluded.avg_power_w,
        max_power_w = excluded.max_power_w,
        energy_wh = excluded.energy_wh,
        soc_percent = excluded.soc_percent;
end;
$$;

revoke execute on function public.rollup_meter_values(interval) from authenticated, anon, public;

-- ── Orphan sweep ────────────────────────────────────────────────────────────
-- A charger that vanishes mid-charge leaves a session with no end. Without this
-- they accumulate as permanently "active" and corrupt every utilisation number.

create or replace function public.sweep_orphaned_sessions(p_stale_after interval default interval '12 hours')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected int;
begin
  with stale as (
    update public.charging_sessions s
    set status = 'orphaned',
        ended_at = coalesce(s.ended_at, cp.last_seen_at, s.started_at),
        stop_reason = coalesce(s.stop_reason, 'PowerLoss')
    from public.charge_points cp
    where cp.id = s.charge_point_id
      and s.ended_at is null
      and s.status in ('pending', 'active', 'suspended', 'finishing')
      and cp.connection_state <> 'online'
      and coalesce(cp.last_seen_at, s.started_at) < now() - p_stale_after
    returning 1
  )
  select count(*) into affected from stale;
  return affected;
end;
$$;

revoke execute on function public.sweep_orphaned_sessions(interval) from authenticated, anon, public;

-- ── Scheduled jobs ──────────────────────────────────────────────────────────
-- Guarded: pg_cron is not loaded on the local dev stack, and a missing
-- scheduler must not block a migration that is otherwise valid.

do $$
begin
  create extension if not exists pg_cron;

  perform cron.schedule('voltara-maintain-partitions', '0 18 * * *',  -- 02:00 MYT
                        'select public.maintain_partitions()');
  perform cron.schedule('voltara-rollup-meter-values', '*/5 * * * *',
                        'select public.rollup_meter_values()');
  perform cron.schedule('voltara-sweep-orphaned-sessions', '17 * * * *',
                        'select public.sweep_orphaned_sessions()');
exception when others then
  raise notice 'pg_cron unavailable (%), scheduled jobs skipped — run maintain_partitions/rollup_meter_values/sweep_orphaned_sessions manually in this environment', sqlerrm;
end;
$$;

-- ── Realtime broadcast authorization ────────────────────────────────────────
-- Subscribers may only join their own tenant's private channel. The gateway
-- publishes with the service role and bypasses this; it exists for the admin
-- app and driver app. See CLAUDE.md §8.

do $$
begin
  execute $p$
    create policy tenant_broadcast_read on realtime.messages
      for select to authenticated
      using (realtime.topic() = 'tenant:' || (select public.jwt_tenant_id())::text)
  $p$;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'realtime.messages not present — broadcast policy skipped';
  when undefined_function then
    raise notice 'realtime.topic() not present — broadcast policy skipped';
  when insufficient_privilege then
    raise notice 'cannot create policy on realtime.messages here — apply it in the dashboard';
end;
$$;
