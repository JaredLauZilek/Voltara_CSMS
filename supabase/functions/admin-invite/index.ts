// admin-invite — adds a person to the caller's operator.
//
// Memberships are service-role-only (CLAUDE.md §5/§10): a tenant admin cannot
// insert one from the browser, and inviting someone means creating an auth
// user, which only the service role can do. So this function
//   1. verifies the caller's JWT and reads tenant_id / tenant_role from
//      app_metadata (never user_metadata),
//   2. refuses anyone below admin, and refuses admins granting owner,
//   3. finds the auth user by email, or invites a new one,
//   4. writes the membership + an audit_log row.
// The tenant is never a parameter — it comes from the caller's token.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const ROLES = ['owner', 'admin', 'operator', 'viewer'] as const;
type Role = (typeof ROLES)[number];

interface Claims {
  sub?: string;
  app_metadata?: { tenant_id?: string; tenant_role?: Role };
}

function decodeClaims(jwt: string): Claims {
  const part = jwt.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded)) as Claims;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);

  // Verify the token is genuine (signature + expiry) before trusting a single
  // claim in it. getUser(jwt) round-trips to Auth with the caller's own token —
  // the argument is required: without it the client looks for a stored
  // session, and a function has none.
  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await asCaller.auth.getUser(token);
  if (callerError || !caller) return json({ error: 'Not signed in' }, 401);

  const claims = decodeClaims(token);
  const tenantId = claims.app_metadata?.tenant_id;
  const callerRole = claims.app_metadata?.tenant_role;
  if (!tenantId || !callerRole) return json({ error: 'No operator on this account' }, 403);
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return json({ error: 'Only owners and admins may invite people' }, 403);
  }

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  const role = (body.role ?? 'viewer') as Role;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'A valid email address is required' }, 400);
  }
  if (!ROLES.includes(role)) return json({ error: `Unknown role ${role}` }, 400);
  if (role === 'owner' && callerRole !== 'owner') {
    return json({ error: 'Only an owner may grant the owner role' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find an existing account first — inviting an address that already has
  // one re-sends the email, and the membership check must run before anyone
  // gets mail. listUsers has no email filter in every SDK version, so page
  // through and match.
  let userId: string | null = null;
  let invited = false;
  for (let page = 1; !userId; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) userId = hit.id;
    else if (data.users.length < 200) break;
  }

  if (userId) {
    const { data: existing } = await admin
      .from('memberships')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return json({ error: 'That person is already a member' }, 409);
  } else {
    // New address: create the user and email a link to set a password.
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: Deno.env.get('ADMIN_APP_URL') ?? undefined,
    });
    if (invite.error || !invite.data.user) {
      return json({ error: invite.error?.message ?? 'Could not invite that address' }, 500);
    }
    userId = invite.data.user.id;
    invited = true;
  }

  const { error: memberError } = await admin
    .from('memberships')
    .insert({ tenant_id: tenantId, user_id: userId, role });
  if (memberError) return json({ error: memberError.message }, 500);

  await admin.from('audit_log').insert({
    tenant_id: tenantId,
    actor_user_id: caller.id,
    actor_type: 'user',
    action: 'membership.invited',
    resource_type: 'membership',
    resource_id: userId,
    after: { email, role, invited },
  });

  return json({ ok: true, userId, invited });
});
