// The ONLY place `supabase.from('ocpp_messages')` may appear for the global viewer.
import { supabase } from '@/shared/lib/supabase';
import type { LogFilters, OcppMessage } from './types';

export const PAGE = 100;

/**
 * Keyset pagination on the identity column: the log is append-only and this
 * viewer walks it newest-first, so "load more" means "ids below the last one".
 * Offset pagination on a partitioned table this size would re-scan every page.
 */
export async function listMessages(
  filters: LogFilters,
  beforeId: number | null,
): Promise<OcppMessage[]> {
  let q = supabase.from('ocpp_messages').select('*').order('id', { ascending: false }).limit(PAGE);
  if (filters.chargePointId) q = q.eq('charge_point_id', filters.chargePointId);
  if (filters.action) q = q.eq('action', filters.action);
  if (filters.direction) q = q.eq('direction', filters.direction);
  if (filters.errorsOnly) q = q.eq('message_type', 4);
  if (beforeId !== null) q = q.lt('id', beforeId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
