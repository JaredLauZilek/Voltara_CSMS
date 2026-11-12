// The ONLY place supabase.from('support_tickets' | 'profiles') appears for
// this feature (CLAUDE.md §4). RLS: staff see all, dealers their chargers'.
import { supabase } from '@/shared/lib/supabase';
import type { ProfileLite, Ticket, TicketUpdate } from './types';

export async function listTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Names for requesters and assignees. Rows RLS hides simply come back missing. */
export async function listProfiles(ids: string[]): Promise<ProfileLite[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);
  if (error) throw error;
  return data ?? [];
}

export async function updateTicket(id: string, patch: TicketUpdate): Promise<Ticket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
