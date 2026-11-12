# Voltara Home — Engineering Contract

Loaded by every Claude Code session in this repo. Read it before making changes. It mirrors the Voltara CSMS contract (github.com/JaredLauZilek/Voltara_CSMS) so the two products stay one company visually and architecturally. Where the two differ, this file wins here.

## §1 Product & monorepo map

Voltara Home is the **homeowner app for Voltara's AC home charger** (HiCi hardware today; other brands later) plus a **staff portal** for Voltara, its dealers and installers. The charger is reached **over Bluetooth Low Energy from the phone**; the phone forwards readings to Supabase. Single tenant: Voltara only.

| Workspace         | Responsibility                                                                   |
| ----------------- | -------------------------------------------------------------------------------- |
| `apps/home`       | Expo app (iOS + Android): onboarding, live charger over BLE, history, installer  |
| `apps/admin`      | Staff / dealer portal (Vite + React SPA) — fleet, owners, dealers, support, team |
| `packages/ui`     | Voltara design system — copy of the CSMS package, see `packages/ui/CLAUDE.md`    |
| `packages/shared` | Generated DB types, domain enums, **charger protocol codecs + simulator**        |
| `supabase/`       | Migrations (system of record = Supabase Postgres), seed, edge functions          |
| `docs/`           | Study, ADRs, dev setup, HiCi protocol capture checklist                          |

**Dependency rule:** apps import packages; packages never import apps; `packages/ui` never imports a data layer; `packages/shared` has no react / react-native / node-only / supabase imports (it runs in the browser, Deno edge functions and Hermes).

## §2 Brand identity (locked — identical to CSMS §2)

Tokens: `C.green #1B512D` · `C.yellow #FECC3E` · `C.honeydew #E4F3E3` · `C.opal #97C8C0` · `C.seasalt #F9F9F9` · `C.slate #767B77` · `C.ink #1a1a1a` · hairlines `#EBEBEB/#F3F3F3/#FAFAFA` · semantic `error/info/warning` + `*Bg`. Figtree only. Light mode only. No CSS frameworks, no component libraries, no chart libraries — charts are hand-rolled SVG. Radii 6/8/10/12/16/20/99. Status pills come from the six `STATUS_COLORS` families. Voice: terse, sentence case, no exclamation marks, en-GB dates, `Asia/Kuala_Lumpur`, `RM` via `formatRM`.

- Web: import `C`, `RADIUS`, `SPACE`, `STATUS_COLORS` from `@voltara/ui`; never inline hex.
- Mobile: `apps/home/src/lib/theme.ts` mirrors `C` byte-for-byte (the app cannot import `@voltara/ui`). Keep both files identical to the CSMS tokens; a visual change is made in both repos deliberately (ADR-0002).

## §3 Mobile app architecture (locked)

```
apps/home/
├── app/                     # expo-router screens ONLY (URL = screen)
│   ├── (tabs)/              # chargers · history · installer (role-gated) · profile
│   ├── charger/[id]…        # live screen, settings, household
│   ├── onboarding/          # add (serial + claim code), scan (QR)
│   ├── installer/           # register, commission/[id]
│   └── dev/                 # bench (simulator), gatt (explorer) — __DEV__ only entry points
└── src/
    ├── ble/                 # transport (ble-plx) · drivers/<protocol> · useCharger · useTelemetrySync
    ├── features/<name>/     # api.ts (ONLY place supabase.from/rpc appears) · hooks.ts · index.ts
    └── lib/                 # supabase, auth, query, theme, ui kit, format, pins
```

1. **Screens never touch BLE or Supabase directly.** They call `useCharger()` (from `@/ble`) for the link and feature hooks for data.
2. **Transport / driver / domain split.** `src/ble/transport.ts` moves bytes and knows nothing about chargers. `src/ble/drivers/<protocol>.ts` sequences a brand's protocol into a `ChargerLink`. Byte layouts, UUIDs and codecs live in `packages/shared/src/charger/<brand>/` — pure TS, unit-tested, no RN imports. **A brand-specific constant outside that folder is a bug.**
3. **One `ChargerLink` surface for every brand** (`packages/shared/src/charger/types.ts`). The simulator (`mock`) implements it too; screens must not be able to tell the difference.
4. **The simulator is not a test double, it is a product feature**: App Store reviewers and new developers have no charger. Keep it working.
5. **Telemetry goes through RPCs** (`ingest_readings`, `open_session`, `close_session`), throttled ≥5 s per sample, batched every 15 s, best-effort.
6. **Settings are desired state in Postgres**, applied on connect by `useApplySettings`, acknowledged with `report_settings_applied`. The owner's `max_current_a` can never exceed the installer's `rated_current_a` (enforced in SQL).
7. **No service-role key, ever.** Only `EXPO_PUBLIC_*` values ship in the bundle.
8. **Dev conveniences are double-gated** by `__DEV__` and env (`EXPO_PUBLIC_DEV_AUTO_LOGIN_*`); they perform real sign-ins so RLS is always exercised.
9. **BLE needs a development build** (`expo-dev-client` + EAS). Expo Go and web run the app with the simulator only; `BleTransport.available` is false there and the UI says so.

## §4 Admin app architecture (locked — same shape as CSMS §4)

```
apps/admin/src/
├── app/        # shell ONLY: main, App, AuthGate, LoginScreen, auth context, routes
├── shared/lib/ # supabase client, queryClient, csv
└── features/<kebab-name>/ index.ts · types.ts · api.ts (ONLY supabase.from) · hooks.ts · <Name>Screen.tsx
```

Feature isolation, no supabase calls in screens, routes registered in `app/routes.tsx` (`ROUTES` + `NAV_SECTIONS`), react-router with real URLs, `features/chargers/` is the canonical example folder.

## §5 Roles & RLS (locked)

- **Three kinds of people**: homeowners (access flows from `chargers.owner_user_id` and `charger_members`), **dealer members** (`dealer_members`: `dealer_admin` | `installer`, grouped by `dealers`), **Voltara staff** (`staff`: `admin` | `support` | `viewer`).
- **Role helpers read the role tables** (`is_staff()`, `is_staff_admin()`, `is_staff_support()`, `my_dealer_id()`, `dealer_role()`, `charger_role(id)`), SECURITY DEFINER + STABLE, always called as `(select public.fn())` in policies. No JWT claims hook is required; one can replace the lookups later without touching a policy (ADR-0001). **`user_metadata` never appears in a policy.**
- **Lifecycle moves only through RPCs**: `register_charger` → `commission_charger` → `claim_charger` (→ `release_charger` / `decommission_charger`). Plain `UPDATE chargers` is limited per role by the `chargers_guard_update` trigger.
- **New-table checklist:** RLS enable → explicit `grant` to `authenticated` (new projects expose nothing by default) → select/insert/update/delete policies with both `USING` and `WITH CHECK` → index every policy column → `pnpm gen:types`.
- High-volume tables (`charger_readings`) ship **partitioned monthly, children in the `partitions` schema**, with `maintain_partitions()` on pg_cron.
- Service-role code (edge functions) resolves roles from the tables itself and never trusts the request body for authorization.

## §6 Database & migrations workflow

- New migration: `pnpm exec supabase migration new <topic>`. **Additive-only once applied** — never edit a migration that has reached the hosted project.
- Hosted project: `Voltara-HomeApp` (`yvtaokyuxniflztesons`, `ap-northeast-2`). Apply with `supabase db push` (or the `migrate` workflow once `DEPLOY_ENABLED=true`). After every migration: `pnpm gen:types` (needs `supabase login`); `packages/shared/src/database.types.ts` is generated — never hand-edit it.
- `supabase/seed.sql` is dev-only data with known passwords. **Delete the `*@dev.voltara.com.my` users before real customers exist.**

## §7 Security

- Claim codes are bcrypt-hashed (`chargers.claim_code_hash`) and verified in `claim_charger()`; ten failures per hour lock a unit. The plaintext lives only on the owner's phone keychain (`lib/pins.ts`) as the BLE PIN.
- Never log PINs or claim codes. Never persist the service-role key anywhere reachable from a client bundle.
- Supabase Auth for humans (email magic link in the app, password in the portal); deny-by-default RLS.

## §8 What NOT to do

- ❌ Inline hex in feature code · ❌ `supabase.from(…)` outside `api.ts` · ❌ BLE UUIDs or frame layouts outside `packages/shared/src/charger/<brand>/` · ❌ reaching into another feature's internals · ❌ chart / CSS / component libraries · ❌ editing generated `database.types.ts` or applied migrations · ❌ unpartitioned telemetry · ❌ `user_metadata` in authorization · ❌ volatile inventories in this file (git is the roster).

## §9 Common workflows

| Task                        | Recipe                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a mobile feature        | `src/features/<name>/{api,hooks,index}.ts` → screen under `app/` → nothing else                                                                |
| Add an admin feature        | copy `apps/admin/src/features/chargers/` → rename, gut, rebuild → add `ROUTES` + `NAV_SECTIONS` entries                                        |
| Support a new charger brand | `packages/shared/src/charger/<brand>/{gatt,codec}.ts` + tests → `apps/home/src/ble/drivers/<brand>.ts` → add to `CHARGER_PROTOCOLS` + DB check |
| Verify the HiCi protocol    | dev client → Profile → GATT explorer → follow `docs/hici-ble-protocol.md`, then edit `gatt.ts` / `codec.ts` only                               |
| Add a column                | `supabase migration new` → apply → `pnpm gen:types` → feature `types.ts` → screen                                                              |

## §10 Growth policy

Durable contracts only in this file. Decisions with alternatives go to `docs/adr/NNNN-*.md`. A PR that changes a contract updates the relevant section in the same PR.
