# ADR-0004: Migrations via committed SQL + `supabase db push` in CI

**Status:** accepted · 2026-07-26

## Context

The accounting dashboard applied migrations through the Supabase MCP and hand-maintained its generated types; its CLAUDE.md migration inventory went stale within months.

## Decision

- Schema changes are SQL files created with `supabase migration new` (timestamp names), additive-only, applied to remote projects **only** by the `migrate` workflow (`supabase db push`) — staging automatic, production behind environment approval.
- MCP `apply_migration` is allowed for local/dev-branch exploration only, and whatever it applied must land as a committed migration file in the same PR.
- `packages/shared/src/database.types.ts` is generated (`pnpm gen:types`), never hand-edited.
