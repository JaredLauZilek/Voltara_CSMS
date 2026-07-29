-- ============================================================================
-- Advisor-driven tuning (staging run, 2026-07-29):
-- 1. Split the FOR ALL write policies on evses/connectors/id_tags into
--    insert/update/delete so SELECT no longer evaluates two permissive
--    policies per row (advisor: multiple_permissive_policies).
-- 2. Cover the remaining foreign keys with indexes
--    (advisor: unindexed_foreign_keys).
-- ============================================================================

-- ── evses ───────────────────────────────────────────────────────────────────

drop policy evses_write on public.evses;

create policy evses_insert on public.evses
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy evses_update on public.evses
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy evses_delete on public.evses
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── connectors ──────────────────────────────────────────────────────────────

drop policy connectors_write on public.connectors;

create policy connectors_insert on public.connectors
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy connectors_update on public.connectors
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy connectors_delete on public.connectors
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── id_tags ─────────────────────────────────────────────────────────────────

drop policy id_tags_write on public.id_tags;

create policy id_tags_insert on public.id_tags
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy id_tags_update on public.id_tags
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

create policy id_tags_delete on public.id_tags
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.is_tenant_admin()));

-- ── FK covering indexes ─────────────────────────────────────────────────────

create index charge_points_model_id_idx on public.charge_points (model_id);
create index id_tags_driver_user_id_idx on public.id_tags (driver_user_id);
create index notes_author_user_id_idx on public.notes (author_user_id);
