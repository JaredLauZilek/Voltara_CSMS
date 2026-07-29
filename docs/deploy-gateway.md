# Deploying the OCPP gateway & commissioning a real charger

Everything a physical charger needs in order to reach the platform. Do this
once; afterwards `flyctl deploy` (or the `deploy-gateway` workflow) is enough.

The gateway must be publicly reachable over `wss://` because that is where
chargers dial in, and it must stay awake — a charger holds one WebSocket open
for days.

## 1. Fly.io account and app (one time, ~5 minutes)

```bash
export PATH="$HOME/.fly/bin:$PATH"      # flyctl is already installed in this Codespace
flyctl auth login                       # opens a browser; sign up if you have no account
flyctl apps create voltara-gateway-staging --org personal
```

Fly asks for a payment card even on the free allowance. One `shared-cpu-1x`
512 MB machine running continuously is roughly **US$2–4/month**.

## 2. Point it at Supabase

The gateway needs the database directly (not the REST API): it uses real
transactions and `LISTEN/NOTIFY`, which PostgREST cannot express.

Get the connection string from the Supabase dashboard → **Connect** →
**Session pooler** (not Transaction pooler — transaction mode breaks
`LISTEN/NOTIFY`, and the command bus rides on it). It looks like:

```
postgresql://postgres.lxsfnqshcacsrolmymsg:[YOUR-DB-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Then set the secrets:

```bash
flyctl secrets set -a voltara-gateway-staging \
  DATABASE_URL='postgresql://…the string above…' \
  SUPABASE_URL='https://lxsfnqshcacsrolmymsg.supabase.co' \
  SUPABASE_SERVICE_ROLE_KEY='…dashboard → Settings → API → service_role…'
```

The service-role key is only used to publish live updates to dashboards. It is
a server-side secret and must never appear in the admin app or any `VITE_*`
variable (CLAUDE.md §10).

## 3. Deploy

```bash
flyctl deploy -c infra/fly.staging.toml --remote-only
```

Verify:

```bash
curl https://voltara-gateway-staging.fly.dev/healthz
curl https://voltara-gateway-staging.fly.dev/statusz     # connections: 0, realtime: true
flyctl logs -a voltara-gateway-staging
```

`statusz` reporting `"realtime": true` confirms the broadcast credentials
landed; `"connections"` is how many chargers are currently attached.

## 4. Register the charger

```bash
pnpm register:charger \
  --name "Bench Unit" \
  --identity VLT-BENCH-001 \
  --connectors 1 --max-kw 7.4 \
  --url wss://voltara-gateway-staging.fly.dev
```

Run it with `DATABASE_URL` pointing at **staging** (the same session-pooler
string), or it registers against your local dev database instead:

```bash
DATABASE_URL='postgresql://…staging…' pnpm register:charger --name "Bench Unit" …
```

It prints the credentials **once**. The key is stored only as a bcrypt hash —
if it is lost, register a new charger or rotate rather than trying to recover it.

## 5. Configure the charger

Field names vary by vendor; the values do not.

| Setting                                  | Value                                             |
| ---------------------------------------- | ------------------------------------------------- |
| OCPP version                             | 1.6J (JSON over WebSocket)                        |
| Central System / Server URL              | `wss://voltara-gateway-staging.fly.dev/ocpp`      |
| Charge Point ID / Identity               | the identity you registered, e.g. `VLT-BENCH-001` |
| Basic Auth username                      | the same identity                                 |
| Basic Auth password / `AuthorizationKey` | the printed key                                   |
| Security profile                         | 2                                                 |

Some firmware wants the identity appended to the URL instead of a separate
field: `wss://voltara-gateway-staging.fly.dev/ocpp/VLT-BENCH-001`. If the
charger has a "Security Profile" selector, choose 2 (TLS + Basic Auth); if it
only offers 0/1, it will not connect — that is deliberate.

## 6. Confirm it worked

Watch the gateway:

```bash
flyctl logs -a voltara-gateway-staging
```

You want `charger connected` then `charger booted`. Then check the database
(Supabase dashboard → SQL editor):

```sql
-- 'pending' flips to 'active' on the first successful BootNotification.
select ocpp_identity, lifecycle, connection_state, vendor_reported,
       model_reported, firmware_version, last_boot_at
from charge_points order by updated_at desc;

-- Every frame, both directions. This is the debugging tool.
select recorded_at, direction, action, payload
from ocpp_messages order by recorded_at desc limit 40;

-- Connector states as the charger reports them.
select ocpp_connector_id, status, status_updated_at, last_error_code from connectors;
```

Then plug a car in and watch `charging_sessions` and `meter_values` fill up.

To test a remote command before the Phase 2 UI exists, insert one by hand:

```sql
insert into remote_commands (tenant_id, charge_point_id, action, payload)
select tenant_id, id, 'RemoteStopTransaction', '{"transactionId": 1}'::jsonb
from charge_points where ocpp_identity = 'VLT-BENCH-001';

select action, status, response, error from remote_commands order by created_at desc;
```

`status` moves `queued → sent → accepted/rejected/timeout` within seconds. If it
stays `queued`, the gateway is not receiving notifications — check that
`DATABASE_URL` uses the **session** pooler, not the transaction pooler.

## When a charger will not connect

The frame log is empty if the charger never got past the handshake, so start
with the gateway log — every rejection is recorded there and in
`charge_point_connection_log`:

```sql
select recorded_at, event, close_reason, remote_address
from charge_point_connection_log order by recorded_at desc limit 20;
```

| Symptom                                   | Likely cause                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `rejected: unknown charge point identity` | The Charge Point ID on the charger does not match what was registered (case-sensitive)                           |
| `rejected: bad auth key`                  | Password mismatch; some firmware truncates long keys — re-register to get a fresh one                            |
| `rejected: charge point decommissioned`   | `lifecycle` is `decommissioned` in the database                                                                  |
| Nothing in the log at all                 | The charger never reached us: check its SIM/network, that the URL starts `wss://`, and that it trusts public CAs |
| Connects then drops repeatedly            | Usually a subprotocol mismatch — the charger must offer `ocpp1.6`                                                |

Vendor deviations belong in the quirks layer, never in the handlers — file a
`charger_compat` issue with the vendor, model, firmware and a frame excerpt.
