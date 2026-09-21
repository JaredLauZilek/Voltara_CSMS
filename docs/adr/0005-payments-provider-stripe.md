# ADR-0005 — Payments provider: Stripe (replacing the Curlec plan)

**Status:** accepted 21 Sep 2026 · **Decides for:** Phase 5, and the payer/provider fields Phase 3 stores.

## Context

The July plan named Curlec (Razorpay) as the driver-money provider because of DuitNow QR / TNG / Boost coverage, with Stripe Billing only for Voltara's own SaaS fees. On 21 Sep the founder directed that **Stripe** be the payment gateway for the platform.

What Stripe offers in Malaysia today: cards (3DS enforced), FPX, GrabPay; Connect for platforms (cross-border application fees prohibited; the platform-owns-liability model in preview via Support); pricing about 3% + RM1 per transaction. Not offered: DuitNow QR, Touch 'n Go, Boost, ShopeePay, BNPL.

## Decision

1. Stripe is the payment provider for driver money (Phase 5) and for SaaS billing (Stripe Billing).
2. **Per-tenant merchant-of-record** remains the target: each tenant connects its own Stripe account via Connect; Voltara never holds customer funds, which keeps us outside BNM payment-aggregator licensing (unchanged from the July plan).
3. The data model keeps the provider **abstract**: `tenants.payment_provider`, `billing_accounts.provider_customer_id`, `payments.provider_payment_id` — Stripe-specific ids live in those columns, never in table or column names.
4. The Noodoe-style "QR on the charger → pay without an app" flow is delivered as a **Stripe Checkout link** (cards / FPX / GrabPay) rather than DuitNow QR.

## Consequences

- Loses DuitNow QR and e-wallet reach (TNG, Boost) — significant for ad-hoc condo visitors. If pilots show this matters, a second provider is a column value, not a rewrite (point 3).
- Requires a Stripe Support conversation before Phase 5 about the Connect liability model available to a Malaysian platform.
- Tax/legal gate from the original plan (SST + BNM opinion before go-live) is unchanged.
