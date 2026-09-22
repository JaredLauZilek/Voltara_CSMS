# @voltara/driver — Package Contract

Extends the root CLAUDE.md. This is the **Voltara-branded driver app** (Expo / React Native), multi-tenant at runtime. Design: `docs/phase4-driver-app-design.md`.

## Rules

1. **A driver is not a tenant member.** The JWT carries no `tenant_id`; the app never assumes one. Cross-tenant reads (discovery, site context) and every write that touches a tenant (join, start, stop) go through the `driver_*` SECURITY DEFINER functions. `supabase.from()` appears only in `src/features/*/api.ts`, and only against tables with driver policies (`driver_profiles`, own `id_tags`, own `charging_sessions` / `cdrs` / receipt `documents`, own `remote_commands`).
2. **No service-role key, ever.** Only `EXPO_PUBLIC_*` values, which ship in the bundle.
3. **Branding:** Voltara tokens (`@voltara/shared` re-exports none — colours live in `src/lib/theme.ts`, byte-identical to `@voltara/ui` `C`) are the default; a site's `theme` from `driver_site_context()` overrides them through `ThemeProvider` for that site's screens only. Never fork per tenant.
4. **Money on screen comes from `@voltara/shared` `billing.priceSession`** with the session's frozen snapshot — the app must show the same sen the CDR will.
5. **Realtime:** subscribe only to `site:{location_id}` public channels (connector status). Never the tenant channel.
6. **Navigation:** `expo-router`; every screen is a URL so magic links and QR codes deep-link (`voltara://…`).
7. **Native modules must be in Expo Go's bundle** until the phase ends with a development build. Adding one that is not (payments, background location) means switching to `expo-dev-client`.
8. Same voice and rules as the admin app: sentence case, `RM` via `formatSen`, en-GB dates, no exclamation marks.
