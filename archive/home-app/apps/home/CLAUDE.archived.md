# @voltara/home — Package Contract

Extends the root CLAUDE.md (§3 is the architecture). This is the **Voltara Home** app (Expo / React Native, iOS + Android): a homeowner's window onto one or more chargers over Bluetooth, plus installer mode.

## Rules

1. **Screens are thin.** `app/` files render; `useCharger()` from `@/ble` owns the link; `src/features/*/hooks.ts` owns data; `api.ts` is the only file that calls Supabase. A screen that imports `react-native-ble-plx` or `supabase` is wrong.
2. **Every brand goes through a driver.** `src/ble/drivers/<protocol>.ts` adapts a brand to `ChargerLink`; its byte layouts live in `packages/shared/src/charger/<brand>/` with vitest coverage. `drivers/index.ts` is the only registry. The simulator (`mock`) is a first-class driver and must keep working in Expo Go, on web and for App Review.
3. **Connection phases are explicit** (`idle → scanning → connecting → authenticating → ready`, plus `disconnected | error | unavailable`). Surface the phase with `PHASE_LABEL` / `PHASE_PILL`; never show a spinner with no words.
4. **Telemetry is best-effort and batched.** `useTelemetrySync` samples at ≥5 s (plus every state change), flushes every 15 s through `ingest_readings`, and opens/closes `charging_sessions` at the Charging boundaries. It never blocks the UI and never throws into a screen.
5. **Settings flow one way.** Desired settings are rows in `charger_settings`; `useApplySettings` pushes them when a link is ready and acknowledges with `report_settings_applied`. Screens change settings by mutating the row, not by calling the link directly (Start/Stop are the exception — they are commands, not settings).
6. **The claim code is the BLE PIN.** It is stored only in the keychain (`lib/pins.ts`) at claim time. Never log it, never send it anywhere but the charger.
7. **Branding:** `src/lib/theme.ts` mirrors `@voltara/ui` tokens byte-for-byte. Light mode only. `src/lib/ui.tsx` is the kit; extend it rather than styling ad hoc.
8. **Env:** only `EXPO_PUBLIC_*`. Dev conveniences (`EXPO_PUBLIC_DEV_AUTO_LOGIN_*`, the seeded-account buttons, Profile → dev tools) are gated by `__DEV__` and perform real sign-ins.
9. **Native changes need a dev build.** Adding a native module or changing `app.json` plugins means `eas build --profile development` again; Expo Go cannot load `react-native-ble-plx`. Run `npx expo-doctor` before committing config changes.
10. Same voice as the rest of Voltara: sentence case, no exclamation marks, en-GB dates, `kWh` / `kW` / `A` with a space.
