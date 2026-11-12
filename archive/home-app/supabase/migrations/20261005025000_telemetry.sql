-- ============================================================================
-- Telemetry: readings forwarded by the phone while connected over BLE, and
-- the charging sessions derived from them.
--
-- charger_readings is high-volume (one row per second per connected charger
-- while a screen is open) so it is range-partitioned by month from day one,
-- with children in the `partitions` schema (never `public` — PostgREST
-- exposes every public table and RLS on a parent does not protect a child
-- queried directly). A pg_cron job keeps a rolling window.
-- ============================================================================

create schema if not exists partitions;
revoke all on schema partitions from public;
grant usage on schema partitions to postgres, service_role;
comment on schema partitions is
  'Children of partitioned public tables. Not API-reachable; query the parent in public.';

-- ── Readings ───────────────────────────────────────────────────────────────

create table public.charger_readings (
  charger_id uuid not null references public.chargers (id) on delete cascade,
  recorded_at timestamptz not null,
  state text not null,
  power_kw numeric(6, 3),
  current_l1_a numeric(6, 2),
  current_l2_a numeric(6, 2),
  current_l3_a numeric(6, 2),
  voltage_l1_v numeric(6, 1),
  voltage_l2_v numeric(6, 1),
  voltage_l3_v numeric(6, 1),
  energy_total_kwh numeric(12, 3),
  session_kwh numeric(10, 3),
  temperature_c numeric(5, 1),
  source text not null default 'ble' check (source in ('ble', 'wifi', 'sim')),
  reported_by uuid,
  primary key (charger_id, recorded_at)
) partition by range (recorded_at);

alter table public.charger_readings enable row level security;
grant select on public.charger_readings to authenticated;
-- inserts: ingest_readings() only

create policy charger_readings_select on public.charger_readings
  for select to authenticated
  using (charger_id in (select c.id from public.chargers c));

-- ── Partition maintenance (pattern shared with Voltara CSMS) ───────────────

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
  execute format('revoke all on partitions.%I from authenticated, anon', part_name);
end;
$$;

-- Current month plus p_months_ahead; drop months entirely older than retention.
create or replace function public.maintain_partitions(
  p_months_ahead int default 2,
  p_readings_retention_days int default 400
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
    perform public.create_monthly_partition(
      'charger_readings', (current_date + (m || ' month')::interval)::date
    );
  end loop;

  for child in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'partitions' and c.relname ~ '^charger_readings_\d{6}$'
  loop
    child_month := to_date(right(child.relname, 6), 'YYYYMM');
    if child_month + interval '1 month' < current_date - (p_readings_retention_days || ' days')::interval then
      execute format('drop table partitions.%I', child.relname);
    end if;
  end loop;
end;
$$;

revoke execute on function public.create_monthly_partition(text, date) from authenticated, anon, public;
revoke execute on function public.maintain_partitions(int, int) from authenticated, anon, public;

select public.maintain_partitions();

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('voltara-home-maintain-partitions', '0 18 * * *',  -- 02:00 MYT
                        'select public.maintain_partitions()');
exception when others then
  raise notice 'pg_cron unavailable (%), run maintain_partitions() manually here', sqlerrm;
end;
$$;

-- ── Sessions ───────────────────────────────────────────────────────────────

create table public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.chargers (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_energy_kwh numeric(12, 3),
  end_energy_kwh numeric(12, 3),
  kwh numeric(10, 3) generated always as (
    case
      when end_energy_kwh is null or start_energy_kwh is null then null
      else greatest(end_energy_kwh - start_energy_kwh, 0)
    end
  ) stored,
  max_power_kw numeric(6, 3),
  started_by uuid references auth.users (id) on delete set null,
  stop_reason text,
  -- Filled in later by the tariff feature (sen-exact, like the CSMS).
  cost_sen integer,
  tariff_snapshot jsonb,
  source text not null default 'ble' check (source in ('ble', 'wifi', 'sim')),
  created_at timestamptz not null default now()
);

create index charging_sessions_charger_id_started_at_idx
  on public.charging_sessions (charger_id, started_at desc);
-- At most one open session per charger.
create unique index charging_sessions_one_open_idx
  on public.charging_sessions (charger_id) where ended_at is null;

alter table public.charging_sessions enable row level security;
grant select on public.charging_sessions to authenticated;

create policy charging_sessions_select on public.charging_sessions
  for select to authenticated
  using (charger_id in (select c.id from public.chargers c));

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Batch of ReadingRow objects (see @voltara/shared toReadingRow). Duplicate
-- timestamps are ignored; the latest row becomes chargers.last_status.
create or replace function public.ingest_readings(p_charger_id uuid, p_readings jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted int;
  latest jsonb;
begin
  if public.charger_role(p_charger_id) is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_readings) <> 'array' then
    raise exception 'p_readings must be a JSON array';
  end if;

  perform set_config('voltara.rpc', 'on', true);

  with rows as (
    select *
    from jsonb_to_recordset(p_readings) as r(
      at timestamptz,
      state text,
      power_kw numeric,
      i1 numeric, i2 numeric, i3 numeric,
      v1 numeric, v2 numeric, v3 numeric,
      energy_total_kwh numeric,
      session_kwh numeric,
      temperature_c numeric,
      source text
    )
    where at is not null and at > now() - interval '7 days' and at < now() + interval '5 minutes'
  ),
  ins as (
    insert into public.charger_readings (
      charger_id, recorded_at, state, power_kw,
      current_l1_a, current_l2_a, current_l3_a,
      voltage_l1_v, voltage_l2_v, voltage_l3_v,
      energy_total_kwh, session_kwh, temperature_c, source, reported_by
    )
    select
      p_charger_id, at, coalesce(state, 'Unknown'), power_kw,
      i1, i2, i3, v1, v2, v3,
      energy_total_kwh, session_kwh, temperature_c,
      coalesce(source, 'ble'), auth.uid()
    from rows
    on conflict (charger_id, recorded_at) do nothing
    returning 1
  )
  select count(*) into inserted from ins;

  select r into latest
  from jsonb_array_elements(p_readings) r
  order by (r ->> 'at')::timestamptz desc
  limit 1;

  if latest is not null then
    update public.chargers set
      last_seen_at = greatest(coalesce(last_seen_at, 'epoch'), (latest ->> 'at')::timestamptz),
      last_status = latest
    where id = p_charger_id;
  end if;

  return inserted;
end;
$$;

create or replace function public.open_session(
  p_charger_id uuid,
  p_started_at timestamptz,
  p_start_energy_kwh numeric,
  p_source text default 'ble'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.charger_role(p_charger_id) is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- Reuse an open session rather than violate the one-open rule.
  select id into v_id from public.charging_sessions
  where charger_id = p_charger_id and ended_at is null;
  if found then
    return v_id;
  end if;
  insert into public.charging_sessions (charger_id, started_at, start_energy_kwh, started_by, source)
  values (p_charger_id, p_started_at, p_start_energy_kwh, auth.uid(), p_source)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.close_session(
  p_session_id uuid,
  p_ended_at timestamptz,
  p_end_energy_kwh numeric,
  p_max_power_kw numeric default null,
  p_stop_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charger uuid;
begin
  select charger_id into v_charger from public.charging_sessions where id = p_session_id;
  if not found or public.charger_role(v_charger) is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.charging_sessions set
    ended_at = greatest(p_ended_at, started_at),
    end_energy_kwh = p_end_energy_kwh,
    max_power_kw = coalesce(p_max_power_kw, max_power_kw),
    stop_reason = coalesce(p_stop_reason, stop_reason)
  where id = p_session_id and ended_at is null;
end;
$$;

revoke execute on function public.ingest_readings(uuid, jsonb) from anon, public;
revoke execute on function public.open_session(uuid, timestamptz, numeric, text) from anon, public;
revoke execute on function public.close_session(uuid, timestamptz, numeric, numeric, text) from anon, public;
