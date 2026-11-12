# @voltara/ui — Package Contract

The Voltara design system, ported verbatim from Voltara CSMS `packages/ui` (itself ported from the accounting dashboard). Root CLAUDE.md §2–§3 defines the visual identity; this file governs the package itself.

## Rules

1. **No data layer.** This package never imports supabase, TanStack Query, or routers. Data-touching behaviour is injected via props.
2. **Peer deps only:** react, react-dom, lucide-react. Nothing else without an ADR.
3. **Tokens are the single source of truth.** `C` / `RADIUS` / `SPACE` / `STATUS_COLORS` in `src/tokens.ts`. New statuses map onto the existing six colour families — never invent new pairs.
4. **Charts are hand-rolled SVG.** No chart libraries. Interaction idiom: hover updates a readout strip in the card header — no floating tooltips.
5. **Inline styles everywhere**, values from tokens. The only stylesheet is `styles.css`.
6. **Divergence protocol:** this is a copy of the CSMS package (decision: ADR-0002). Visual changes (tokens, radii, spacing, component look) must be made in both repos deliberately and noted in each root CLAUDE.md §2–§3.
