## What

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] New/changed tables: migration committed, RLS policies + explicit grants + policy-column indexes included, `pnpm gen:types` run
- [ ] Charger protocol change: only `packages/shared/src/charger/<brand>/` and `apps/home/src/ble/drivers/<brand>.ts` touched, codec tests updated with captured frames
- [ ] Contract change (tokens, architecture rules, roles/RLS, BLE layering): CLAUDE.md updated in this PR
- [ ] No inline hex, no `supabase.from()` outside `api.ts`, no service-role key near a client bundle
