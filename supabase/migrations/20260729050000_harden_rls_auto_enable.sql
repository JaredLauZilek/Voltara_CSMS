-- ============================================================================
-- Hosted Supabase projects ship a platform guardrail: the `ensure_rls` event
-- trigger + public.rls_auto_enable() (SECURITY DEFINER), which auto-enables
-- RLS on new public tables. Useful — but default grants exposed it at
-- /rest/v1/rpc/rls_auto_enable to anon/authenticated, which the security
-- advisor flags. Revoke EXECUTE (the event trigger itself is unaffected).
-- Guarded: the function does not exist on the local dev stack.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end
$$;
