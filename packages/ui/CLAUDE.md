# @voltara/ui — Package Contract

The Voltara design system, ported verbatim from the accounting dashboard (`github.com/JaredLauZilek/voltara`, `src/shared/`). Root CLAUDE.md §2–§3 defines the visual identity; this file governs the package itself.

## Rules

1. **No data layer.** This package never imports supabase, TanStack Query, or routers. Data-touching behaviour is injected via props — `AttachmentsField` takes an `AttachmentStorage` callback object; keep that pattern for any future component that needs I/O.
2. **Peer deps only:** react, react-dom, lucide-react. Nothing else without an ADR.
3. **Tokens are the single source of truth.** `C` / `RADIUS` / `SPACE` / `STATUS_COLORS` in `src/tokens.ts`. New statuses map onto the existing six colour families — never invent new pairs.
4. **Charts are hand-rolled SVG.** No chart libraries. Interaction idiom: hover updates a readout strip in the card header — no floating tooltips.
5. **Inline styles everywhere**, values from tokens. The only stylesheet is `styles.css` (reset, Figtree, scrollbars, responsive attribute-selector overrides).
6. **Divergence protocol:** if this package and the accounting app's `src/shared/` drift, that's expected (they are separate products since 2026-07), but _visual_ changes (tokens, radii, spacing, component look) should be deliberate and noted in the root CLAUDE.md §2–§3 in the same PR.
7. Components must keep working inside the future ThemeProvider (Phase 6): read colours from tokens at render time; no module-level style caching of token values in new code.
