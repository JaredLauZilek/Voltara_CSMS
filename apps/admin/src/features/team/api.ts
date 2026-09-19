// The ONLY place the team RPCs and the admin-invite function are called.
// Memberships are never written from the browser (CLAUDE.md §10).
import { supabase } from '@/shared/lib/supabase';
import type { TeamMember } from './types';

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('list_team_members');
  if (error) throw error;
  return data ?? [];
}

export async function inviteMember(email: string, role: string): Promise<{ invited: boolean }> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    invited?: boolean;
    error?: string;
  }>('admin-invite', { body: { email, role } });
  if (error) {
    // The function answers 4xx with a JSON body explaining why; surface that
    // rather than the generic "non-2xx status code".
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return { invited: Boolean(data?.invited) };
}

export async function setMemberRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase.rpc('set_team_member_role', { p_user_id: userId, p_role: role });
  if (error) throw error;
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_team_member', { p_user_id: userId });
  if (error) throw error;
}
