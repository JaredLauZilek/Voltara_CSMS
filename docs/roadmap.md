# Voltara CSMS — Build Plan & Roadmap

The full approved plan (2026-07-26). Durable _contracts_ live in [CLAUDE.md](../CLAUDE.md); this document tracks the phased roadmap and the reasoning behind it. Update the checklist as phases land.

## Phase tracker

- [x] **Phase 0 — Scaffold, CI, Supabase, tenancy, UI port** · done 26 Jul 2026 (`8cc4d36`)
- [ ] **Phase 1 — OCPP gateway core vs simulator** (~3 wk)
- [ ] **Phase 2 — Admin portal charger management** (~3 wk)
- [ ] **Phase 3 — Tariffs, billing math, CDRs, reports** (~2–3 wk)
- [ ] **Phase 4 — Driver app MVP (Expo)** (~4–6 wk)
- [ ] **Phase 5 — Payments (Curlec + DuitNow QR)** (~4 wk)
- [ ] **Phase 6 — White-label, onboarding, RBAC depth, platform ops** (~3 wk)
- [ ] **Phase 7+ — Advanced** (smart charging/DLM, OCPP 2.0.1, OCPI, fleet, MEVnet)

**Pending one-time manual steps:** create staging Supabase project (Singapore) + enable the custom-access-token auth hook (checklist in [dev-setup.md](dev-setup.md)) · create the `main-protection` branch ruleset in GitHub UI · set `DEPLOY_ENABLED=true` + staging secrets when ready to deploy.

---

## Context

Voltara Sdn Bhd (EV charger sales/ops, Malaysia) already runs an internal accounting dashboard (`github.com/JaredLauZilek/voltara`) whose CLAUDE.md locks in the Voltara brand: deep-green `#1B512D` + yellow `#FECC3E`, Figtree, inline-style design system, hand-rolled SVG charts, strict feature-folder architecture on Vite + React 18 + TanStack Query + Supabase.

This plan builds a **second product in this repo**: an **AMPECO-class CSMS with a dual purpose**:

1. **In-house first:** Voltara runs its **own** EV charging business on it — Voltara-operated public/commercial chargers (CPO), condo/strata deployments, and home charging for the wallboxes Voltara already sells and installs. Voltara is **tenant #1**, the platform's reference deployment, and launches its **own Voltara-branded driver apps**.
2. **White-label SaaS second:** the same multi-tenant platform is sold to other Malaysian CPOs, condo JMBs, and workplace/home operators under their own branding.

This ordering matters: every phase is dogfooded on Voltara's own operation before it is sold, the flagship driver app on the stores is the _Voltara_ app (white-label tenants join it at runtime, or graduate to their own builds), and Voltara staff need a cross-tenant **platform-admin** layer on top of the per-tenant operator experience. MVP = OCPP 1.6J charger management (gateway + admin portal + tariffs/CDRs); then the Expo driver app, Malaysian payments, white-label tenant onboarding, and later fleet/smart-charging/roaming.

**Decisions confirmed:** charger management before driver app · Expo/React Native · Fly.io Singapore for the gateway · one Supabase staging project now, prod project created at first real pilot · platform serves Voltara's own CPO/condo/home-charging business AND white-label customers.

## Research conclusions that shape the architecture

Based on deep research into AMPECO (~490 API endpoints mapped), competitors (Monta/SWTCH/Noodoe/Driivz/Virta/ChargeLab/EV Connect), OCPP tooling, Supabase capabilities, and the Malaysian market/regulatory landscape:

1. **The OCPP server cannot live in Supabase.** Edge Functions hard-cap at 400s wall clock; chargers hold one WebSocket open for weeks. → Dedicated always-on **Node 22 + TypeScript service** on Fly.io `sin`, same region as Supabase (`ap-southeast-1`).
2. **`ocpp-rpc` (MIT, 4.3k weekly DL, maintained)** is the right transport lib — OCPP-J framing, schema validation (`strictMode`), auth callback, all 3 security profiles. It has zero business logic; we write the domain layer. Reference CitrineOS (Apache-2.0 TS) for domain modeling; run SteVe (GPL — read/run, never copy) as a behavioural oracle.
3. **OCPP 1.6J first** (Malaysian installed base is overwhelmingly 1.6J Chinese AC hardware, quirks expected). Protocol-agnostic internal model so 2.0.1 becomes an adapter later. **Security Profile 2 floor** (WSS + per-charger Basic Auth). Persist every raw OCPP frame.
4. **Supabase specifics:** multi-tenant single project, `tenant_id` + RLS via custom-access-token auth hook (`app_metadata` claims only — never `user_metadata`), `(select …)` initPlan pattern, index every policy column. **Realtime Broadcast** (private channels `tenant:{id}`) for telemetry fan-out — never `postgres_changes` (WAL bottleneck). **Partition `meter_values` + `ocpp_messages` monthly from day one** (500 connectors @ 30s ≈ 43M rows/month) with rollups + retention.
5. **Malaysia:** ST EVCS licence required even for free public charging (RM0.44/kW, 10-yr, JMB consent letter prerequisite; Sabah=ECoS, Sarawak separate). MEVnet/ST reporting exports are a real selling point. SST applicability to EV charging is **unresolved** → tax must be a configurable, separately-stored component. Payments: **Curlec (Razorpay)** primary for driver money (FPX/DuitNow QR/TNG/GrabPay/Boost, BNM-licensed) + **Stripe Billing** for Voltara's own SaaS fees; **per-tenant merchant-of-record** (Option A) to avoid BNM payment-aggregator licensing. DuitNow-QR no-app guest checkout (Noodoe model) is the highest-leverage local UX.
6. **Condo/strata is the wedge** AMPECO is weakest on: revenue-share to JMBs, idle fees + grace, whole-site load management, resident groups (copy Monta/SWTCH patterns). ChargeSini (1,010+ points, ~1/3 in condos) is the closest local competitor.
7. **White-label mobile reality (Apple 4.3(a)):** one flagship multi-tenant app with runtime branding first; per-tenant bundle IDs published **from the tenant's own Apple/Google accounts** when a tenant demands it. EAS Build/Submit/Update (OTA fixes across all tenant apps) is why Expo wins over Flutter.

## Architecture at a glance

```
Chargers (OCPP 1.6J over wss://) ──► apps/ocpp-gateway (Node 22, Fly.io sin)
                                         │  postgres.js (direct, transactions,
                                         │  LISTEN/NOTIFY, batch inserts)
                                         ▼
                    Supabase ap-southeast-1 (Postgres + Auth + Storage + Realtime)
                       ▲                                        │ Broadcast tenant:{id}
        supabase-js + RLS (JWT tenant claims)                   ▼
  apps/admin (Vite SPA, Voltara design system)      live status → admin + driver app
  apps/driver (Expo, Phase 4)
  supabase/functions (invites, payment webhooks, receipts — request/response only)
```

Admin→gateway commands: insert into `remote_commands` → `pg_notify` → gateway LISTENs, sends OCPP call, writes back status. No Redis, no extra queue.

---

## 1. GitHub infrastructure

Monorepo: **pnpm workspaces + Turborepo** (four deployables sharing DB types, OCPP types, and the UI kit; task graph + affected-only CI; Nx too heavy for solo founder).

```
apps/admin            # Vite React SPA — CPO/JMB admin portal
apps/ocpp-gateway     # Node 22 OCPP 1.6J service (Fly.io sin)
apps/driver           # Expo app (added Phase 4)
packages/shared       # @voltara/shared — generated DB types, OCPP zod schemas, domain enums, broadcast event contracts
packages/ui           # @voltara/ui — ported Voltara design system
supabase/             # config.toml, migrations/, functions/, seed.sql
tests/integration/    # simulator-driven gateway test suite
infra/                # docker-compose.yml, Dockerfile.gateway, fly.staging.toml
docs/adr/             # architecture decision records
.github/              # workflows, PR/issue templates, CODEOWNERS
CLAUDE.md             # root contract; per-package CLAUDE.md in gateway + ui
```

**Branching:** trunk-based. `main` protected via ruleset (PR required, status checks required, linear history, no force push; **no** required human review — solo + checks are the gate). Branches `feat/*`, `fix/*`, `chore/*`, squash-merged with conventional-commit titles.

**Workflows:**

| Workflow             | Trigger                                       | Does                                                                                                                                 |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`             | PRs + main                                    | pnpm install (cached) → `turbo run lint typecheck test build`                                                                        |
| `integration.yml`    | PRs touching gateway/shared/supabase; nightly | local Supabase → integration suite (RLS + scripted OCPP charger); nightly adds Solidstudio VCP scenario + (later) SAP simulator soak |
| `deploy-admin.yml`   | main (admin/ui/shared paths)                  | build → Cloudflare Pages staging                                                                                                     |
| `deploy-gateway.yml` | main (gateway/shared paths)                   | Docker build → `flyctl deploy` staging (chargers auto-reconnect through rolling deploys)                                             |
| `migrate.yml`        | main (migrations path)                        | `supabase link` → `supabase db push` to staging; drift check                                                                         |

Production jobs (GitHub Environment `production` with required-reviewer approval = the deploy button) are added when the prod Supabase project is created at first pilot.

**Migration policy (locked):** committed SQL files via `supabase migration new` (timestamp names), applied by `supabase db push` in CI. Supabase MCP `apply_migration` is for local exploration only, and must land as a committed file in the same PR (ADR-0004).

**Secrets:** GitHub Environment `staging`: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID`. Gateway runtime secrets in Fly (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`). Service-role key never in any `VITE_*`/browser-reachable place.

**Hygiene:** PR template checklist (migration + `pnpm gen:types`? RLS + tenant_id index? integration scenario? CLAUDE.md updated?). Issue forms: bug, feature, and **`charger_compat.yml`** (intake for the vendor-quirks layer). CODEOWNERS marks `/supabase/migrations/` and `/apps/ocpp-gateway/src/ocpp/` as review-critical.

## 2. Tech stack

Versions align with the accounting app (React 18.3, TS ~5.5.3, Vite ^5.4, TanStack Query ^5.59, supabase-js ^2.45); Node 22 LTS for the gateway. Root: `turbo@^2`, `eslint@^9` flat + `typescript-eslint` (+ `no-floating-promises` on gateway), `prettier@^3`, `vitest@^3`, pinned `pnpm@10` via corepack.

- **`apps/admin`:** react, react-dom, **react-router-dom@^6** (the one sanctioned deviation — deep-linkable `/charge-points/:id`, `/sessions/:id`), @tanstack/react-query, @supabase/supabase-js, lucide-react, @sentry/react, `@voltara/ui`, `@voltara/shared`. No CSS framework, no chart lib.
- **`apps/ocpp-gateway`:** `ocpp-rpc@^2.2` (strictMode wire validation), `zod`, **`postgres@^3.4` (postgres.js) direct** — real transactions (StopTransaction atomicity), `LISTEN/NOTIFY` command bus, batch inserts, advisory locks; Supavisor **session** mode fallback (never transaction mode 6543 — breaks LISTEN). supabase-js only for Realtime broadcast publishing. `pino`, `@sentry/node`; dev: `tsx`, `tsup`.
- **`packages/shared`:** generated `database.types.ts` (**generated, never hand-maintained**), OCPP 1.6J message types + zod schemas (22 messages in scope), domain enums, broadcast event payload types + channel helpers, format helpers.
- **`packages/ui`:** verbatim port of the accounting app's design system — `tokens.ts` byte-for-byte + CSMS statuses, all components + SVG charts; `AttachmentsField` takes injected storage callbacks so `ui` has no supabase dependency. Tokens = default theme; Phase 6 wraps them in a ThemeProvider — never fork tokens per tenant.
- **`supabase/functions`:** Deno; starts with `admin-invite`; payment webhooks/receipts arrive Phase 5. Each function ships its own README.
- **Testing:** vitest everywhere + `tests/integration` "scripted charger" built on `ocpp-rpc`'s own `RPCClient` (deterministic in-process OCPP peer — no Docker in CI). Solidstudio `ocpp-virtual-charge-point` for manual/nightly conformance; SAP `e-mobility-charging-stations-simulator` for load/soak.

**Local dev:** `pnpm db:start` (local Supabase + migrations + seed) → `pnpm dev` (admin :5173 + gateway :9221) → `pnpm gen:types` after every migration. Seeded logins in [dev-setup.md](dev-setup.md).

## 3. Core DB schema v1

Conventions on every tenant-scoped table: `id uuid pk`, `tenant_id uuid not null → tenants`, `created_at`, RLS enabled, policies via STABLE helpers `jwt_tenant_id()`/`jwt_tenant_role()` (app_metadata claims, initPlan-wrapped), `WITH CHECK` mirrors `USING`, btree index on `tenant_id` + every policy column. Roles: `owner|admin|operator|viewer`. Auth hook injects `tenant_id`+`tenant_role` (+`platform_admin` for Voltara staff).

| Table                                                                   | Purpose / key columns                                                                                                                                                  | Writes                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `tenants`, `memberships`, `platform_admins`                             | slug, plan, status, `is_first_party` (Voltara); `(user_id, tenant_id, role)` feeds auth hook                                                                           | service-role / admin                         |
| `locations`                                                             | address, `state` (→ ST/ECoS/Sarawak jurisdiction), lat/lng, site_type, jmb_name                                                                                        | admin                                        |
| `charge_point_vendors/models`                                           | global registries + `quirks jsonb` compat flags                                                                                                                        | service-role                                 |
| `charge_points`                                                         | `ocpp_identity` globally unique (WS path), `auth_key_hash` (argon2, shown once), `security_profile` default 2, lifecycle, `connection_state`, firmware, `config jsonb` | registration=admin; **runtime=gateway only** |
| `evses`, `connectors`                                                   | OCPI/2.0.1-shaped; connector `status` (normalised enum)                                                                                                                | **status=gateway only**                      |
| `id_tags`                                                               | RFID/virtual tags, active/blocked/expired, future driver link                                                                                                          | admin                                        |
| `charging_sessions` (Ph 1)                                              | `ocpp_transaction_id` (int sequence), status incl. `orphaned`, meters, energy, `tariff_snapshot jsonb` (Ph 3)                                                          | **gateway only**                             |
| `meter_values` (Ph 1)                                                   | **partitioned monthly**, 90d retention, + `meter_values_agg_1m` rollup (charts read this)                                                                              | gateway                                      |
| `ocpp_messages` (Ph 1)                                                  | **partitioned monthly**; every frame in/out, **AuthorizationKey redacted**, 30d retention                                                                              | gateway                                      |
| `charge_point_status_log` / `connection_log` / `connections` (Ph 1)     | status history, connect/disconnect (uptime source), live registry → multi-instance routing table                                                                       | gateway                                      |
| `remote_commands` (Ph 1)                                                | command bus: `queued→sent→accepted/rejected/timeout`; INSERT fires `pg_notify`                                                                                         | insert=operator+; status=gateway             |
| `tariffs` + `tariff_versions` (immutable) + `tariff_assignments` (Ph 3) | per_kwh/per_min/session/idle+grace/ToU elements; `tax_rate` nullable — **never hardcoded**; MYR                                                                        | admin                                        |
| `cdrs` (Ph 3)                                                           | OCPI-shaped cost breakdown, immutable                                                                                                                                  | service-role                                 |
| `issues`, `notes`, `audit_log`                                          | fault tickets; polymorphic notes; append-only audit                                                                                                                    | mixed                                        |
| `webhooks` + deliveries (Ph 3)                                          | HMAC-signed tenant webhooks                                                                                                                                            | admin / service-role                         |
| `tenant_settings`                                                       | app_name, logo, `theme jsonb` overrides (Voltara palette default), sst_registration_no                                                                                 | owner/admin                                  |
| `st_licences` (Ph 6)                                                    | jurisdiction, licence_no, capacity_kw, 10-yr expiry, consent_letter_path                                                                                               | admin                                        |

**Realtime:** private Broadcast channels `tenant:{tenant_id}` (RLS on `realtime.messages`); events `cp_status`, `session_update`, `meter` (throttled ≥5s/connector). `postgres_changes` avoided entirely for telemetry.

## 4. Step-by-step build plan

MVP (Phases 0–3) ≈ 10–12 weeks solo + Claude Code.

### ✅ Phase 0 — Scaffold, CI, Supabase, tenancy, UI port (done 26 Jul 2026)

Monorepo scaffold; `packages/ui` ported (tokens byte-for-byte); `packages/shared` + generated types; migrations (tenancy, auth hook, assets, settings/audit) with RLS + explicit deny-by-default grants; two-tenant seed; admin shell with real Supabase Auth + react-router + canonical `features/locations`; gateway hello-world (health endpoints, Dockerfile, Fly config); all five workflows + templates; CLAUDE.md contracts; ADRs 0001–0004.
**Verified:** 15/15 turbo tasks green; 15-case RLS isolation suite green; end-to-end GoTrue sign-in → JWT tenant claims → PostgREST isolation proven for both tenants.

### Phase 1 — OCPP gateway core vs simulator (~3 wk)

`ocpp-rpc` RPCServer, path `/ocpp/{identity}`, auth callback (identity lookup + Basic-Auth verify vs `auth_key_hash`, reject decommissioned, per-identity rate limit); frame-persistence middleware (batched, redacted); handlers: BootNotification (vendor/model/firmware upsert, mark online, schedule GetConfiguration snapshot), Heartbeat, StatusNotification (normalise → connectors + status_log + broadcast), Authorize, StartTransaction (int txn sequence, offline-timestamp handling), MeterValues (quirk-tolerant parse, batch insert, throttled broadcast), StopTransaction (atomic close), DataTransfer (log+Reject); connection registry + disconnect sweep; **command bus** (`LISTEN remote_commands` → RemoteStart/RemoteStop/Reset/UnlockConnector/ChangeAvailability/Change+GetConfiguration/TriggerMessage/ClearCache, full lifecycle + startup reconciliation); quirks-layer skeleton; pg_cron partition + rollup + orphan-sweep jobs; integration scenarios: happy path, bad password, unknown identity, malformed payload, offline StopTransaction replay, gateway restart mid-session.
**Verify:** `integration.yml` green; Solidstudio VCP completes full session locally with correct energy math + complete frame log; SQL insert into `remote_commands` remote-starts the VCP <1s; VCP over public internet to Fly staging via `wss://` + Basic Auth (proves Security Profile 2).

### Phase 2 — Admin portal charger management (~3 wk)

`features/charge-points`: registration wizard (generates identity + auth key shown **once** — installer handoff), live-status list, detail page `/charge-points/:id` (connector cards, config viewer + refresh-from-charger, remote ops with confirm modals + command toasts, log/status/session tabs); `features/overview` live dashboard (KPI cards fed by Broadcast patching TanStack Query caches — no polling); `features/ocpp-logs` global viewer; `features/sessions` with power/energy chart from `meter_values_agg_1m`; `features/id-tags`; minimal `features/issues`; uptime %; `admin-invite` function + team screen.
**Verify:** register a fresh simulated charger through the UI → boots → Available on dashboard without refresh, <5 min end-to-end; two browsers/two tenants: A sees live flips ≤2s, B sees nothing; remote start/stop round-trip; deep links cold-load. **First real-world pilot is Voltara itself:** onboard a Voltara bench/warehouse AC charger to staging — dogfooding before any external customer.

### Phase 3 — Tariffs, billing math, CDRs, reports (~2–3 wk)

Tariff CRUD + immutable versions + assignments (location/CP/connector precedence); gateway snapshots resolved tariff at StartTransaction; cost engine at StopTransaction (kWh/min/session components, ToU bands, **SST as separate configurable component**); idle tracking (grace periods) recorded before it's ever charged; OCPI-shaped `cdrs`; revenue reports + CSV export; first MEVnet/ST export stub; HMAC webhooks (`session.completed`, `cp.offline`); canary synthetic charger monitoring the real OCPP path.
**Verify:** property-tested cost engine, golden cases exact to the sen; tariff edit mid-session doesn't change the running session; CDRs immutable. **DoD: a pilot condo could bill residents from exports before payments exist.**

### Phase 4 — Driver app MVP (Expo, ~4–6 wk)

`apps/driver`: Expo + EAS Build/Submit/Update; **the flagship IS the Voltara-branded app**, published from Voltara's own Apple/Google developer accounts — Voltara's consumer product for its own CPO/condo/home charging business. Multi-tenant under the hood: runtime tenant branding from `tenant_settings` (join a site via QR/code) so white-label customers' locations can appear from day one. Phone-OTP/email auth; charger map/list with live availability; start/stop via `remote_commands` (driver-scoped RLS + virtual id_tags); live session screen; history; home-charger owner view (Voltara-installed wallboxes — groundwork for the home-charging product line). Separate per-tenant bundle IDs (same codebase, published from the _tenant's_ own store accounts) only when a white-label tenant demands it (Apple 4.3(a)).

### Phase 5 — Payments (~4 wk)

Per-tenant merchant-of-record: tenant's own Curlec creds; wallet or pre-auth per-session (decide with pilot); **DuitNow QR guest web checkout** (QR on charger → web page → pay → RemoteStart — no app); receipts (reuse accounting app's `@react-pdf/renderer` patterns); Stripe Billing for Voltara SaaS fees; webhook functions with signature verification + idempotency; `payment_accounts` (encrypted), `payments`, double-entry `wallet_ledger`, `receipts`. **Gate: Malaysian tax/legal opinion on SST + BNM exposure before go-live.**

### Phase 6 — White-label, onboarding, RBAC depth, platform ops (~3 wk)

Tenant self-serve onboarding; ThemeProvider branding across admin/driver/receipts; tenant switcher (multi-membership via `app_metadata` update + token refresh); per-location operator scoping; JMB revenue-share payout reports; ST licence module + expiry reminders; audit-log UI; **platform-admin console for Voltara staff** (cross-tenant: tenant list/health, fleet overview, SaaS plans, impersonate-into-tenant — gated by the `platform_admin` claim). Create **production** Supabase project + Fly app + `production` GitHub Environment with approval gate (if not already done at first pilot).

### Phase 7+ — Advanced

Smart charging/DLM (site kW budgets, SetChargingProfile trio, SWTCH-style time-slicing fallback — key for Voltara's own condo deployments); reservations + queueing for oversubscribed condo chargers; firmware management; OCPP 2.0.1 adapter onto the same domain model; OCPI CPO module (eRoaming Hub Alliance); fleet (vehicles, telematics, home-charging reimbursement — Monta patterns); home-charging depth (charger sharing/guest access, employer-sponsored charging); condo depth (resident groups, per-bay allocation, JMB bulk-meter reconciliation à la SWTCH virtual submetering); full MEVnet/ST reporting; Local Auth List sync for basement connectivity; **integration with the Voltara accounting dashboard** (CDR/settlement summaries feeding invoices/revenue there — it already models `Condo`/`CPO` customer types).

## 5. CLAUDE.md structure

Implemented at [CLAUDE.md](../CLAUDE.md): 16 sections — product & monorepo map (dual identity), brand identity (locked), component patterns, admin architecture, multi-tenancy & RLS, OCPP gateway rules, database & migrations workflow, realtime rules, testing & simulator workflow, security, screen/modal patterns, white-label theming, Malaysia domain notes, what-NOT-to-do, common workflows, and the **growth policy** (root holds durable contracts only; volatile inventories banned — the accounting app's stale-section failure mode; per-package CLAUDE.md for gateway + ui; decisions → `docs/adr/`; contract changes update CLAUDE.md in the same PR; quarterly stale-sweep).

## 6. Ops, security, top risks

Pino JSON logs (bound `cp`/`tenant`/`action`) → Fly logs; Sentry (gateway + admin); `/healthz` + `/statusz`; UptimeRobot; Phase 3 canary charger monitors the actual OCPP path. TLS at Fly edge (`wss://`); argon2-hashed per-charger keys, rotation via `ChangeConfiguration(AuthorizationKey)` keeping old+new valid until reconnect confirms.

| Risk                                          | Mitigation                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Chinese-vendor 1.6J quirks break sessions     | Raw frame log day one; quirks layer; `charger_compat` intake; bench one real AC charger before first pilot; SteVe as oracle              |
| Meter-value volume blows Supabase cost        | Partitions + 90d retention + rollups day one; throttled broadcast; SAP soak before >50 chargers                                          |
| Cross-tenant leak (fatal for SaaS)            | Deny-by-default RLS + `WITH CHECK` + CI two-tenant tests + advisors after every migration                                                |
| Single gateway instance                       | Protocol-level reconnect/offline queue; registry + command bus already shaped for multi-instance                                         |
| Regulatory (BNM, SST, KPKT basement circular) | Option A merchant-of-record only; SST re-rateable; verify final KPKT circular before site-planning features; legal opinion gates Phase 5 |

## 7. Verification (end-to-end)

- **Per-PR:** `ci.yml` + `integration.yml` (scripted-charger scenarios against local Supabase) green; RLS two-tenant suite green.
- **Phase gates:** the "Verify" bullets per phase — most importantly Phase 1's full simulated session over public `wss://` to Fly staging, Phase 2's <5-minute charger-registration walkthrough + two-tenant isolation proof in two browsers, Phase 3's sen-exact golden-case cost tests.
- **Manual demo:** `docs/demo.md` script (register charger → live dashboard → remote start → session → export) — the JMB/CPO sales demo doubles as the acceptance test.
- **Supabase advisors** (security + performance) after every staging migration push.

## 8. Open items (not blockers for Phases 0–2)

1. Final KPKT circular text on strata/basement charger placement (reshapes condo TAM + site-planning features).
2. Malaysian tax opinion on SST applicability + BNM aggregator exposure — required before Phase 5 go-live.
3. Ask Curlec about sub-merchant/split settlement under their acquiring licence (would improve on Option A).
4. Which CSMS incumbents power local CPOs (check WSS hostnames/TLS certs on deployed chargers) — competitive intel.
5. Domain: `gateway.voltara.my` (or similar) DNS + Fly cert before first external charger.
