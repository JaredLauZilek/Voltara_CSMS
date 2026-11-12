-- ============================================================================
-- Function execute grants, per the Supabase security advisor
-- (anon_security_definer_function_executable / authenticated_…):
--   * trigger functions are never called through the API → no API role may
--     execute them (triggers still fire; Postgres checks EXECUTE only at
--     CREATE TRIGGER time, which runs as the migration role);
--   * role helpers are called inside RLS policies as the signed-in role, so
--     `authenticated` keeps EXECUTE; `anon` and `public` lose it.
-- ============================================================================

-- Trigger functions
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.dealers_guard_update() from anon, authenticated, public;
revoke execute on function public.chargers_guard_update() from anon, authenticated, public;
revoke execute on function public.charger_settings_before_update() from anon, authenticated, public;

-- Role helpers (policies need `authenticated`; nobody anonymous needs them)
revoke execute on function public.staff_role() from anon, public;
revoke execute on function public.is_staff() from anon, public;
revoke execute on function public.is_staff_admin() from anon, public;
revoke execute on function public.is_staff_support() from anon, public;
revoke execute on function public.my_dealer_id() from anon, public;
revoke execute on function public.dealer_role() from anon, public;
revoke execute on function public.is_dealer_admin() from anon, public;
revoke execute on function public.is_dealer_member() from anon, public;
revoke execute on function public.my_actor() from anon, public;
revoke execute on function public.charger_role(uuid) from anon, public;
revoke execute on function public.in_rpc() from anon, public;
