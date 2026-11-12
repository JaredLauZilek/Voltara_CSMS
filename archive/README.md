# archive/

Parked code kept for later — **not part of this monorepo's build**. Nothing in
here is a pnpm workspace, and it is excluded from Prettier, ESLint and the
gateway's Docker context. Never import from it; read it for reference, and
copy what you need into the real workspaces when its phase comes.

## home-app/ — Voltara Home

The homeowner app for Voltara's AC home charger, built as a separate repo
before the decision to make one app instead of two. Kept here so the original
repo could be deleted; to be merged into this platform after the CSMS work
(see `docs/roadmap.md`, Phase 7+ "home charging").

- **Source:** `github.com/JaredLauZilek/Voltara-HomeApp`, branch `main`,
  commit `54233d0` (9 Oct 2026), imported 12 Nov 2026. The repo's only other
  commit was its initial commit, so these files are its complete content
  (git history not kept).
- **What is in it:** `apps/home` (Expo app: onboarding, live charger over
  Bluetooth LE, history, installer mode), `apps/admin` (staff / dealer
  portal), `packages/ui` and `packages/shared` (incl. the HiCi charger
  protocol codecs and a simulator), `supabase/` (its own schema — 6
  migrations, seed, edge functions), and `docs/` (home-charging market study,
  HiCi BLE protocol checklist, ADRs).
- **Changed on import:** its three `CLAUDE.md` files were renamed
  `CLAUDE.archived.md`, so Claude Code sessions in this repo do not load the
  home app's contract as live instructions. Their content is unchanged; links
  to `CLAUDE.md` inside it refer to those files. Nothing else was modified.
- **Not carried over:** its hosted Supabase dev project (Seoul) and any data
  in it. The schema is in `home-app/supabase/migrations`; the data is not.
