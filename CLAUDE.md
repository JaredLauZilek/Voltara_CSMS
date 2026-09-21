# Voltara CSMS — Engineering Contract

This file is loaded by every Claude Code session in this repo. Read it before making changes. It locks in the visual identity, the architecture, and the tenancy/security model; any code that lands here — including external code being merged in — must conform to all three.

## §1 Product & monorepo map

Voltara CSMS is a **dual-purpose** platform: it runs **Voltara's own** EV charging business (public/commercial CPO sites, condo/strata deployments, home charging — Voltara is tenant #1 and the reference deployment) **and** is sold white-label to other Malaysian CPOs, condo JMBs, and workplace operators. Consequence: every feature must work tenant-generically. Nothing may be hardcoded to Voltara except the _default_ theme.

| Workspace           | Responsibility                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `apps/admin`        | Operator/JMB admin portal (Vite + React SPA)                                              |
| `apps/ocpp-gateway` | Always-on OCPP central system (Node 22, Fly.io `sin`) — see `apps/ocpp-gateway/CLAUDE.md` |
| `apps/driver`       | Expo driver app (arrives Phase 4)                                                         |
| `packages/ui`       | Voltara design system — see `packages/ui/CLAUDE.md`                                       |
| `packages/shared`   | Generated DB types, domain enums, OCPP vocabulary, realtime contracts, pure helpers       |
| `supabase/`         | Migrations (system of record = Supabase Postgres), seed, edge functions                   |
| `tests/integration` | RLS isolation suite + simulator-driven OCPP scenarios                                     |

**Dependency rule:** apps import packages; packages never import apps; `packages/ui` never imports supabase or any data layer; `packages/shared` has no react/node-only/supabase imports (it must run in browser, gateway, edge functions, and Expo).

## §2 Brand identity (locked)

These tokens come from the original Claude Design handoff bundle via the Voltara accounting dashboard. Never substitute them. Always import from `@voltara/ui` (`C`, `RADIUS`, `SPACE`, `STATUS_COLORS`) — never inline a hex value in feature code.

| Token                                                           | Hex                               | Role                                                                |
| --------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `C.green`                                                       | `#1B512D`                         | Primary brand — headings, primary buttons, KPI numerals, active nav |
| `C.yellow`                                                      | `#FECC3E`                         | Accent — the lightning bolt; numerals on dark green                 |
| `C.honeydew`                                                    | `#E4F3E3`                         | Soft green tint — active nav bg, pills, selected rows               |
| `C.opal`                                                        | `#97C8C0`                         | Secondary chart colour                                              |
| `C.seasalt`                                                     | `#F9F9F9`                         | App background, table headers                                       |
| `C.slate`                                                       | `#767B77`                         | Secondary text                                                      |
| `C.border` / `C.divider` / `C.hoverRow`                         | `#EBEBEB` / `#F3F3F3` / `#FAFAFA` | Hairlines                                                           |
| `C.ink`                                                         | `#1a1a1a`                         | Body text                                                           |
| `C.error`/`errorBg`, `C.info`/`infoBg`, `C.warning`/`warningBg` | see tokens.ts                     | Semantic accents                                                    |

- **Typography:** Figtree only (400/500/600/700/800). Micro-labels: `11px/700/uppercase/0.05em/slate`. KPI numerals: `32px/700/-0.04em`. Topbar title: `18px/700/-0.02em/green`.
- **Spacing scale:** `6 · 10 · 12 · 16 · 20 · 24 · 28`. Page padding 28. Card inner padding `20px 24px`.
- **Radii:** 6 chips · 8 small inputs · 10 buttons · 12 sub-cards · 16 cards · 20 modals · 99 pills.
- **Light mode only.** No dark mode, no CSS variables, no gradients (except the 13%→0% area fill under line charts), shadows only on modals/dropdowns.
- Status pills use the six `STATUS_COLORS` families (green/amber/blue/red/orange/grey). CSMS statuses (Available, Charging, Faulted, Offline, …) are already mapped — extend the map, never invent new colour pairs.
- **These tokens are the DEFAULT theme.** Per-tenant white-label branding (Phase 6) overrides them at runtime via a ThemeProvider. Never fork tokens per tenant in code.

## §3 Component patterns (always reuse)

All in `packages/ui`. Do not duplicate them inside a feature; extend via props instead.

| Component              | Contract                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `KPICard`              | 4-up grid `repeat(4,1fr)` gap 14; `accent` variant = green bg + yellow numeral                                       |
| `Badge` / `StatusPill` | 11/700, `3px 10px`, radius 99, colours from `STATUS_COLORS`                                                          |
| `Modal`                | 640px default, radius 20, padding 28, grey 32×32 `×` top-right, backdrop `rgba(0,0,0,.32)`                           |
| `Toolbar`              | filter pills left · `⌕` pill search · primary button at `marginLeft:auto`                                            |
| `NavItem`              | 14px, `10px 16px`, active = honeydew bg + green text + 6px dot                                                       |
| Table (inline pattern) | white card radius 16; header seasalt with 11/700 uppercase slate cells; row hover `#FAFAFA`; row divider `C.divider` |
| Empty state            | `padding:32; color:C.slate; fontSize:14`, centred, terse copy ("No locations found.")                                |
| Charts                 | `Sparkline/MiniBar/Donut/LineChart/BarChart` — pure SVG, **no chart libraries ever**                                 |

Icons: lucide-react in nav only (`size 18`, `strokeWidth 2.25/1.75`); Unicode glyphs elsewhere (`⌕ ▾ × ✓ ↑ ↓ ‹ › ·`). Voice: terse, sentence case, no exclamation marks, real ellipsis `…`, middot `·` as separator, en-GB dates (`25 Jul 2026`), `RM` currency via `formatRM`.

## §4 Admin app architecture (locked)

```
apps/admin/src/
├── app/        # shell ONLY: main, App, AuthGate, LoginScreen, auth context, routes
├── shared/lib/ # supabase client, queryClient, claims decoding
└── features/<kebab-name>/
    ├── index.ts   # PUBLIC barrel — the only importable file from outside
    ├── types.ts   # Database row type re-exports + const arrays
    ├── api.ts     # the ONLY place supabase.from('<table>') may appear
    ├── hooks.ts   # TanStack Query wrappers (KEY = ['<name>'] as const)
    └── <Name>Screen.tsx / <Name>Modal.tsx
```

1. **Feature isolation** — a feature imports only `@voltara/*` packages, `@/shared/*`, `@/app/auth`, and other features' barrels.
2. **No supabase calls in screens** — screens render; hooks own data access; `api.ts` owns the network.
3. **Adding a feature** = feature folder + one entry in `app/routes.tsx` (`ROUTES` + `NAV_SECTIONS`). No other shell changes.
4. **Routing (deviation from the accounting app, sanctioned):** react-router with real URLs — charger/session pages must be deep-linkable. Shareable state (filters, selected charger) belongs in URL params, not useState.
5. `features/locations/` is the canonical example folder — copy it when starting a feature.

## §5 Multi-tenancy & RLS (locked)

- Every tenant-scoped table has `tenant_id uuid not null` + RLS enabled + policies with **both** `USING` and `WITH CHECK` + a btree index on `tenant_id` and every other policy column.
- Claims come ONLY from the custom access token auth hook (`app_metadata.tenant_id` / `tenant_role` / `platform_admin`). **`user_metadata` is end-user writable and must never appear in a policy or authorization decision.**
- Policies call the STABLE helpers wrapped in scalar subqueries — `(select public.jwt_tenant_id())` — so Postgres evaluates once per statement (initPlan), not per row.
- Roles: `owner > admin > operator > viewer` (helpers `is_tenant_admin()`, `is_tenant_operator()`).
- **New-table checklist:** `tenant_id` column → RLS enable → select/insert/update/delete policies → indexes → `pnpm gen:types` → RLS test in `tests/integration` if the shape is new.
- Service-role code (gateway, edge functions) bypasses RLS and must therefore always filter by resolved tenant in application code. The service-role key never appears in anything browser-reachable (`VITE_*`, admin, driver).

## §6 OCPP gateway rules (locked)

- The gateway is the **only writer** of charger runtime state: `connectors.status`, `charge_points.connection_state/last_seen/config`, sessions, meter values, status/connection logs. The admin app requests changes only via `remote_commands`.
- **Every OCPP frame is persisted** to `ocpp_messages` (in and out), with `AuthorizationKey` values redacted before persist.
- The internal domain model is **protocol-agnostic**: OCPP 1.6 wire shapes never leak past `apps/ocpp-gateway/src/ocpp/v16/`. OCPP 2.0.1 arrives later as a second adapter onto the same model.
- Vendor quirks live ONLY in the quirks layer (keyed by boot-reported vendor/model), never inline in handlers.
- Admin→gateway commands travel exclusively through `remote_commands` + `pg_notify`; fan-out to UIs exclusively through Realtime Broadcast. See §8.
- Protocol detail, state machines, and handler conventions: `apps/ocpp-gateway/CLAUDE.md`.

## §7 Database & migrations workflow (locked)

- New migration: `pnpm exec supabase migration new <topic>` (timestamped file). **Additive-only — never edit a prior migration.**
- Remote application happens ONLY via the `migrate` workflow (`supabase db push`): staging automatic on merge, production behind environment approval. Supabase MCP `apply_migration` is for local exploration only and must be captured as a committed file in the same PR (ADR-0004).
- After every migration: `pnpm gen:types`. `packages/shared/src/database.types.ts` is generated — never hand-edit it.
- High-volume tables (`meter_values`, `ocpp_messages`, future telemetry) must ship **partitioned (monthly) with a pg_cron create/drop retention job** from their first migration.
- **Partitions live in the `partitions` schema, never `public`.** PostgREST exposes every table in `public`, and RLS on a partitioned parent does not protect a child queried directly — a partition in `public` would be a route around tenant isolation. Parents stay in `public` with the policies; `create_monthly_partition()` places children in `partitions` and revokes their grants.
- Don't store derivable fields — compute via SQL views (`vw_*`).

## §8 Realtime rules

- One private Broadcast channel per tenant: `tenantChannel(tenantId)` → `tenant:{id}`. Events: `cp_status`, `session_update`, `meter` (throttled ≥5s per connector) from the gateway, and `command_update` from a database trigger on `remote_commands`. Payload types come from `@voltara/shared` — never ad-hoc shapes.
- The admin app opens the channel in exactly one place (`shared/realtime.tsx`, a shell-level provider); features subscribe through `useRealtimeEvent()` and patch their own TanStack caches. Frames (`ocpp_messages`) are never broadcast — log viewers poll.
- Channel auth = RLS on `realtime.messages` (topic must equal `'tenant:' || jwt_tenant_id()`).
- **Never use `postgres_changes` for telemetry** (ADR-0003). Low-frequency notifications may use `realtime.send()` from triggers.

## §9 Testing & simulator workflow

- Unit tests: vitest inside each workspace (`pnpm test`).
- `tests/integration`: RLS isolation suite (two seeded tenants, transaction-scoped personas) + from Phase 1 the scripted-charger OCPP scenarios (built on `ocpp-rpc`'s `RPCClient` — no Docker in CI). **Every gateway behaviour change ships a scenario.**
- Manual/conformance rigs: Solidstudio `ocpp-virtual-charge-point` (docker compose), SAP `e-mobility-charging-stations-simulator` for load. SteVe may be run locally as a behavioural oracle for disputed 1.6J semantics — read it, never copy it (GPL-3.0).

## §10 Security (locked)

- Charger auth is an explicit per-charger ladder in `charge_points.security_profile`, enforced by the gateway at the handshake: **2 = Basic Auth over WSS (default, and the floor for production revenue chargers)** · 1 = Basic Auth over `ws://` (legacy TLS stacks) · 0 = identity-only, no credentials (incumbent-CSMS parity; commissioning). 0 and 1 exist because the regional installed base runs that way — they are opt-in per charger, surfaced with a warning chip in the admin UI, and never the default. Keys are shown exactly once at registration, rotated via `ChangeConfiguration(AuthorizationKey)` keeping old+new valid until the next successful reconnect.
- Keys are hashed with **bcrypt via pgcrypto** in `charge_points.auth_key_hash`, and verified **inside Postgres** (`auth_key_hash = crypt($key, auth_key_hash)`) as part of the charge-point lookup the gateway must make anyway. Chosen over argon2-in-Node because the key is a high-entropy machine-generated secret (so the slow-KDF advantage is moot), it keeps a native crypto dependency out of the gateway's container image, and it leaves exactly one place that knows how keys are hashed.
- Never log or persist credentials; redact `AuthorizationKey` in frame logs.
- Supabase Auth for humans; deny-by-default RLS; tenant writes (tenants/memberships/platform_admins) are service-role only.

## §11 Screen & modal patterns (carried from the accounting app)

- **Confirm-delete two-step:** `Delete` → row swaps to `Permanent — cannot be undone.` + red `Confirm Delete` + `Cancel`. Reset on close.
- **Save flow:** `isSaving={createMut.isPending || updateMut.isPending}`; button reads `Saving…` with `cursor: wait`.
- **Mutation reset:** `useEffect(() => { createMut.reset(); updateMut.reset(); }, [modal])` — else TanStack Query keeps a stale failure visible.
- **Live-derived modal record:** `modal !== 'new' ? (rows.find(r => r.id === modal.id) ?? modal) : null` — never pass the click-time snapshot.
- **Strip view-augmented/server-managed fields before mutating** — PostgREST silently drops unknown columns and the update "succeeds".
- **Button order (locked):** `Delete` → (feature actions) → `marginLeft:'auto'` → `Cancel` → `Save Changes`.
- Multi-line text uses `<textarea rows={3}>` + `whiteSpace:'pre-wrap'` on display.

## §12 White-label theming rules

- Tenant theme = `tenant_settings.theme` jsonb of token overrides, validated against a schema (Phase 6). Components read theme via context; nothing imports tenant values directly.
- The flagship driver app is the **Voltara-branded** store listing; white-label tenants join it via runtime branding, and only graduate to their own bundle IDs published from **their own** Apple/Google accounts (Apple Guideline 4.3(a)).

## §13 Malaysia domain notes

- Currency `MYR`, formatted `RM 1,500` / `RM 42.1k`. Dates en-GB, timezone `Asia/Kuala_Lumpur`.
- **SST:** applicability to EV charging is unresolved. Tax is always a separate stored component with a configurable rate per tenant/tariff line — never hardcode 0% or 8%, and design for retroactive re-rating.
- Three licensing jurisdictions by state: ST (peninsular), ECoS (Sabah/Labuan), Sarawak — `licensingJurisdiction()` in `@voltara/shared`. JMB/MC consent letters are ST licence prerequisites for condo sites. MEVnet/ST reporting exports are first-class features, not afterthoughts.

## §14 What NOT to do

- ❌ Inline hex in feature code — import `C` from `@voltara/ui`.
- ❌ `supabase.from(…)` outside a feature's `api.ts`.
- ❌ Reach into another feature's internals (only barrels).
- ❌ Chart libraries, CSS frameworks, component libraries — the design system is hand-rolled.
- ❌ `postgres_changes` for telemetry.
- ❌ OCPP wire types outside `apps/ocpp-gateway/src/ocpp/`.
- ❌ `user_metadata` in any policy or authorization decision.
- ❌ Service-role key anywhere browser-reachable.
- ❌ Unpartitioned high-volume tables; retention-less logs.
- ❌ Editing generated `database.types.ts` or prior migrations.
- ❌ Volatile inventories in this file (feature rosters, migration lists) — git is the roster. See §16.

## §15 Common workflows

| Task                    | Recipe                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a feature           | copy `apps/admin/src/features/locations/` → rename, gut, rebuild → add `ROUTES` + `NAV_SECTIONS` entries                                                        |
| Add a column            | `supabase migration new` → `pnpm db:reset` → `pnpm gen:types` → feature `types.ts` → modal/screen                                                               |
| Add an OCPP action      | vocabulary in `@voltara/shared/src/ocpp` → handler in gateway protocol module → frame log verified → integration scenario → gateway CLAUDE.md if a rule changed |
| Register a vendor quirk | `charge_point_vendors.quirks` flag + quirks-layer hook + `charger_compat` issue link                                                                            |
| Enable deploys          | repo var `DEPLOY_ENABLED=true` + staging environment secrets (docs/dev-setup.md)                                                                                |

## §16 Growth policy — how this file evolves

The accounting dashboard's CLAUDE.md rotted exactly where it enumerated volatile state (its §7 feature roster and §19 migration list went stale). Rules:

1. **This file holds durable contracts only.** Anything enumerable from the filesystem or git is banned from it.
2. **Per-package contracts:** `apps/ocpp-gateway/CLAUDE.md` (protocol/state-machine detail) and `packages/ui/CLAUDE.md` (component API). The driver app gets one when it lands. Root links; it does not duplicate.
3. **Decisions with alternatives go to `docs/adr/NNNN-*.md`** (0001 monorepo, 0002 gateway DB client, 0003 broadcast, 0004 migrations, 0005 payments provider, 0006 tariff/CDR model so far). An ADR is written when a choice forecloses others, not for routine work.
4. **A PR that changes a contract updates the relevant CLAUDE.md section in the same PR** — enforced by the PR-template checkbox.
5. **Quarterly stale-sweep:** read this file top to bottom; any section found stale twice in a row is either fixed structurally (moved to ADR/docs) or deleted. A wrong contract is worse than no contract.
