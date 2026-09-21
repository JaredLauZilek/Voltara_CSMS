# ADR-0006 — Tariffs and CDRs are OCPI 2.2.1-shaped

**Status:** accepted 21 Sep 2026 · **Decides for:** Phase 3 schema and the cost engine.

## Context

We need a tariff model flexible enough for every operator type a white-label CSMS will meet (per-kWh, per-minute, session fee, idle fee with grace, time-of-use, caps, group pricing) and a billing record that survives audits and roaming. The industry standard for both is OCPI 2.2.1: tariffs as elements of price components (ENERGY · TIME · FLAT · PARKING_TIME) with restrictions; CDRs as immutable itemised records corrected only by credit CDRs. AMPECO, Driivz and Monta all map onto it; eRoaming (Phase 7) requires it.

Alternative considered: a bespoke "rate card" (per_kwh, per_min, session_fee, idle_fee columns). Simpler to start, but it cannot express ToU, kWh tiers, or duration-dependent rates without redesign, and roaming would need a translation layer that loses information.

## Decision

- `tariff_versions.elements` is a jsonb array of OCPI `TariffElement`s (validated by a zod schema in `@voltara/shared`); `min_price`/`max_price`, `tax_included`, `currency` follow OCPI naming.
- `cdrs` carry OCPI's totals (`total_energy_cost`, `total_time_cost`, `total_parking_cost`, `total_fixed_cost`, `total_cost`), `charging_periods` with dimensions, `credit` + `credit_reference_id`, `invoice_reference_id`, and are **never updated or deleted** (no UPDATE/DELETE policies for anyone; corrections are new credit CDRs).
- Money is stored as integer **sen**; the OCPI `Price {excl_vat, incl_vat}` pair becomes `amount_excl_tax`, `tax_amount`, `amount_incl_tax` per line and per total, because SST's applicability is unresolved and the rate must be re-rateable.
- Group pricing is _assignment_-level (which tariff applies to which driver group at which scope), not tariff-level — Monta's price groups on top of OCPI tariffs.
- The evaluation engine is a pure function in `@voltara/shared` with property tests and golden cases; the gateway and the admin's price preview call the same code.

## Consequences

- The tariff editor has to make OCPI elements approachable (presets: "per kWh", "per kWh + idle", "peak/off-peak") — the UI hides the structure, the data keeps it.
- Roaming later is a serialiser over existing rows.
- Every price shown anywhere comes from one engine, so a receipt, the app, and the CDR can never disagree.
