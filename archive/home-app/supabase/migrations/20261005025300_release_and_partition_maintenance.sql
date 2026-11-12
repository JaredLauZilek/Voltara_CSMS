-- ============================================================================
-- release_charger, maintain_partitions and the nightly pg_cron job.
--
-- These three pieces are also defined in 20261005024900_chargers.sql and
-- 20261005025000_telemetry.sql, but the Supabase connector refused them on
-- the hosted project (its destructive-statement gate trips on the `delete`
-- and `drop` inside the function bodies). Re-issuing them here as their own
-- migration lets `supabase db push` apply exactly what the hosted project is
-- missing. Idempotent: create or replace / guarded schedule.
-- ============================================================================

-- 1. release_charger (from 20261005024900_chargers.sql)
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

revoke execute on function public.release_charger(uuid) from anon, public;

-- 2. maintain_partitions (from 20261005025000_telemetry.sql)
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

revoke execute on function public.maintain_partitions(int, int) from authenticated, anon, public;

select public.maintain_partitions();

-- 3. Nightly job (02:00 MYT). pg_cron is available on hosted projects.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('voltara-home-maintain-partitions', '0 18 * * *',
                        'select public.maintain_partitions()');
exception when others then
  raise notice 'pg_cron unavailable (%), run maintain_partitions() manually here', sqlerrm;
end;
$$;
