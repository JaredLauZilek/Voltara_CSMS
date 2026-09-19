// The ONLY place `supabase.from('id_tags')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type { IdTag, IdTagInsert, IdTagUpdate } from './types';

export async function listIdTags(): Promise<IdTag[]> {
  const { data, error } = await supabase
    .from('id_tags')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createIdTag(row: IdTagInsert): Promise<IdTag> {
  const { data, error } = await supabase.from('id_tags').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateIdTag(id: string, patch: IdTagUpdate): Promise<IdTag> {
  const { data, error } = await supabase
    .from('id_tags')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIdTag(id: string): Promise<void> {
  const { error } = await supabase.from('id_tags').delete().eq('id', id);
  if (error) throw error;
}
