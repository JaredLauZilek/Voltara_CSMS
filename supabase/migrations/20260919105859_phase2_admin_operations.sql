-- ============================================================================
-- Phase 2 — admin operations.
--
-- 1. Issues: the operator's fault/ticket list, attachable to a charger.
-- 2. Team management RPCs: memberships stay service-role-only (CLAUDE.md §10),
--    so admins read and change their tenant's roster through SECURITY DEFINER
--    functions that authorise the caller from the JWT and never accept a
--    tenant id as a parameter.
-- 3. Uptime, computed from charge_point_connection_log.
-- 4. remote_commands lifecycle → Realtime `command_update` event from a
--    trigger (low-frequency, so realtime.send() is allowed — CLAUDE.md §8).
-- 5. Advisor follow-up: charge_point_connections.tenant_id was unindexed.
-- ============================================================================

-- ── 5. Index every policy/FK column (§5) ────────────────────────────────────

create index if not exists charge_point_connections_tenant_id_idx
  on public.charge_point_connections (tenant_id);

-- ── 1. Issues ───────────────────────────────────────────────────────────────

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  charge_point_id uuid references public.charge_points (id) on delete set null,
  ocpp_connector_id int,
  title text not null,
  description text,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  source text not null default 'manual' check (source in ('manual', 'system')),
  opened_by uuid references auth.users (id) on delete set null,
  assigned_to uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index issues_tenant_id_idx on public.issues (tenant_id, status, created_at desc);
create index issues_charge_point_id_idx on public.issues (charge_point_id);
create index issues_opened_by_idx on public.issues (opened_by);
create index issues_assigned_to_idx on public.issues (assigned_to);

create trigger issues_set_updated_at
  before update on public.issues
  for each row execute function extensions.moddatetime (updated_at);

alter table public.issues enable row level security;

create policy issues_select on public.issues
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()));

-- Operators raise and work tickets; only admins may delete one outright.
create policy issues_insert on public.issues
  for insert to authenticated
  with check (
    tenant_id = (select public.jwt_tenant_id())
    and (select public.is_tenant_operator())
    and opened_by = (select auth.uid())
  );

create policy issues_update on public.issues
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_operator()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_operator()));

create policy issues_delete on public.issues
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── 2. Team management ──────────────────────────────────────────────────────

-- The roster with emails. auth.users is not readable by tenant users, so this
-- is the one sanctioned way to see who is on the team.
create or replace function public.list_team_members()
returns table (user_id uuid, email text, role text, joined_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at, u.last_sign_in_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = public.jwt_tenant_id()
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 when 'operator' then 2 else 3 end,
    m.created_at;
$$;

revoke execute on function public.list_team_members() from anon, public;
grant execute on function public.list_team_members() to authenticated;

-- Change a member's role. Owners may set any role; admins may manage everyone
-- below owner. Nobody edits their own role, and the last owner cannot be
-- demoted — a tenant with no owner has nobody who can fix it.
create or replace function public.set_team_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_caller_role text := public.jwt_tenant_role();
  v_target_role text;
  v_owners int;
begin
  if v_tenant is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins may change roles' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'operator', 'viewer') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  select role into v_target_role from public.memberships
  where tenant_id = v_tenant and user_id = p_user_id;
  if v_target_role is null then
    raise exception 'That person is not a member of your operator' using errcode = '42704';
  end if;

  if v_caller_role = 'admin' and (v_target_role = 'owner' or p_role = 'owner') then
    raise exception 'Only an owner may manage owners' using errcode = '42501';
  end if;

  if v_target_role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners from public.memberships where tenant_id = v_tenant and role = 'owner';
    if v_owners <= 1 then
      raise exception 'An operator must keep at least one owner' using errcode = '23514';
    end if;
  end if;

  update public.memberships set role = p_role
  where tenant_id = v_tenant and user_id = p_user_id;

  insert into public.audit_log (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, before, after)
  values (v_tenant, auth.uid(), 'user', 'membership.role_changed', 'membership', p_user_id::text,
          jsonb_build_object('role', v_target_role), jsonb_build_object('role', p_role));
end;
$$;

revoke execute on function public.set_team_member_role(uuid, text) from anon, public;
grant execute on function public.set_team_member_role(uuid, text) to authenticated;

-- Remove a member. Same authority rules as above; you cannot remove yourself
-- (leave via a different flow later) and never the last owner.
create or replace function public.remove_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_caller_role text := public.jwt_tenant_role();
  v_target_role text;
  v_owners int;
begin
  if v_tenant is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins may remove members' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself' using errcode = '42501';
  end if;

  select role into v_target_role from public.memberships
  where tenant_id = v_tenant and user_id = p_user_id;
  if v_target_role is null then
    raise exception 'That person is not a member of your operator' using errcode = '42704';
  end if;
  if v_caller_role = 'admin' and v_target_role = 'owner' then
    raise exception 'Only an owner may remove an owner' using errcode = '42501';
  end if;
  if v_target_role = 'owner' then
    select count(*) into v_owners from public.memberships where tenant_id = v_tenant and role = 'owner';
    if v_owners <= 1 then
      raise exception 'An operator must keep at least one owner' using errcode = '23514';
    end if;
  end if;

  delete from public.memberships where tenant_id = v_tenant and user_id = p_user_id;

  insert into public.audit_log (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, before)
  values (v_tenant, auth.uid(), 'user', 'membership.removed', 'membership', p_user_id::text,
          jsonb_build_object('role', v_target_role));
end;
$$;

revoke execute on function public.remove_team_member(uuid) from anon, public;
grant execute on function public.remove_team_member(uuid) to authenticated;

-- ── 3. Uptime ───────────────────────────────────────────────────────────────
-- SECURITY INVOKER: RLS on charge_points / charge_point_connection_log scopes
-- the result to the caller's tenant. Each 'connected' event opens an online
-- interval that ends at the next logged event (or now). The window starts at
-- the later of `now() - p_window` and the charger's first connection, so a
-- unit commissioned yesterday is not reported as 3% available over 30 days.

create or replace function public.charge_point_uptime(p_window interval default interval '30 days')
returns table (charge_point_id uuid, online_seconds numeric, window_seconds numeric, uptime_pct numeric)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select cp.id,
           greatest(now() - p_window, min(l.recorded_at)) as win_start,
           now() as win_end
    from public.charge_points cp
    join public.charge_point_connection_log l
      on l.charge_point_id = cp.id and l.event = 'connected'
    group by cp.id
  ),
  intervals as (
    select l.charge_point_id,
           l.event,
           l.recorded_at as s,
           coalesce(lead(l.recorded_at) over (partition by l.charge_point_id order by l.recorded_at, l.id), now()) as e
    from public.charge_point_connection_log l
    where l.event in ('connected', 'disconnected')
  ),
  online as (
    select i.charge_point_id,
           sum(greatest(0, extract(epoch from (least(i.e, b.win_end) - greatest(i.s, b.win_start))))) as secs
    from intervals i
    join bounds b on b.id = i.charge_point_id
    where i.event = 'connected' and i.e > b.win_start
    group by i.charge_point_id
  )
  select b.id,
         coalesce(o.secs, 0)::numeric,
         extract(epoch from (b.win_end - b.win_start))::numeric,
         case when extract(epoch from (b.win_end - b.win_start)) > 0
              then round(100 * least(1, coalesce(o.secs, 0) / extract(epoch from (b.win_end - b.win_start)))::numeric, 1)
              else null end
  from bounds b
  left join online o on o.charge_point_id = b.id;
$$;

revoke execute on function public.charge_point_uptime(interval) from anon, public;
grant execute on function public.charge_point_uptime(interval) to authenticated;

-- ── 4. Command lifecycle → Realtime ─────────────────────────────────────────
-- The gateway broadcasts charger telemetry itself; command outcomes are a
-- handful of rows per day, so the database announces them. Guarded because
-- realtime.send() is absent on older Realtime builds — the admin app also
-- polls a pending command, so a missing trigger degrades gracefully.

create or replace function public.notify_remote_command_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    begin
      perform realtime.send(
        jsonb_build_object(
          'commandId', new.id,
          'chargePointId', new.charge_point_id,
          'action', new.action,
          'status', new.status,
          'error', new.error,
          'at', coalesce(new.responded_at, new.sent_at, now())
        ),
        'command_update',
        'tenant:' || new.tenant_id::text,
        true
      );
    exception when undefined_function or undefined_table or insufficient_privilege then
      null;
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_remote_command_update() from anon, authenticated, public;

create trigger remote_commands_notify_update
  after update on public.remote_commands
  for each row execute function public.notify_remote_command_update();
