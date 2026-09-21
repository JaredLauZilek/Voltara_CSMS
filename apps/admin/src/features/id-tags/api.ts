// The ONLY place `supabase.from('id_tags')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type { IdTag, IdTagInsert, IdTagUpdate, IdTagWithAccount } from './types';

export async function listIdTags(): Promise<IdTagWithAccount[]> {
  const { data, error } = await supabase
    .from('id_tags')
    .select('*, billing_accounts(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { billing_accounts, ...tag } = row as unknown as IdTag & {
      billing_accounts: { name: string } | null;
    };
    return { ...tag, billing_account_name: billing_accounts?.name ?? null };
  });
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
