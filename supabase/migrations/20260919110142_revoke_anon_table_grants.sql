-- ============================================================================
-- anon has NO table grants — deny-by-default is a grant-level fact, not only
-- an RLS one (CLAUDE.md §5/§10; guest flows arrive through edge functions with
-- the service role, never direct table access).
--
-- 20260725000300 relied on the local Postgres image's defaults, which granted
-- anon only TRUNCATE/REFERENCES/TRIGGER. Newer images (17.6.1.16x — what CI
-- pulls and what hosted projects run) carry default privileges granting anon
-- full DML on every new public table, which the RLS suite's grant-level test
-- rightly refuses. Make the denial explicit and image-independent.
-- ============================================================================

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Objects created by future migrations (run as postgres) must not pick the
-- grant back up from default privileges.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- The platform's own default-privilege entries are owned by supabase_admin;
-- clear them too where we are allowed to.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon';
exception when insufficient_privilege or undefined_object then
  raise notice 'supabase_admin default privileges left as-is (%)', sqlerrm;
end;
$$;

-- Schema usage stays: PostgREST needs it to answer anon with a clean 401/403
-- rather than a resolution error.
grant usage on schema public to anon;
