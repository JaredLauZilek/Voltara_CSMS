// The ONLY place supabase.from('dealers' | 'dealer_members' | 'vw_people') and
// the admin-invite function appear for this feature (CLAUDE.md §4).
import { supabase } from '@/shared/lib/supabase';
import { functionErrorMessage } from '@/shared/lib/errors';
import type {
  Dealer,
  DealerInsert,
  DealerMembership,
  DealerPerson,
  DealerUpdate,
  InviteInput,
} from './types';

/** Generic so it still applies after PostgREST narrows a column type (e.g. `.not(..., 'is', null)`). */
function hasUserId<T extends { user_id: string | null }>(p: T): p is T & { user_id: string } {
  return !!p.user_id;
}

export async function listDealers(): Promise<Dealer[]> {
  const { data, error } = await supabase.from('dealers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getDealer(id: string): Promise<Dealer | null> {
  const { data, error } = await supabase.from('dealers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createDealer(row: DealerInsert): Promise<Dealer> {
  const { data, error } = await supabase.from('dealers').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateDealer(id: string, patch: DealerUpdate): Promise<Dealer> {
  const { data, error } = await supabase
    .from('dealers')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listDealerPeople(dealerId: string): Promise<DealerPerson[]> {
  const { data, error } = await supabase
    .from('vw_people')
    .select('*')
    .eq('dealer_id', dealerId)
    .order('full_name');
  if (error) throw error;
  return (data ?? []).filter(hasUserId);
}

/** Every dealer membership the caller can see — for the members-per-dealer count. */
export async function listDealerMemberships(): Promise<DealerMembership[]> {
  const { data, error } = await supabase
    .from('vw_people')
    .select('user_id, dealer_id')
    .not('dealer_id', 'is', null);
  if (error) throw error;
  return data ?? [];
}

export async function removeDealerMember(dealerId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('dealer_members')
    .delete()
    .eq('dealer_id', dealerId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Creating an auth user needs the service role, so invites run server-side. */
export async function inviteDealerMember(input: InviteInput): Promise<{ invited: boolean }> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    invited?: boolean;
    error?: string;
  }>('admin-invite', {
    body: { email: input.email, kind: 'dealer', role: input.role, dealer_id: input.dealerId },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return { invited: Boolean(data?.invited) };
}
