// The ONLY place supabase.from('vw_chargers') appears for this feature. Owners
// have no table of their own: an owner is whoever a charger points at.
import { supabase } from '@/shared/lib/supabase';
import type { OwnerChargerRow } from './types';

export async function listOwnerChargers(): Promise<OwnerChargerRow[]> {
  const { data, error } = await supabase
    .from('vw_chargers')
    .select('id, owner_user_id, owner_name, owner_email, last_seen_at, dealer_name, lifecycle')
    .not('owner_user_id', 'is', null);
  if (error) throw error;
  return data ?? [];
}
