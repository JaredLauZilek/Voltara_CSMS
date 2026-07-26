## What

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] New/changed tables: migration committed, RLS policies + `tenant_id` index included, `pnpm gen:types` run
- [ ] New OCPP behaviour: integration scenario added in `tests/integration`
- [ ] Contract change (tokens, architecture rules, tenancy, gateway rules): CLAUDE.md updated in this PR
- [ ] No inline hex, no `supabase.from()` outside `api.ts`, no service-role key near the browser
