# OCPP Gateway — Package Contract

Extends the root CLAUDE.md (§6, §9, §10 especially). This service is the only component that talks to chargers and the only writer of charger runtime state.

## Architecture (target shape — Phase 1 builds this)

```
src/
├── index.ts        # http server (healthz/statusz) + ws upgrade on /ocpp/{identity}
├── ocpp/
│   └── v16/        # ocpp-rpc server wiring, handlers, wire types. 1.6 shapes DIE here.
├── domain/         # protocol-agnostic: session state machine, status normalisation
├── quirks/         # vendor/model-keyed hooks: normalizeStatus, normalizeMeterValue, beforeSend
├── db/             # postgres.js client, batched writers, LISTEN remote_commands
└── realtime/       # broadcast publisher (tenant channels, throttled meter events)
```

## Rules

1. **Auth before anything:** resolve `charge_points` by the `/ocpp/{identity}` path segment and verify Basic Auth against `auth_key_hash` in the same query (bcrypt via pgcrypto — root §10), honouring the per-charger `security_profile` ladder (0 identity-only · 1 Basic Auth over ws:// · 2 Basic Auth over TLS). Reject unknown/decommissioned with 401. Rate-limit connect attempts per identity.
2. **Persist every frame** (CALL/CALLRESULT/CALLERROR, both directions) to `ocpp_messages` via the batched writer, with `AuthorizationKey` redacted. If it isn't in the frame log, it didn't happen.
3. **`strictMode: true`** on the ocpp-rpc server — wire validation is ajv against the official schemas. Zod validates OUR shapes (commands, config), not the wire.
4. **StopTransaction closes atomically:** session row, final meter rows, status log — one Postgres transaction, or none of it.
5. **Offline replay is normal:** StartTransaction/StopTransaction may arrive with past timestamps after reconnect. Trust `ocpp_transaction_id` mapping, mark `offline = true`, never drop them. Unknown transaction on stop → session `orphaned`, still logged.
6. **Command bus:** `LISTEN remote_commands`; lifecycle `queued → sent → accepted/rejected/timeout`; reconcile stuck `queued` rows on startup. Commands time out — never leave a row in `sent` forever. A `GetConfiguration` / accepted `ChangeConfiguration` answered over the bus also updates `charge_points.config` (redacted) — the snapshot is the durable view, the command row is the receipt.
7. **connectorId 0 semantics:** addresses the whole charge point (e.g. StatusNotification for the station). It is never a connector row.
8. **Quirks discipline:** vendor weirdness (meter value formats, bogus status orders, non-standard DataTransfer) goes in `quirks/` keyed by boot-reported vendor/model — a handler must stay readable as spec-pure 1.6J.
9. **Tenant scoping:** this service uses the service role / direct Postgres and bypasses RLS. Every query must be scoped by the tenant resolved from the charge point. No cross-tenant joins, ever.
10. **Logging:** pino with bound fields `{ cp, tenant, action, msgId }`. Never log credentials or full Authorize idTags at info level.
11. **Graceful deploys:** SIGTERM → stop accepting sockets, flush batched writers, close. Chargers reconnect; that is by design. Never scale to zero.
12. **Billing (Phase 3):** the tariff is resolved and **frozen into `charging_sessions.tariff_snapshot` at StartTransaction** (`db/billing.ts` — payer from the ID tag, driver groups, most specific assignment wins); nothing after that instant may change a running session's price. StatusNotification maintains `charging_ended_at` (idle starts at the last exit from Charging). StopTransaction flushes the meter writer, then closes the session, inserts final samples, **prices the session with `@voltara/shared` `billing.priceSession`, and inserts the CDR — all in one transaction**. A session without a tariff or an orphaned stop still gets a CDR, flagged `billable = false` with a reason. CDRs are never updated; corrections are credit CDRs. `session.completed` webhooks fire after commit and are never awaited by a handler.

## Testing

Every handler change ships a scenario in `tests/integration` using the scripted charger (`ocpp-rpc` `RPCClient`). Baseline scenarios that must always pass: happy-path session, bad password, unknown identity, malformed payload → CALLERROR, offline StopTransaction replay, gateway restart mid-session.
