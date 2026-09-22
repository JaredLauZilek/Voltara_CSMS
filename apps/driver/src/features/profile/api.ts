// The ONLY place `supabase.from('driver_profiles' | 'id_tags')` appears.
import { supabase } from '@/lib/supabase';
import type { Database } from '@voltara/shared/database.types';

export type DriverProfile = Database['public']['Tables']['driver_profiles']['Row'];

export async function getProfile(userId: string): Promise<DriverProfile | null> {
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProfile(
  userId: string,
  patch: Partial<Pick<DriverProfile, 'display_name' | 'phone' | 'vehicle_plate' | 'vehicle_model'>>,
): Promise<DriverProfile> {
  const { data, error } = await supabase
    .from('driver_profiles')
    .upsert({ user_id: userId, ...patch })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** The driver's virtual tags — one per operator they have joined. */
export async function listMyTags() {
  const { data, error } = await supabase
    .from('id_tags')
    .select('id, tag, label, status, tenant_id, created_at')
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}
