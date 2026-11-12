# ADR-0001: Role helpers read the role tables (no JWT claims hook yet)

**Status:** accepted · 2026-10-05

## Context

Voltara CSMS injects `tenant_id` / `tenant_role` into the JWT with a custom access-token hook, which must be enabled per project in the dashboard. Voltara Home is single-tenant with three small role tables (`staff`, `dealer_members`, charger ownership) and needed working RLS on day one without dashboard steps.

## Decision

Policies call STABLE SECURITY DEFINER helpers (`is_staff()`, `my_dealer_id()`, `charger_role(id)`, …) that query the role tables, wrapped in `(select …)` so Postgres evaluates them once per statement.

## Consequences

- Works immediately; the same helpers are usable from RPCs and triggers.
- One extra index lookup per statement. If it ever shows in `pg_stat_statements`, add the hook and re-implement the helpers to read `auth.jwt() -> 'app_metadata'` — no policy changes.
