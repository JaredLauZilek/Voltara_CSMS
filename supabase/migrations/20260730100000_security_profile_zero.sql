-- ============================================================================
-- Security profile 0: identity-only connections (no Basic Auth).
--
-- The OCPP security whitepaper's profiles start at 1, but the de facto
-- standard among incumbent CSMSs in this region is lower: the charger presents
-- its ID in the URL and is trusted — no credentials at all. Refusing that mode
-- outright means refusing the installed base, so it becomes the bottom rung of
-- an explicit per-charger ladder:
--
--   0  identity only, TLS optional  — commissioning / legacy parity
--   1  Basic Auth, TLS optional
--   2  Basic Auth over TLS          — the default, and the floor for
--                                     production revenue chargers
--   3  mTLS                         — future
--
-- The trade is stated plainly: at profile 0 anyone who learns a charger ID can
-- impersonate that charger. Acceptable on a bench; not for billing.
-- ============================================================================

alter table public.charge_points
  drop constraint charge_points_security_profile_check;

alter table public.charge_points
  add constraint charge_points_security_profile_check
  check (security_profile in (0, 1, 2, 3));

comment on column public.charge_points.security_profile is
  '0 = identity only (no auth), 1 = Basic Auth over ws://, 2 = Basic Auth over TLS (default), 3 = mTLS (future). Enforced by the gateway at the handshake.';
