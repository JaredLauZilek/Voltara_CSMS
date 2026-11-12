# Voltara Home

Homeowner app for Voltara's AC home charger (Bluetooth-first) and the staff / dealer portal behind it, by [Voltara](https://voltara.com.my). Sibling of [Voltara CSMS](https://github.com/JaredLauZilek/Voltara_CSMS); same design system, same engineering contract.

| Workspace         | What                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| `apps/home`       | Expo app (iOS + Android) — onboarding, live charger over BLE, history, installer mode |
| `apps/admin`      | Staff / dealer portal — Vite + React, Voltara design system                           |
| `packages/ui`     | Voltara design system (tokens, components, SVG charts)                                |
| `packages/shared` | DB types, domain enums, charger protocol codecs, simulator                            |
| `supabase/`       | Migrations, seed, edge functions — Supabase is the system of record                   |

Start with [docs/dev-setup.md](docs/dev-setup.md). The engineering contract is [CLAUDE.md](CLAUDE.md); the market study and architecture are in [docs/home-charging-study.md](docs/home-charging-study.md); the bench procedure for the charger protocol is [docs/hici-ble-protocol.md](docs/hici-ble-protocol.md).
