# ADR-0002: Gateway talks to Postgres via postgres.js, not supabase-js

**Status:** accepted · 2026-07-26

## Context

The OCPP gateway needs: real transactions (StopTransaction must atomically close the session + write final meters + append status log), `LISTEN/NOTIFY` (the `remote_commands` bus), efficient multi-row inserts (meter values, raw frames), and advisory locks (connection registry, partition jobs).

## Decision

`postgres` (postgres.js) with a direct connection to the Supabase database (IPv6, port 5432); Supavisor **session** mode as fallback. supabase-js is used in the gateway only to publish Realtime Broadcast events. The service role bypasses RLS, so gateway code must always scope queries by resolved tenant.

## Alternatives rejected

- **supabase-js/PostgREST** — no transactions, no LISTEN/NOTIFY, no advisory locks.
- **Supavisor transaction mode (6543)** — breaks LISTEN/NOTIFY and prepared statements.
- **Redis as command bus** — an extra moving part; `pg_notify` covers the need at this scale.
