-- ============================================================================
-- Advisor follow-up on the OCPP runtime schema.
--
-- 1. `notify_remote_command()` is a trigger function, but PostgREST exposes
--    every function in `public` as an RPC endpoint. Nothing should be able to
--    call it directly — it would let a signed-in user fire arbitrary
--    pg_notify traffic at the gateways.
-- 2. `charge_point_connections` is service-role-only. RLS with no policies
--    already denies everything, but the blanket grants from
--    20260725000300 make that denial implicit; revoking the grants states it.
-- ============================================================================

revoke execute on function public.notify_remote_command() from anon, authenticated, public;

revoke all on table public.charge_point_connections from anon, authenticated;

comment on table public.charge_point_connections is
  'Live registry of which gateway instance holds each charger socket. Service-role only: written by the gateway, read by the command bus to resolve ownership across instances.';
