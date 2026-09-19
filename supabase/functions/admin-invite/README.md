# admin-invite

Adds a person to the caller's operator (tenant). Called from the admin app's
Team screen via `supabase.functions.invoke('admin-invite', { body: { email, role } })`.

- Caller must be signed in with `tenant_role` owner or admin (read from the
  JWT's `app_metadata`, which only the auth hook can write).
- Admins cannot grant `owner`.
- Creates the auth user with an invite email if the address is new; otherwise
  reuses the existing account. Writes `memberships` + `audit_log`.
- Env: the standard `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` (injected by the platform) and optional
  `ADMIN_APP_URL` for the invite link's redirect.

Local: `pnpm exec supabase functions serve admin-invite` — invite emails land
in Mailpit (http://127.0.0.1:54324). Deploy: `pnpm exec supabase functions deploy admin-invite`.
