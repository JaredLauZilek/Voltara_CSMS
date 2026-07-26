# Voltara CSMS

White-label OCPP charging station management platform by [Voltara](https://voltara.com.my) — runs Voltara's own CPO / condo / home-charging operations (tenant #1) and is sold as SaaS to Malaysian operators.

| Workspace           | What                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `apps/admin`        | Operator/JMB admin portal — Vite + React, Voltara design system       |
| `apps/ocpp-gateway` | Always-on OCPP 1.6J central system — Node 22, Fly.io `sin`            |
| `packages/ui`       | Voltara design system (tokens, components, SVG charts)                |
| `packages/shared`   | Generated DB types, OCPP vocabulary, domain enums, realtime contracts |
| `supabase/`         | Migrations, seed, edge functions — Supabase is the system of record   |
| `tests/integration` | Simulator-driven gateway suite + RLS isolation tests                  |

Start with [docs/dev-setup.md](docs/dev-setup.md). The engineering contract lives in [CLAUDE.md](CLAUDE.md); decisions in [docs/adr/](docs/adr/).
