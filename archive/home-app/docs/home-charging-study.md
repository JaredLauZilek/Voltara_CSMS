# Voltara Home — home charging app study & proposal

Status: **decided** (answers recorded 5 Oct 2026, build started 5–7 Oct 2026). Sections 2–4 are now implemented as described; §5 records Jared's answers.

Companion product: [Voltara CSMS](https://github.com/JaredLauZilek/Voltara_CSMS) (OCPP charging station management, white-label). Voltara Home is the **consumer app for the Voltara AC home charger**, talking to the charger primarily over **Bluetooth Low Energy (BLE)**, with Supabase project `Voltara-HomeApp` as its backend, plus a staff web portal for Voltara to monitor the installed fleet.

---

## 1. How home charging apps work today

Studied: Wallbox (Pulsar Plus), Easee (One / Charge), Zaptec (Go / Pro), Ohme (Home Pro / ePod), Hypervolt (Home 3), plus the open-source BLE work on Easee and Exicom Spin chargers and a published BLE authorisation architecture.

### 1.1 Connection topology

Every serious home charger ships **two paths to the phone**, and the app hides which one is in use:

| Path                                         | When it is used                                                                                                    | Properties                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **BLE (local)**                              | Commissioning, Wi‑Fi provisioning, control while standing at the charger, fallback when the house internet is down | Works with no internet; ~10 m range; phone is the GATT _central_, charger is the _peripheral_; one phone connected at a time on most firmware |
| **Wi‑Fi / 4G → cloud**                       | Remote start/stop and schedules while away, charging history, firmware updates, tariff/solar integrations          | Charger holds an outbound WebSocket/MQTT/OCPP connection to the vendor cloud; the app talks to the cloud API                                  |
| **Phone as bridge** (Easee, early Hypervolt) | Charger has no (or unreliable) internet; phone relays readings to the cloud while connected over BLE               | Cheapest hardware; history only exists while someone has the app open near the charger                                                        |

Wallbox, Zaptec and Easee all run the same first‑day flow: **BLE first, Wi‑Fi second**. Wallbox's own guide: add charger → pair over Bluetooth (OS pair prompt) → app lists Wi‑Fi networks seen by the charger → user picks SSID and types the password → charger joins Wi‑Fi and registers with the cloud. Easee goes further and keeps BLE as a permanent local control channel: the open‑source `easee-ble` library shows PIN + serial authentication, long‑lived connections, and the full command set available offline.

**Consequence for Voltara Home:** BLE is the primary channel the user asked for, and the right first build. The data model should still be designed so that a Wi‑Fi/OCPP path (the charger connecting to the CSMS gateway) can be added later without re‑modelling chargers, sessions or readings.

### 1.2 Onboarding / commissioning flow (industry pattern)

1. **Identify** — scan the QR / type the serial printed on the unit (Easee: `EMxxxxxx` + PIN; Wallbox: serial + UID).
2. **Pair over BLE** — app scans for the advertised name/serial; either OS‑level pairing (Wallbox), app‑level PIN handshake (Easee uses J‑PAKE), or "just works" + app‑level challenge/response.
3. **Claim** — the cloud links the charger's serial to the user account; a second user cannot claim an already‑claimed charger without the owner's invite.
4. **Provision Wi‑Fi** (optional) — SSID list from the charger, password written over BLE.
5. **Installer settings** — rated circuit current, phase mode, earthing/RCD checks, load‑balancing CT clamp. Easee and Zaptec split these into a separate _installer_ app or PIN‑gated mode; the homeowner app hides them.
6. **First charge** — plug in, the charger reports `Preparing → Charging`, the app shows live power.

### 1.3 Feature inventory (what the market considers table stakes)

| Tier            | Feature                                                                                                                                              | Who ships it                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Core**        | Live state (Available / Preparing / Charging / Suspended / Finishing / Faulted), live power kW, current per phase, voltage, session kWh and duration | all                                                |
|                 | Start / pause / resume / stop                                                                                                                        | all                                                |
|                 | Max current limit (6–32 A slider)                                                                                                                    | all                                                |
|                 | Charging history with kWh, duration, cost estimate                                                                                                   | all                                                |
|                 | Cable / connector lock                                                                                                                               | Easee, Zaptec, Ohme, Wallbox                       |
|                 | LED brightness / indicator control                                                                                                                   | Easee, Ohme, Hypervolt                             |
|                 | Firmware version + OTA update prompt                                                                                                                 | all                                                |
| **Smart**       | Scheduled charging (time window, or "ready by 7 am")                                                                                                 | all                                                |
|                 | Electricity tariff entry → real cost per session; off‑peak auto‑schedule                                                                             | Wallbox, Ohme, Hypervolt                           |
|                 | Solar surplus charging (needs an energy meter / CT clamp) and 1‑phase ↔ 3‑phase switching                                                            | Wallbox, Easee, Ohme Solar Boost                   |
|                 | Dynamic load balancing against the house main (CT clamp)                                                                                             | Wallbox Power Boost, Easee Equalizer, Zaptec Sense |
|                 | Access control: RFID keys, family / guest users, "lock to my car"                                                                                    | Easee, Zaptec, Wallbox                             |
| **Fleet / ops** | Multi‑charger load sharing (up to 3 Easee on one circuit)                                                                                            | Easee, Zaptec                                      |
|                 | Installer mode with PIN, diagnostics export, reports download                                                                                        | Easee, Hypervolt                                   |
|                 | Home‑charging reimbursement (company car)                                                                                                            | Monta, Ohme                                        |

### 1.4 BLE protocol patterns observed

There is no public standard for EV‑charger BLE. Every vendor defines a **custom 128‑bit GATT service**, but the shapes converge:

| Concern        | Common pattern                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service layout | One "control" service with 4–6 characteristics: **auth** (write), **command** (write / write‑without‑response), **status / meter** (notify), **config** (read/write), **fault / log** (notify or read). Example from a published architecture: service `f3a10001-…`, auth `…0002`, session command `…0003`, real‑time meter `…0004` (Notify), fault `…0005`.                                          |
| Authentication | Three families: (a) **OS pairing / bonding** (Wallbox; simple, but ble‑plx cannot drive the bond on Android), (b) **app‑level PIN handshake** (Easee: J‑PAKE with the PIN printed on the unit; wrong PIN → `JPakeError`), (c) **challenge–response with a cloud‑issued token** (charger sends a nonce, phone signs it with a short‑lived token from the backend; also enables offline authorisation). |
| Encryption     | LE Secure Connections (ECDH P‑256) at link layer when bonded; otherwise app‑layer AES with a key derived during the PIN handshake.                                                                                                                                                                                                                                                                    |
| Framing        | Payloads exceed the 20‑byte default ATT MTU, so protocols negotiate MTU (Android up to 517) and/or chunk frames with a sequence header. Easee multiplexes request/reply "channels" over one characteristic.                                                                                                                                                                                           |
| Telemetry      | Status pushed via **notify** at 1–5 s while charging, slower when idle; apps throttle what they forward to the cloud (≥5 s per charger is typical).                                                                                                                                                                                                                                                   |
| Quirks         | Easee only **advertises intermittently** (touch the unit or trigger from the cloud to make it visible). Some chargers omit the CCCD descriptor, so notifications fail on certain host stacks. Reconnect storms after firmware reboot are common; apps use exponential back‑off.                                                                                                                       |

**Design implications:** keep the BLE _transport_ (scan/connect/MTU/notify/reconnect) separate from the _charger protocol_ (UUIDs, auth, encoding), and keep the protocol codec pure TypeScript so it can be unit‑tested without a phone and reused by a simulator.

### 1.5 Platform and store constraints

| Platform             | Requirement                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS                  | `NSBluetoothAlwaysUsageDescription` in Info.plist (review rejects a missing/vague string). `bluetooth-central` background mode + state restoration only if the app must keep the link alive in the background. No location permission needed for BLE. |
| Android 12+ (API 31) | Runtime permissions `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`; declare `BLUETOOTH_SCAN` with `usesPermissionFlags="neverForLocation"` so Play does not treat the app as location‑collecting.                                                             |
| Android 6–11         | `ACCESS_FINE_LOCATION` is required to receive scan results (OS rule, not ours) — the permission prompt must explain why.                                                                                                                              |
| Expo                 | BLE needs native code, so **Expo Go cannot run the app**; use `expo-dev-client` development builds via EAS Build. Same shift the CSMS driver app plans for payments.                                                                                  |
| Store review         | Apps that only work with a physical accessory should ship a **demo / simulator mode** so Apple reviewers can exercise the UI without a charger — this doubles as our dev mock.                                                                        |

### 1.6 Malaysia specifics

- Pricing on screen is `RM` with sen precision (reuse `formatSen`/`formatRM` conventions from CSMS). Timezone `Asia/Kuala_Lumpur`, en‑GB dates.
- TNB's domestic tariff now offers a time‑of‑use option (off‑peak nights and weekends), so **"charge off‑peak" scheduling and a tariff‑aware cost estimate are the two smart features with real money behind them** locally. Solar surplus charging is also relevant given NEM rooftop adoption, but it needs a CT clamp / meter on the charger side.
- Home charger market: ABB Terra AC, Wallbox Pulsar Plus, Tesla Wall Connector, Autel MaxiCharger, Schneider EVlink, BYD wallbox. All are Type 2 AC 7–22 kW; the Voltara unit competes on app experience and service, not raw hardware.

---

## 2. Recommended tech stack

Principle: **same stack as Voltara CSMS** so the two apps look identical, share the design system, and one person can maintain both.

| Layer                           | Choice                                                                                                                            | Why                                                                                                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile app (`apps/home`)        | **Expo SDK 57 + React Native 0.86 + TypeScript**, `expo-router`, TanStack Query, `@supabase/supabase-js`, `expo-secure-store`     | Byte‑for‑byte the CSMS driver app stack, so screens, theme, auth and query patterns port directly. EAS Build/Submit/Update gives OTA fixes to both store apps from one pipeline.                                                                              |
| BLE                             | **`react-native-ble-plx` 3.5.x** with its Expo config plugin, in an **`expo-dev-client` development build**                       | Most complete and best‑maintained RN BLE library: scan, connect, MTU, notify, background mode, iOS state restoration, Android 12 permissions via plugin options. Known gaps (no bonding control, no peripheral mode) do not block a central‑only charger app. |
| Alternative considered          | Flutter + `flutter_blue_plus`                                                                                                     | Marginally more stable BLE plugin ecosystem, but a second language, a second design system and no code sharing with CSMS. Rejected for consistency.                                                                                                           |
| Admin portal (`apps/admin`)     | **Vite + React 18 + TypeScript**, react‑router, TanStack Query, `@voltara/ui`                                                     | Identical to the CSMS admin so Voltara staff get one visual language across both portals.                                                                                                                                                                     |
| Design system (`packages/ui`)   | **Port of `@voltara/ui` from CSMS** (tokens, Badge/StatusPill, KPICard, Modal, Toolbar, NavItem, Pagination, SVG charts, Figtree) | Same brand contract (§2–§3 of the CSMS CLAUDE.md): green `#1B512D`, yellow `#FECC3E`, light mode only, inline styles, hand‑rolled charts, no component libraries. Mobile mirrors the tokens in `src/lib/theme.ts` exactly as the CSMS driver app does.        |
| Shared code (`packages/shared`) | Generated DB types, domain enums, **charger protocol codec** (pure TS, no RN/Node imports)                                        | Runs in the phone app, the admin, edge functions and tests.                                                                                                                                                                                                   |
| Backend                         | **Supabase project `Voltara-HomeApp`** (`yvtaokyuxniflztesons`): Postgres 17, Auth, Storage, Realtime, Edge Functions             | Already created; RLS‑first like CSMS. Note it sits in `ap-northeast-2` (Seoul) whereas CSMS is `ap-southeast-1` (Singapore) — see open question 3.                                                                                                            |
| Tooling                         | pnpm workspaces + Turborepo, ESLint flat config, Prettier (single quotes, 100 cols), vitest, GitHub Actions (`ci` + `migrate`)    | Copied from CSMS (ADR‑0001 there).                                                                                                                                                                                                                            |
| Builds & stores                 | EAS Build (dev client, preview, production), EAS Submit, EAS Update                                                               | App name **Voltara Home**, bundle/package `my.voltara.home`, scheme `voltarahome://` (proposed).                                                                                                                                                              |

---

## 3. Proposed architecture

### 3.1 Monorepo layout (mirrors CSMS)

```
Voltara-HomeApp/
├── apps/home            # Expo app — Voltara Home (BLE + Supabase)
├── apps/admin           # Vite + React staff portal (fleet monitoring, admin)
├── packages/ui          # Voltara design system (ported from CSMS)
├── packages/shared      # DB types, enums, charger protocol codec, format helpers
├── supabase/            # config.toml, migrations/, functions/, seed.sql
├── docs/                # this study, ADRs
└── .github/workflows    # ci, migrate
```

### 3.2 Mobile app — BLE layer

```
apps/home/src/
├── ble/
│   ├── transport.ts        # BleTransport: permissions, adapter state, scan, connect,
│   │                       # MTU, discover, read/write/notify, reconnect with back-off
│   ├── protocol.ts         # ChargerProtocol interface: authenticate(), readStatus(),
│   │                       # subscribeStatus(), setMaxCurrent(), start(), stop(), …
│   ├── adapters/
│   │   ├── voltara-v1.ts   # real charger — GATT UUIDs + framing filled in once the
│   │   │                   # firmware spec is known (currently placeholders)
│   │   └── mock.ts         # in-memory simulated charger for dev, tests and App Review
│   ├── codec/              # pure TS encode/decode (lives in packages/shared, re-exported)
│   └── useCharger.ts       # state machine: idle → scanning → connecting → authenticating
│                           # → ready → (disconnected | error); exposes status + commands
├── features/
│   ├── onboarding/         # scan QR / enter serial → pair → claim → name charger
│   ├── charger/            # live dashboard, controls, settings
│   ├── sessions/           # history, costs
│   └── profile/
└── lib/                    # supabase, auth, query, theme (tokens mirror @voltara/ui), ui kit
```

Rules carried from CSMS: `supabase.from()` only in a feature's `api.ts`; screens never touch BLE directly, they use `useCharger()`; no service‑role key in the bundle; sentence case, no exclamation marks.

### 3.3 Data model (first cut, single‑tenant, owner‑scoped RLS)

| Table               | Purpose                                                                                                                                                                 | Access                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `profiles`          | one row per `auth.users`; display name, phone                                                                                                                           | owner read/write own                                                           |
| `charger_models`    | SKU, rated kW/A, phases, BLE service UUID set, protocol version                                                                                                         | public read; staff write                                                       |
| `chargers`          | serial (unique), model, firmware, BLE identity, `owner_user_id`, name, claimed_at, last_seen_at, last_status                                                            | owner + household members read; owner updates name/settings; **claim via RPC** |
| `charger_members`   | household / guest access (`owner`, `member`, `guest`)                                                                                                                   | owner manages                                                                  |
| `charger_settings`  | desired vs applied config (max current, schedule, LED, lock) with `applied_at`, so the app can reconcile when it next connects                                          | owner/member                                                                   |
| `charger_readings`  | telemetry samples forwarded by the phone (state, kW, A per phase, V, kWh total) — **monthly partitions + retention from day one** (CSMS §7)                             | owner read; insert via RPC                                                     |
| `charging_sessions` | derived sessions: start/end, kWh, duration, cost estimate, tariff snapshot                                                                                              | owner read                                                                     |
| `charger_events`    | faults, firmware changes, connection events                                                                                                                             | owner read; staff read all                                                     |
| `tariffs`           | per‑user electricity tariff (flat / ToU) for cost estimates                                                                                                             | owner                                                                          |
| `staff`             | Voltara employees with `role` (`admin`, `support`, `viewer`); injected into the JWT as `app_metadata.staff_role` by a custom access‑token hook (same mechanism as CSMS) | service‑role writes                                                            |
| `firmware_releases` | version, model, notes, file in Storage, rollout flag                                                                                                                    | staff                                                                          |
| `support_tickets`   | owner‑raised issues with charger context                                                                                                                                | owner + staff                                                                  |
| `audit_log`         | staff actions                                                                                                                                                           | staff admin                                                                    |

Everything the phone writes goes through `security definer` RPCs (`claim_charger(serial, proof)`, `ingest_readings(charger_id, rows[])`, `close_session(...)`) that validate ownership, exactly like the `driver_*` functions in CSMS.

### 3.4 Admin portal (staff only)

Screens for the first cut: **Overview** (KPIs: chargers onboarded, online in last 24 h, charging now, faults), **Chargers** (fleet table with search/filters → detail page: owner, firmware, last readings chart, events, settings), **Owners**, **Models & firmware**, **Support**, **Team**. Later: live map, OTA rollout management, exports.

### 3.5 Cloud sync and the later Wi‑Fi path

- While the app is connected over BLE it forwards throttled readings and session boundaries to Supabase; the admin portal shows "last seen" and the latest state.
- When the charger gains its own Wi‑Fi/OCPP path, the same tables accept rows from a gateway writer (or from the CSMS gateway via a service‑role bridge). `chargers.serial` is the stable join key between the two products.

---

## 4. Phase 0 build plan (what gets built first)

1. **Scaffold** — monorepo, CI, Prettier/ESLint, Turborepo, `packages/ui` port, `packages/shared`.
2. **Supabase** — migrations for §3.3, RLS, staff JWT hook, RPCs, partitioned readings, generated types.
3. **Mobile BLE infrastructure** — permissions flow (iOS/Android), transport, protocol interface, mock adapter, `useCharger()` state machine, a dev‑only **GATT explorer** screen (list services/characteristics, read, subscribe, write hex) to reverse‑engineer or verify the real charger on the bench, onboarding flow (serial → pair → claim), live status screen driven by the mock.
4. **Admin portal** — login (staff), overview, chargers list + detail, owners, team.
5. **EAS** — `eas.json` with development / preview / production profiles; first dev‑client builds for Android and iOS.

Deliberately deferred: schedules, tariffs/cost engine, solar, load balancing, OTA, Wi‑Fi provisioning UI, push notifications, white‑label.

---

## 5. Decisions (answered 5 Oct 2026)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Charger protocol | **HiCi** wallbox (Wi‑Fi + Bluetooth, no OCPP); other brands may follow → driver/adapter pattern, HiCi protocol assumed until bench capture (`docs/hici-ble-protocol.md`) |
| 2 | Tenancy | **Single tenant, Voltara only** |
| 3 | Supabase region | **Keep Seoul** (`yvtaokyuxniflztesons`) |
| 4 | Accounts | **Separate** from the CSMS driver app |
| 5 | Portal users | Voltara staff **plus installer and dealer roles** so they can commission units on site (circuit rating, phase mode) |
| 6 | Design system | **Copy** `@voltara/ui` (ADR‑0002) |
| 7 | Homeowner auth | **Email magic link**; dev builds skip it with seeded password accounts |
| 8 | Expo / EAS | **No account yet** — `eas.json` is ready; `eas build --profile development` is the first step to run BLE on a phone |

## 6. Sources

- Wallbox: [Connect via Bluetooth for the first time](https://support.wallbox.com/en/knowledge-base/connecting-to-your-charger-via-bluetooth-for-the-first-time/) · [Connect to Wi‑Fi with the app](https://support.wallbox.com/en/knowledge-base/how-to-connect-your-charger-to-the-wi-fi-with-the-mywallbox-app/) · [Wallbox app](https://wallbox.com/en/wallbox-app) · [Phase optimisation / solar charging](https://support.wallbox.com/en/knowledge-base/phase-optimisation-solar-charging-wallbox-app)
- Easee: [App overview](https://support.easee.com/hc/en-gb/articles/4413162770705) · [easee-ble (open‑source BLE protocol)](https://github.com/parrel/easee-ble) · [ha-easee-ble](https://github.com/parrel/ha-easee-ble) · [Home Assistant community thread](https://community.home-assistant.io/t/easee-ev-charger-ble-integration/1024958)
- Zaptec: [Zaptec app](https://www.zaptec.com/en-uk/zaptec-app) · [OCPP within Zaptec](https://docs.zaptec.com/docs/ocpp-within-zaptec) · [Setup guide (ev.energy)](https://www.ev.energy/en-us/support/setup-guides/zaptec)
- Ohme: [Ohme app](https://ohme-ev.com/ohme-app/) · [Your first charge](https://ohme-ev.com/support/your-first-charge/)
- Hypervolt: [Home 3 review](https://www.smarthomecharge.co.uk/reviews/hypervolt-home-3-review/) · [Hypervolt vs Ohme](https://www.smarthomecharge.co.uk/features/hypervolt-home-3-pro-vs-ohme-home-pro/)
- BLE architecture: [Bluetooth‑based EV charger authorization (Entrans)](https://www.entrans.ai/blog/bluetooth-based-ev-charger-authorization) · [GATT services & characteristics (Novel Bits)](https://novelbits.io/bluetooth-gatt-services-characteristics/) · [spinev-ble](https://github.com/Dr-Blank/spinev-ble) · [Reverse engineering BLE devices](https://reverse-engineering-ble-devices.readthedocs.io/en/latest/)
- Libraries: [react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx) · [Native vs cross‑platform BLE (Novel Bits)](https://novelbits.io/native-vs-cross-platform-bluetooth-low-energy-mobile-app-platforms/) · [Comparing RN BLE libraries (LogRocket)](https://blog.logrocket.com/comparing-react-native-ble-libraries/) · [BLE‑powered Expo app (Expo blog)](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app)
- Platform: [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)
- Malaysia: [EV charger Malaysia 2026 guide (Trexon)](https://trexon.my/blog/ev-charger-malaysia-2026-home-commercial-guide)
