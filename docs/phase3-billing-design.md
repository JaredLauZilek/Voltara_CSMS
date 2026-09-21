# Phase 3 — Tariffs, billing, CDRs, exports: design

Status: **proposed** (21 Sep 2026). Companion ADRs: [0005 payments provider](adr/0005-payments-provider-stripe.md), [0006 tariff & CDR model](adr/0006-ocpi-shaped-tariffs-and-cdrs.md). Durable rules move to CLAUDE.md when the phase lands; this document is the reasoning and the build order.

## 1. What Phase 3 delivers

Every completed session becomes a **priced, immutable record** (a CDR) computed from a **frozen tariff snapshot**, attributed to a **payer** (a driver group, a whitelisted resident, an ad-hoc card user, or a corporate account), and rolled up into **documents** (receipt · invoice) and **exports** (CSV/XLSX · PDF) that a JMB, a workplace, or Voltara can bill from **before any payment gateway exists**. Phase 5 (Stripe) only collects what Phase 3 computed.

The guidance this design answers (Jared, 21 Sep): every condo model must be possible and selectable per site; drivers are identified by whitelist (residents, discounted) or card (public, full price); every pricing shape (per-kWh, per-minute, session fee, idle) must be available to every tenant because the product is white-label; receipts for individuals and B2B invoices; SST always ready; JMB exports as spreadsheet and PDF; Stripe as the payment gateway; build the skeleton of everything and leave room to grow.

## 2. What the market does (study)

| Platform                                                     | Model worth copying                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OCPI 2.2.1** (the standard AMPECO/Driivz/Monta all map to) | Tariff = list of _elements_, each a set of _price components_ (ENERGY · TIME · FLAT · PARKING_TIME, with `step_size`) plus _restrictions_ (time of day, day of week, date range, min/max kWh, min/max power, duration). First matching element per dimension wins. `min_price`/`max_price` caps. CDR = immutable, itemised (`total_energy_cost`, `total_time_cost`, `total_parking_cost`, `total_fixed_cost`), `charging_periods` with dimensions, corrections by **credit CDR**, `invoice_reference_id`. | [mod_tariffs](https://github.com/ocpi/ocpi/blob/master/mod_tariffs.asciidoc), [mod_cdrs](https://github.com/ocpi/ocpi/blob/master/mod_cdrs.asciidoc)                                                                                                  |
| **AMPECO**                                                   | Tariff groups by _customer type_ (individual / partner / user group / ad-hoc) on the same charger; idle fee with grace; ToU; per-component tax on receipts; B2B partners issue documents under their own name; **revenue share** to site hosts (% by AC/DC, fixed monthly fees, electricity cost deduction) with monthly settlement reports; **corporate billing** (pool cap, per-driver cap, one monthly invoice); nine billing models coexisting on one network.                                        | [plans & tariffs](https://www.ampeco.com/ev-charging-platform/plans-and-tariffs/), [billing models](https://www.ampeco.com/blog/ev-charging-billing-models/), [B2B & site hosts](https://www.ampeco.com/ev-charging-platform/b2b-partner-management/) |
| **Monta**                                                    | _Price groups_: public / member / fleet / partner / sponsored, several active on one charger at once; sponsored = employer reimburses home charging.                                                                                                                                                                                                                                                                                                                                                      | [price groups](https://docs.partner-api.monta.com/docs/price-groups), [pricing types](https://monta.com/help/en_US/monta-hub-charge-points-pricing-access/understanding-monta-pricing-types)                                                          |
| **Stripe (Malaysia)**                                        | Cards (3DS), **FPX**, **GrabPay**. _Not_ DuitNow QR / TNG / Boost. Connect available; cross-border application fees prohibited; the "platform owns loss liability" model is in preview via Support. Fees ≈ 3% + RM1.                                                                                                                                                                                                                                                                                      | [payments in MY](https://stripe.com/resources/more/payments-in-malaysia), [Connect MY](https://support.stripe.com/questions/connect-availability-for-businesses-located-in-malaysia)                                                                  |
| **Regulatory**                                               | Service tax 8% general rate since Mar 2024 (6% for some groups); **EV charging's classification is still unresolved** — keep the rate configurable and re-rateable. **LHDN MyInvois e-invoicing** is mandatory by turnover band (RM1m–5m since 1 Jan 2026, relaxation to end-2027; < RM1m exempt); up to 55 fields incl. buyer/seller TIN and SST no.; consolidated e-invoices for B2C. Any invoice we produce must carry the MyInvois fields so a tenant can submit it.                                  | [SST guide](https://www.bdo.my/en-gb/insights/tax/malaysia-latest-indirect-tax-updates), [MyInvois phases](https://www.cleartax.com/my/en/different-phases-implementation-timelines-einvoicing-malaysia)                                              |

Conclusion: model tariffs and CDRs **OCPI-shaped** (ADR-0006) so roaming (Phase 7) is a serialiser, not a rewrite; copy Monta's price-group idea as **driver groups**; copy AMPECO's site-host revenue share and corporate billing as first-class concepts from day one, even where Phase 3 only stores them.

## 3. Concepts

```
tenant
 ├── tariffs ──< tariff_versions (immutable; elements[] jsonb, OCPI-shaped)
 ├── tariff_assignments  (tariff → scope: tenant | location | charge point | connector,
 │                         for: driver_group | ad-hoc | default; validity window; priority)
 ├── driver_groups       (residents of Vantage · staff · fleet X · everyone)
 │     └── driver_group_members (id_tag | driver account | corporate account)
 ├── billing_accounts    (the PAYER: individual · corporate · site host/JMB;
 │                         billing model; MyInvois identity: TIN, SST no., address)
 ├── charging_sessions.tariff_snapshot  ← frozen at StartTransaction (already in schema)
 ├── cdrs                (immutable; one per completed session; credit CDRs for corrections)
 ├── documents           (receipt | invoice | credit note | settlement statement;
 │                         numbered per tenant series; lines[]; PDF path; MyInvois status)
 ├── site_host_agreements (location → revenue share %, fixed fees, electricity cost basis)
 └── tax_profiles        (SST rate + code per tenant; applied per component; re-rateable)
```

**Resolution at StartTransaction** (gateway, one query): payer ← id_tag/driver → billing account (or ad-hoc); driver groups the payer belongs to; assignments matching connector › charge point › location › tenant, for those groups first, then ad-hoc/default; highest priority wins; the whole resolved version + the resolving inputs are written to `tariff_snapshot`. A tariff edit after that instant cannot touch the running session.

**Cost engine at StopTransaction** (pure function in `@voltara/shared`, no I/O): `(session, meter periods, snapshot, tax profile) → { lines[], totals }`. Dimensions per OCPI: ENERGY (Wh, step), TIME (charging seconds, step), PARKING_TIME (idle seconds after charging ends minus grace, step), FLAT (once). Restrictions evaluated per charging period so a session crossing 14:00 pays peak after 14:00 only. Caps `min_price`/`max_price`. Tax computed **per line** and stored **separately** (`amount_excl_tax`, `tax_rate`, `tax_amount`, `amount_incl_tax`) — never folded in. Money is integer **sen**; rounding half-up per line, total = sum of lines (so a receipt always adds up).

**Idle tracking**: from Phase 3 every session records `idle_seconds` (Finishing → cable removed), whether or not the tariff charges for it. Condo sites need the number before they decide to charge for it.

## 4. The models an operator can choose (per site, not per tenant)

All are configurations of the same tables — nothing is hardcoded:

| Situation                                                                                                    | Configuration                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Condo A — JMB is the customer**: Voltara bills the JMB monthly for all energy; JMB recovers from residents | billing account = JMB (corporate, post-paid monthly); every session at the location attributed to it; monthly _invoice_ + per-session _statement_ export for the JMB to recharge residents                            |
| **Condo B — residents billed individually**: JMB wants each resident invoiced                                | driver group "residents" (whitelist by RFID/app), each resident a billing account (individual, post-paid or card-on-file); monthly invoice per resident; JMB gets a _settlement statement_ if there's a revenue share |
| **Condo C — residents cheap, visitors full price**                                                           | two assignments on the same chargers: group "residents" → member tariff; ad-hoc → public tariff; visitors pay by card (Phase 5) or QR guest checkout                                                                  |
| **Workplace — sponsored**                                                                                    | group "staff" → tariff RM0 or subsidised, billing account = employer (corporate); optional per-driver monthly cap                                                                                                     |
| **Public CPO**                                                                                               | ad-hoc → public tariff with ToU + idle fee; payer = card user; receipt per session                                                                                                                                    |
| **Site host revenue share**                                                                                  | `site_host_agreements` on the location: % of net revenue (AC/DC separately), fixed monthly fee, electricity cost deducted at a stored RM/kWh; monthly settlement statement                                            |
| **Free / open access**                                                                                       | tariff with no components; CDRs still produced at RM0 for reporting                                                                                                                                                   |

Billing models (AMPECO's nine) are a field on the billing account — `postpaid_card`, `preauth`, `wallet`, `postpaid_invoice`, `corporate`, `subscription`, `voucher`, `open` — Phase 3 stores and reports on them; Phase 5 makes the money move.

## 5. Documents

| Document                 | For                                                               | Contents                                                                                                                        | Numbering                     |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Receipt**              | any single session (driver, ad-hoc)                               | itemised lines with per-line tax, tariff text, session facts, charger/site, payment method (Phase 5)                            | `R-{tenant}-{YYYYMM}-{seq}`   |
| **Invoice**              | billing account for a period (individual monthly, corporate, JMB) | sessions listed or summarised, tax summary by rate, MyInvois fields (seller/buyer TIN, SST no., classification codes), due date | `INV-{tenant}-{YYYYMM}-{seq}` |
| **Credit note**          | reverses/corrects an invoice or receipt                           | references original; mirrors a credit CDR                                                                                       | `CN-…`                        |
| **Settlement statement** | site host / JMB with a revenue-share agreement                    | gross, fees, electricity cost, share, amount owed                                                                               | `ST-…`                        |

Rendered with `@react-pdf/renderer` (reused from the accounting app), branded from `tenant_settings` (white-label: the tenant's name and logo, never Voltara's, unless the tenant is Voltara). Every document is also exportable as **CSV/XLSX** of its lines. **MyInvois submission itself is out of scope for Phase 3** — the fields are captured so it's a connector later.

## 6. Exports & reports (admin app)

- **Revenue**: by site / charger / driver group / period; energy, sessions, idle, gross/net/tax. Cards + line chart (existing SVG kit).
- **CDR export**: CSV/XLSX, filterable, one row per CDR with every cost column (the "spreadsheet of charging sessions and transaction records" a JMB asked for).
- **Site statement PDF**: sessions + invoice for a site and period, one click.
- **MEVnet / ST reporting stub**: the regulator's utilisation export shape, filled from CDRs — columns defined now, format confirmed with ST later.

## 7. Webhooks and the canary

- **Canary** (build in Phase 3): a scripted charger runs one session against staging nightly from the integration workflow and asserts a CDR appears with the expected cost. Cheap, and it guards the whole OCPP→CDR path.
- **Webhooks** (skeleton only): `webhooks` + `webhook_deliveries` tables, HMAC signing helper, the `session.completed` event emitted from the CDR writer to an in-process dispatcher. UI to register endpoints deferred until a partner asks.

## 8. Build order (each step ships tests and is usable on its own)

1. **Schema + types** — tariffs/versions/assignments, driver_groups(+members), billing_accounts, tax_profiles, cdrs, documents, site_host_agreements, webhooks. RLS per §5. Migration + `gen:types` + RLS tests.
2. **Cost engine** in `@voltara/shared/billing` — OCPI evaluation, sen arithmetic, tax per line, caps. Property tests + golden cases from Voltara's real tariffs (to be supplied).
3. **Gateway** — resolve + snapshot at start; idle tracking; CDR write at stop (same transaction as the session close); `session.completed` event. Integration scenarios: snapshot immutability under a mid-session tariff edit, ToU boundary, idle grace, offline replay, orphaned stop → CDR flagged unbillable.
4. **Admin: tariffs** — list/editor with a live price preview ("a 40-minute, 18 kWh session at 15:30 costs RM …"), versions, assignments per site/charger, driver groups, billing accounts.
5. **Admin: CDRs & reports** — CDR list/detail, revenue report, CSV/XLSX export, receipt PDF, invoice run (period → documents), settlement statement.
6. **Canary + webhook skeleton.**

Golden-case tests are the acceptance test for step 2; step 5's invoice run producing a JMB pack from staging data is the acceptance test for the phase.

## 9. Assumptions made where guidance was "don't know yet"

- SST starts configured at **0% with the code path fully exercised** (rate is a per-tenant setting; changing it re-rates new sessions only; historic documents keep their stored rates). Flip to 8% when the position is confirmed.
- Display is **tax-inclusive** on receipts (Malaysian retail convention) and **tax-exclusive with a tax summary** on invoices (B2B convention). Both store the same three numbers per line.
- Rounding: per line to the sen, half-up; totals are sums of rounded lines.
- Stripe is the provider (ADR-0005); DuitNow QR / TNG are not available through it, so the "no-app QR guest checkout" from the original plan becomes a Stripe Checkout link (cards / FPX / GrabPay). Revisit if DuitNow QR proves essential in pilots.
- Per-tenant merchant-of-record stays the target (Stripe Connect); the provider abstraction in the schema (`payment_provider` on the tenant, provider ids on accounts/payments) keeps a second provider possible.
