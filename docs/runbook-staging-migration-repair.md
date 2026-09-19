# Runbook — reconcile staging's migration history (one-time, before the first `db push`)

**Why this exists.** During Phase 2 commissioning three migrations were applied to staging
(`lxsfnqshcacsrolmymsg`) through the Supabase MCP and then committed as files under
different version numbers (ADR-0004 allows MCP exploration but requires the committed
file to be the record). The schema on staging already matches the committed files —
`register_charge_point()` has the empty `search_path`, and `security_profile` allows 0–3 —
but the ledger `supabase_migrations.schema_migrations` still lists the MCP versions:

| Staging ledger (wrong)                                     | Committed file (right)                     |
| ---------------------------------------------------------- | ------------------------------------------ |
| `20260729095110_register_charge_point_rpc`                 | `20260729090000_register_charge_point_rpc` |
| `20260729095340_register_charge_point_rpc_fix_search_path` | _(folded into the file above)_             |
| `20260730095730_security_profile_zero`                     | `20260730100000_security_profile_zero`     |

Until the ledger matches, `supabase db push` (the `migrate` workflow) refuses to run:
_"Remote migration versions not found in local migrations directory"_.

This repairs the **ledger only**. No schema statement runs.

## Option A — Supabase CLI (preferred; what the CLI does itself)

```bash
export SUPABASE_ACCESS_TOKEN=…                # from supabase.com/dashboard/account/tokens
pnpm exec supabase link --project-ref lxsfnqshcacsrolmymsg
pnpm exec supabase migration repair --status reverted 20260729095110 20260729095340 20260730095730
pnpm exec supabase migration repair --status applied  20260729090000 20260730100000
pnpm exec supabase migration list                     # local and remote columns must now agree
```

`migration list` should show every committed file as applied on remote **except**
`20260919100000_phase2_admin_operations`, which is the pending Phase 2 migration —
`db push` (or the `migrate` workflow once `DEPLOY_ENABLED=true`) applies it.

## Option B — SQL editor (same effect, if the CLI is not to hand)

Paste into Dashboard → SQL editor on the staging project:

```sql
begin;
delete from supabase_migrations.schema_migrations
 where version in ('20260729095110', '20260729095340', '20260730095730');
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20260729090000', 'register_charge_point_rpc',
   array['-- history repair: applied via MCP as 20260729095110 + 20260729095340; source is supabase/migrations/20260729090000_register_charge_point_rpc.sql']),
  ('20260730100000', 'security_profile_zero',
   array['-- history repair: applied via MCP as 20260730095730; source is supabase/migrations/20260730100000_security_profile_zero.sql']);
commit;
select version, name from supabase_migrations.schema_migrations order by version;
```

## Verify

```sql
-- both must be true on staging, before and after
select (select 'search_path=""' = any(proconfig) from pg_proc where proname = 'register_charge_point') as fn_ok,
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'charge_points_security_profile_check')
         like '%ARRAY[0, 1, 2, 3]%' as constraint_ok;
```

## After the repair

1. `supabase db push` applies `20260919100000_phase2_admin_operations` (issues, team RPCs, uptime, command_update trigger, index).
2. `supabase functions deploy admin-invite --project-ref lxsfnqshcacsrolmymsg` — the `migrate` workflow's `deploy-functions-staging` job does this automatically once `DEPLOY_ENABLED=true`.
3. Re-run the advisors (Dashboard → Advisors) — the `charge_point_connections` unindexed-FK notice disappears.
4. Delete this runbook in the same PR that confirms `migration list` is clean; it is a one-time fix, not a durable contract (CLAUDE.md §16).
