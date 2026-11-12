// The ONLY place supabase.rpc('fleet_overview') and the dashboard feed queries appear.
import { supabase } from '@/shared/lib/supabase';
import { parseFleetOverview } from './types';
import type { ChargerEvent, FleetOverview } from './types';

export async function fetchFleetOverview(): Promise<FleetOverview | null> {
  const { data, error } = await supabase.rpc('fleet_overview');
  if (error) throw error;
  return parseFleetOverview(data);
}

/** The newest events across every charger the caller can see. */
export async function listRecentEvents(limit = 20): Promise<ChargerEvent[]> {
  const { data, error } = await supabase
    .from('charger_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Open + in-progress tickets visible to the caller (dealers: their chargers' tickets). */
export async function countOpenTickets(): Promise<number> {
  const { count, error } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress']);
  if (error) throw error;
  return count ?? 0;
}
