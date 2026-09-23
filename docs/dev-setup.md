# Dev setup

## Prerequisites

Node 22+, pnpm 10 (via corepack), Docker (for the local Supabase stack). The Supabase CLI is a dev dependency — run it as `pnpm exec supabase …`.

## First run

```bash
pnpm install
pnpm db:start          # boots local Supabase (Postgres/Auth/Realtime/Studio) + applies migrations & seed
cp apps/admin/.env.example apps/admin/.env.local
# paste the anon key printed by `pnpm exec supabase status` into .env.local
pnpm dev               # admin on :5173, gateway health on :9221
```

Local logins (seeded): `jared@voltara.com.my` / `voltara-dev` (Voltara owner, platform admin) and `ops@democpo.test` / `demo-dev` (Demo CPO — the second tenant that proves isolation). Studio: http://127.0.0.1:54323.

**Codespaces:** the browser runs on your machine, not in the container, so the admin app reaches
local Supabase through the Vite dev-server proxy (`VITE_SUPABASE_URL=/supabase`) — only port 5173
needs forwarding. `VITE_DEV_AUTO_LOGIN_EMAIL/_PASSWORD` in `.env.local` skip the login form in dev.
If `supabase start` dies at "Initialising schema", run `sudo iptables-legacy -P FORWARD ACCEPT` first
(a stale legacy firewall table drops container-to-container traffic on fresh codespaces).

## Everyday commands

| Command                                      | Does                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev:all`                               | **everything**, idempotently: Supabase · gateway · admin · Expo tunnel for the phone |
| `pnpm dev`                                   | admin + gateway only, in watch mode                                                  |
| `pnpm db:reset`                              | re-applies all migrations + seed                                                     |
| `pnpm gen:types`                             | regenerates `packages/shared/src/database.types.ts` — run after **every** migration  |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | via turbo across all workspaces                                                      |
| `pnpm test:integration`                      | RLS isolation suite (needs local stack up)                                           |
| `pnpm exec supabase migration new <topic>`   | new migration file                                                                   |
| `pnpm register:charger --name "…"`           | register a charge point and print its one-time credentials                           |
| `pnpm exec supabase functions serve`         | run edge functions locally (`admin-invite`); invite emails land in Mailpit :54324    |
| `pnpm sim:session --kwh 7.4 --idle-min 5`    | play one complete charging session through the local gateway (no hardware needed)    |

### Coming back after a pause

Dev servers die with the codespace. `pnpm dev:all` restarts only what died and
prints the phone link; the same link is on the admin app under **Dev → Phone &
services** as a QR, with a health pill per service. The Expo tunnel address is
stable across restarts (it is derived from `apps/driver/.expo/settings.json`), so
Expo Go on the phone keeps working — it only needs the server to be awake.

`pnpm dev:all` reads two gitignored files: `.env.gateway.local` (gateway
database URL and service-role key) and `.env.dev.local` (`EXPO_TOKEN`, an
Expo access token from expo.dev → Account settings → Access tokens).

To put a **real charger** on the platform, see [deploy-gateway.md](deploy-gateway.md) —
it covers the Fly.io deploy, the charger's settings, and how to confirm it connected.

## Deploys (once enabled)

Set the repo variable `DEPLOY_ENABLED=true` and configure the `staging` GitHub environment:

- secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Then merges to `main` auto-deploy: migrations → staging Supabase, gateway → Fly (`voltara-gateway-staging`, region `sin`), admin → Cloudflare Pages. Production jobs get added when the prod project exists (Phase 2–3, first pilot).

**Staging Supabase checklist (one-time, manual):** create the project in `ap-southeast-1` (Singapore) → run the migrate workflow (or `supabase db push`) → in the dashboard enable **Authentication → Hooks → Custom Access Token** pointing at `public.custom_access_token_hook` → create your admin user and a `memberships` row (see `supabase/seed.sql` for the shape; do not run the seed itself against staging).

## Runbook notes

- Gateway rolling deploys briefly drop charger WebSockets. This is fine: OCPP chargers reconnect automatically and queue transactions while offline. Never scale the gateway to zero.
- The service-role key lives only in Fly secrets and edge function env — never in anything `VITE_*`.
