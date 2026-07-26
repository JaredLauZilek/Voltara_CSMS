// The ONLY place `supabase.from('locations')` may appear. See CLAUDE.md §4.
import { supabase } from '@/shared/lib/supabase';
import type { Location, LocationInsert, LocationUpdate } from './types';

export async function listLocations(): Promise<Location[]> {
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createLocation(row: LocationInsert): Promise<Location> {
  const { data, error } = await supabase.from('locations').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateLocation(id: string, patch: LocationUpdate): Promise<Location> {
  const { data, error } = await supabase
    .from('locations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw error;
}
