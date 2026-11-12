-- ============================================================================
-- Firmware releases, support tickets, audit log, and the views the admin
-- portal and app read. Views use security_invoker so RLS on the underlying
-- tables still applies to whoever queries them.
-- ============================================================================

-- ── Firmware ───────────────────────────────────────────────────────────────

create table public.firmware_releases (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.charger_models (id) on delete cascade,
  version text not null,
  notes text,
  -- Object path in the (future) `firmware` storage bucket.
  storage_path text,
  is_rollout boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (model_id, version)
);

alter table public.firmware_releases enable row level security;
grant select, insert, update, delete on public.firmware_releases to authenticated;

create policy firmware_releases_select on public.firmware_releases
  for select to authenticated using (true);

create policy firmware_releases_write on public.firmware_releases
  for all to authenticated
  using ((select public.is_staff_support()))
  with check ((select public.is_staff_support()));

-- ── Support tickets ────────────────────────────────────────────────────────

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid references public.chargers (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_status_created_at_idx on public.support_tickets (status, created_at desc);
create index support_tickets_user_id_idx on public.support_tickets (user_id);
create index support_tickets_charger_id_idx on public.support_tickets (charger_id);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function extensions.moddatetime(updated_at);

alter table public.support_tickets enable row level security;
grant select, insert, update on public.support_tickets to authenticated;

create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_staff())
    or (charger_id is not null and (select public.charger_role(charger_id)) = 'dealer')
  );

create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (charger_id is null or (select public.charger_role(charger_id)) is not null)
  );

create policy support_tickets_update on public.support_tickets
  for update to authenticated
  using ((select public.is_staff_support()) or user_id = (select auth.uid()))
  with check ((select public.is_staff_support()) or user_id = (select auth.uid()));

-- ── Audit log (staff actions) ──────────────────────────────────────────────

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user', 'system')),
  action text not null,
  resource_type text,
  resource_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;
grant select, insert on public.audit_log to authenticated;

create policy audit_log_select_staff on public.audit_log
  for select to authenticated
  using ((select public.is_staff()));

create policy audit_log_insert_staff on public.audit_log
  for insert to authenticated
  with check ((select public.is_staff()) and actor_user_id = (select auth.uid()));

-- ── Views ──────────────────────────────────────────────────────────────────

-- One row per charger with everything a list needs. RLS of chargers applies.
create or replace view public.vw_chargers
with (security_invoker = true)
as
select
  c.id,
  c.serial,
  c.name,
  c.lifecycle,
  c.model_id,
  m.brand as model_brand,
  m.model as model_code,
  m.name as model_name,
  m.rated_kw,
  m.rated_amps as model_rated_amps,
  m.phases,
  m.protocol,
  c.owner_user_id,
  op.full_name as owner_name,
  op.email as owner_email,
  c.dealer_id,
  d.name as dealer_name,
  c.installed_by,
  ip.full_name as installer_name,
  c.commissioned_at,
  c.claimed_at,
  c.firmware_version,
  c.rated_current_a,
  c.phase_mode,
  c.site_label,
  c.city,
  c.state,
  c.postcode,
  c.notes,
  c.last_seen_at,
  c.last_status,
  (c.last_status ->> 'state') as last_state,
  (c.last_status ->> 'power_kw')::numeric as last_power_kw,
  (c.last_seen_at > now() - interval '10 minutes') as seen_recently,
  s.max_current_a,
  s.cable_locked,
  s.version as settings_version,
  s.applied_version as settings_applied_version,
  c.created_at,
  c.updated_at
from public.chargers c
join public.charger_models m on m.id = c.model_id
left join public.profiles op on op.id = c.owner_user_id
left join public.dealers d on d.id = c.dealer_id
left join public.profiles ip on ip.id = c.installed_by
left join public.charger_settings s on s.charger_id = c.id;

grant select on public.vw_chargers to authenticated;

-- Team listing: staff + dealer members with their profile. RLS applies.
create or replace view public.vw_people
with (security_invoker = true)
as
select
  p.id as user_id,
  p.email,
  p.full_name,
  p.phone,
  s.role as staff_role,
  dm.dealer_id,
  d.name as dealer_name,
  dm.role as dealer_role,
  p.created_at
from public.profiles p
left join public.staff s on s.user_id = p.id
left join public.dealer_members dm on dm.user_id = p.id
left join public.dealers d on d.id = dm.dealer_id;

grant select on public.vw_people to authenticated;

-- Daily energy per charger for charts. RLS of sessions applies.
create or replace view public.vw_daily_energy
with (security_invoker = true)
as
select
  charger_id,
  (started_at at time zone 'Asia/Kuala_Lumpur')::date as day,
  count(*) as sessions,
  coalesce(sum(kwh), 0) as kwh,
  coalesce(sum(extract(epoch from (ended_at - started_at)) / 60), 0)::int as minutes
from public.charging_sessions
where ended_at is not null
group by 1, 2;

grant select on public.vw_daily_energy to authenticated;

-- Fleet KPIs for the staff overview — one round trip, staff only.
create or replace function public.fleet_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_staff() then jsonb_build_object(
    'chargers_total', (select count(*) from public.chargers where lifecycle <> 'decommissioned'),
    'chargers_claimed', (select count(*) from public.chargers where lifecycle = 'claimed'),
    'chargers_commissioned', (select count(*) from public.chargers where lifecycle = 'commissioned'),
    'chargers_registered', (select count(*) from public.chargers where lifecycle = 'registered'),
    'seen_24h', (select count(*) from public.chargers where last_seen_at > now() - interval '24 hours'),
    'charging_now', (
      select count(*) from public.chargers
      where last_seen_at > now() - interval '10 minutes' and last_status ->> 'state' = 'Charging'
    ),
    'faulted', (
      select count(*) from public.chargers
      where last_seen_at > now() - interval '24 hours' and last_status ->> 'state' = 'Faulted'
    ),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open', 'in_progress')),
    'kwh_30d', (
      select coalesce(sum(kwh), 0) from public.charging_sessions
      where started_at > now() - interval '30 days'
    ),
    'sessions_30d', (
      select count(*) from public.charging_sessions where started_at > now() - interval '30 days'
    ),
    'owners', (select count(distinct owner_user_id) from public.chargers where owner_user_id is not null),
    'dealers', (select count(*) from public.dealers where status = 'active')
  ) else null end
$$;

revoke execute on function public.fleet_overview() from anon, public;
