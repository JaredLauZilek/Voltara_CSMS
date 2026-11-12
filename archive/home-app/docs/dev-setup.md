# Dev setup

## Prerequisites

- Node 22+, pnpm 12 (`corepack enable`), Docker (optional, for a local database).
- An Expo account (free) and `npm i -g eas-cli` for device builds. Apple Developer / Google Play Console accounts are only needed for store submission.

## Install

```bash
pnpm install
cp apps/home/.env.example apps/home/.env      # hosted dev project + dev auto-login
cp apps/admin/.env.example apps/admin/.env.local
```

## Database

The hosted dev project is `Voltara-HomeApp` (`yvtaokyuxniflztesons`). **State on 7 Oct 2026:** all six migrations, the seed and the `admin-invite` function are applied there and `supabase migration list` shows local and remote in sync. Still to set once the portal has a host: `npx supabase secrets set ADMIN_APP_URL=https://<admin host>`.

The Codespace carries `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` as Codespaces secrets, so the CLI works without `supabase login`. If a terminal does not see them (they are injected at container start), load them from the shared env file: `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' /workspaces/.codespaces/shared/.env | cut -d= -f2-)` (same for the password).

For later schema changes use the CLI:

```bash
npx supabase login
npx supabase link --project-ref yvtaokyuxniflztesons
npx supabase migration new <topic>     # edit the file
npx supabase db push                   # applies only versions the project lacks
pnpm gen:types
```

Local alternative without Docker Compose friction: run a Supabase Postgres image and point the CLI at it (this is how types were first generated):

```bash
docker run -d --name voltara-home-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 public.ecr.aws/supabase/postgres:17.11.0.002
for f in supabase/migrations/*.sql; do docker exec -i voltara-home-pg psql -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 < "$f"; done
docker exec -i voltara-home-pg psql -U postgres -h 127.0.0.1 < supabase/seed.sql
npx supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:54329/postgres --schema public > packages/shared/src/database.types.ts
```

## Seeded logins (password `voltara-dev`)

| Email                        | Who                                     |
| ---------------------------- | --------------------------------------- |
| owner@dev.voltara.com.my     | homeowner — owns HC-DEMO-0001, SIM-0001 |
| family@dev.voltara.com.my    | household member                        |
| installer@dev.voltara.com.my | installer (Voltara in-house dealer)     |
| dealer@dev.voltara.com.my    | dealer admin (Demo Dealer)              |
| admin@dev.voltara.com.my     | Voltara staff admin                     |
| support@dev.voltara.com.my   | Voltara staff support                   |

Unclaimed units: `HC-DEMO-0002` (code `246810`), `HC-DEMO-0003` (code `135790`).

## One command for everything (dev convenience, remove before launch)

```bash
pnpm dev          # portal + Expo tunnel; prints the portal URL and the phone QR
pnpm dev:stop     # stops both
```

`scripts/dev.mjs` is idempotent and leaves running services alone. It writes `apps/admin/public/dev-phone.json` (gitignored), and the portal's dev-only **Dev → Phone & services** page shows the same QR, the seeded logins and whether Expo and Supabase answer. The page and its chunk are excluded from production builds. If ngrok refuses the anonymous tunnel, the script restarts Expo once; run it again if that also fails.

**Expo account:** a phone signed in to Expo Go can only open projects served by the same account. Create an access token at expo.dev → Account settings → Access tokens, add it as the Codespaces secret `EXPO_TOKEN`, and `pnpm dev` signs the dev server in (restarting an anonymous one if needed); the tunnel address then carries your username and stays stable. Without the token, sign out of Expo Go on the phone (Profile → Sign out) before scanning.

## Mobile app

```bash
cd apps/home
pnpm start:go        # Expo Go: everything except real Bluetooth (simulator works)
eas build --profile development --platform android   # dev client with BLE
pnpm start           # then open the dev client
```

The simulator charger `SIM-0001` is claimed by the owner account; **Profile → Simulator bench** drives it. **Profile → GATT explorer** is the bench tool for real hardware (`docs/hici-ble-protocol.md`).

## Admin portal

```bash
pnpm --filter @voltara/home-admin dev
```

## Checks

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` — the same as CI. With the local container above holding a fresh seed, `./scripts/rls-smoke.sh` exercises RLS and every RPC per role (owner, household member, installer, dealer admin, staff) and prints the expected value next to each result.
