# Phase 4 — Driver app: design

Status: **in progress** (22 Sep 2026). Companion contract: `apps/driver/CLAUDE.md`. Roadmap: [roadmap.md](roadmap.md) Phase 4.

## 1. What Phase 4 delivers

The **Voltara-branded driver app** on iOS and Android — Voltara's own consumer product for its CPO, condo and home-charging business — built so every white-label tenant's chargers appear in it from day one under that tenant's branding, and so a tenant can later graduate to its own store listing from the same codebase (Apple 4.3(a)).

MVP scope: sign in by email magic link · find chargers (list + map, live availability) · start and stop charging from the phone · live session with kWh, power and running cost · history with receipts · a home-charger owner view. No payments (Phase 5): sessions are billed to the driver's billing account by the Phase 3 machinery, exactly like an RFID session.

## 2. Who a driver is

A driver is a **person with an `auth.users` row and no tenant membership**. The JWT hook injects nothing for them, so every tenant-scoped policy already denies them — the driver layer only *adds* access, keyed on `auth.uid()`:

| Table | Driver may |
|---|---|
| `driver_profiles` (new) | read/update their own row |
| `id_tags` | read tags where `driver_user_id = auth.uid()` (their virtual tags) |
| `charging_sessions`, `cdrs`, `documents` (receipts) | read rows linked to their tags / accounts |
| `remote_commands` | nothing directly — start/stop go through `driver_start_session()` / `driver_stop_session()` |
| everything else | nothing |

Charger **discovery is cross-tenant** (a driver in Bangsar sees every public charger nearby regardless of operator), so it is a SECURITY DEFINER function returning only what a public directory would: site name, coordinates, connector types/power, live status, the tariff's display text. Never the tenant's internals.

## 3. Identity and billing linkage

- Signing up creates `driver_profiles` and one **virtual ID tag per tenant the driver charges with** (`id_tags.kind = 'virtual'`, `driver_user_id` set), created lazily by `driver_start_session()`. The gateway therefore sees an ordinary tag: authorisation, tariff resolution (driver groups by `driver_user_id` already exist), and the CDR all work unchanged.
- **Joining a site** (QR / code on the charger, or a condo's invite code) binds the driver's tag to that tenant's driver group and billing account — this is how a resident gets the resident price and a monthly invoice. Until Phase 5 an unjoined driver on a public charger is **not started** (no way to pay) unless the tenant's tariff is free; the app says so.
- `charging_sessions.start_source = 'app'` and `auth_method = 'command'` mark app-started sessions.

## 4. Branding at runtime

`driver_site_context()` returns the tenant's `app_name`, logo path and `theme` for whichever site the driver is looking at; the app applies the tenant's colours to that site's screens and Voltara's to everything else. Voltara's tokens (`@voltara/ui` `C`) are the default theme, as in the admin app — never forked.

## 5. Stack (pinned to Expo SDK 57, what Expo Go on the store runs)

`expo ~57`, `expo-router` (file-based navigation, deep links), `expo-secure-store` (session), `expo-location`, `react-native-maps`, `@supabase/supabase-js`, `@tanstack/react-query`, `@voltara/shared` (cost engine for the running cost, realtime contracts, format helpers). No UI kit — the design system is hand-rolled with the same tokens. Magic link deep-link scheme `voltara://`.

## 6. Realtime

The driver subscribes to a **public** broadcast channel per site (`site:{location_id}`) carrying only connector status, not the tenant channel. The gateway publishes `cp_status` to both. RLS on `realtime.messages` allows any authenticated user on `site:*`.

## 7. Review path

Expo Go via `expo start --tunnel` from the codespace throughout the phase (QR → iPhone). At the end: EAS preview build → TestFlight from Voltara's Apple developer account.

## 8. Build order

1. Schema + RLS + RPCs (`driver_profiles`, driver policies, `driver_nearby_chargers`, `driver_site_context`, `driver_join_site`, `driver_start_session`, `driver_stop_session`); gateway publishes to site channels; RLS tests.
2. App scaffold, auth (magic link + paste-code fallback for Mailpit), session persistence.
3. Nearby list + map with live status; charger page; join-by-code.
4. Start/stop; live session screen with running cost from the shared engine; command feedback.
5. History + receipts; profile; home-charger view.
6. EAS preview build → TestFlight.
