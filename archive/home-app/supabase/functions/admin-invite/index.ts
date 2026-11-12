// admin-invite — adds a person to Voltara staff or to a dealer.
//
// Creating an auth user needs the service role, so this runs server-side:
//   1. verifies the caller's JWT with Auth,
//   2. resolves the caller's role from the role tables (no JWT hook needed),
//   3. finds the auth user by email, or invites a new one,
//   4. writes the staff / dealer_members row + an audit_log row.
//
// Body: { email, kind: 'staff' | 'dealer', role, dealer_id? }
//   staff admin   → may invite staff (any role) or dealer members (any dealer)
//   dealer admin  → may invite installers / dealer admins into their own dealer

import { createClient } from 'npm:@supabase/supabase-js@2';

// Self-contained on purpose: the function deploys identically from the CLI
// and from the Supabase connector, which only ships this folder.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

const STAFF_ROLES = ['admin', 'support', 'viewer'] as const;
const DEALER_ROLES = ['dealer_admin', 'installer'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);

  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await asCaller.auth.getUser(token);
  if (callerError || !caller) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [{ data: staffRow }, { data: dealerRow }] = await Promise.all([
    admin.from('staff').select('role').eq('user_id', caller.id).maybeSingle(),
    admin
      .from('dealer_members')
      .select('dealer_id, role')
      .eq('user_id', caller.id)
      .order('created_at')
      .limit(1)
      .maybeSingle(),
  ]);
  const isStaffAdmin = staffRow?.role === 'admin';
  const isDealerAdmin = dealerRow?.role === 'dealer_admin';
  if (!isStaffAdmin && !isDealerAdmin) {
    return json({ error: 'Only Voltara admins and dealer admins may invite people' }, 403);
  }

  let body: { email?: string; kind?: string; role?: string; dealer_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'A valid email address is required' }, 400);
  }
  const kind = body.kind === 'staff' ? 'staff' : body.kind === 'dealer' ? 'dealer' : null;
  if (!kind) return json({ error: 'kind must be staff or dealer' }, 400);

  let dealerId: string | null = null;
  let role: string;
  if (kind === 'staff') {
    if (!isStaffAdmin) return json({ error: 'Only Voltara admins may invite staff' }, 403);
    role = body.role ?? 'viewer';
    if (!(STAFF_ROLES as readonly string[]).includes(role)) {
      return json({ error: `Unknown staff role ${role}` }, 400);
    }
  } else {
    role = body.role ?? 'installer';
    if (!(DEALER_ROLES as readonly string[]).includes(role)) {
      return json({ error: `Unknown dealer role ${role}` }, 400);
    }
    dealerId = isStaffAdmin ? (body.dealer_id ?? null) : dealerRow!.dealer_id;
    if (!dealerId) return json({ error: 'dealer_id is required' }, 400);
    if (!isStaffAdmin && dealerId !== dealerRow!.dealer_id) {
      return json({ error: 'You may only invite people into your own dealer' }, 403);
    }
  }

  // Existing account? listUsers has no email filter in every SDK version.
  let userId: string | null = null;
  let invited = false;
  for (let page = 1; !userId; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) userId = hit.id;
    else if (data.users.length < 200) break;
  }

  if (!userId) {
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: Deno.env.get('ADMIN_APP_URL') ?? undefined,
    });
    if (invite.error || !invite.data.user) {
      return json({ error: invite.error?.message ?? 'Could not invite that address' }, 500);
    }
    userId = invite.data.user.id;
    invited = true;
  }

  if (kind === 'staff') {
    const { error } = await admin.from('staff').upsert({ user_id: userId, role });
    if (error) return json({ error: error.message }, 500);
  } else {
    const { error } = await admin
      .from('dealer_members')
      .upsert({ user_id: userId, dealer_id: dealerId, role });
    if (error) return json({ error: error.message }, 500);
  }

  await admin.from('audit_log').insert({
    actor_user_id: caller.id,
    actor_type: 'user',
    action: kind === 'staff' ? 'staff.invited' : 'dealer_member.invited',
    resource_type: kind === 'staff' ? 'staff' : 'dealer_member',
    resource_id: userId,
    after: { email, role, dealer_id: dealerId, invited },
  });

  return json({ ok: true, userId, invited });
});
