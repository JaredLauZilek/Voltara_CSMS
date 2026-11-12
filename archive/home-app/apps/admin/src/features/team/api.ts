// The ONLY place supabase.from('vw_people' | 'staff') and the admin-invite
// function appear for this feature (CLAUDE.md §4). Memberships are created
// server-side; the browser only changes or removes staff roles.
import { supabase } from '@/shared/lib/supabase';
import { functionErrorMessage } from '@/shared/lib/errors';
import type { InviteInput, TeamPerson } from './types';

/** Generic so it still applies after PostgREST narrows a column type (e.g. `.not(..., 'is', null)`). */
function hasUserId<T extends { user_id: string | null }>(p: T): p is T & { user_id: string } {
  return !!p.user_id;
}

export async function listStaff(): Promise<TeamPerson[]> {
  const { data, error } = await supabase
    .from('vw_people')
    .select('*')
    .not('staff_role', 'is', null)
    .order('full_name');
  if (error) throw error;
  return (data ?? []).filter(hasUserId);
}

export async function listDealerPeople(dealerId: string): Promise<TeamPerson[]> {
  const { data, error } = await supabase
    .from('vw_people')
    .select('*')
    .eq('dealer_id', dealerId)
    .order('full_name');
  if (error) throw error;
  return (data ?? []).filter(hasUserId);
}

export async function setStaffRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase.from('staff').update({ role }).eq('user_id', userId);
  if (error) throw error;
}

export async function removeStaff(userId: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function invite(input: InviteInput): Promise<{ invited: boolean }> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    invited?: boolean;
    error?: string;
  }>('admin-invite', {
    body: { email: input.email, kind: input.kind, role: input.role, dealer_id: input.dealerId },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return { invited: Boolean(data?.invited) };
}
