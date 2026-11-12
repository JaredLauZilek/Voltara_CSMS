// The ONLY place supabase.from('profiles') / rpc('my_actor') may appear.
import { supabase } from '@/lib/supabase';
import type { Database } from '@voltara/shared/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface Actor {
  user_id: string | null;
  staff_role: 'admin' | 'support' | 'viewer' | null;
  dealer_id: string | null;
  dealer_role: 'dealer_admin' | 'installer' | null;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'full_name' | 'phone'>>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getActor(): Promise<Actor> {
  const { data, error } = await supabase.rpc('my_actor');
  if (error) throw error;
  return (data ?? {
    user_id: null,
    staff_role: null,
    dealer_id: null,
    dealer_role: null,
  }) as unknown as Actor;
}
