# ADR-0003: Telemetry fan-out via Realtime Broadcast, not postgres_changes

**Status:** accepted · 2026-07-26

## Context

Charger status flips and meter samples must reach dashboards live. Supabase `postgres_changes` evaluates RLS per subscriber per change on a single WAL reader — the documented scaling bottleneck — and couples fan-out volume to write volume.

## Decision

The gateway publishes to private Broadcast channels, one per tenant (`tenant:{tenant_id}`), events `cp_status` / `session_update` / `meter` (meter throttled ≥5s per connector). Channel authorization via RLS on `realtime.messages` (topic must match the JWT tenant claim). Payload contracts live in `@voltara/shared`.

`postgres_changes` is reserved for low-frequency, high-value tables only — or skipped entirely in favour of `realtime.send()` triggers.
