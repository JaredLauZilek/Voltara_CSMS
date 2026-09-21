// The ONLY place `supabase.from('billing_accounts' | 'site_host_agreements')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type {
  AgreementWithLocation,
  BillingAccount,
  BillingAccountInsert,
  BillingAccountUpdate,
  BillingAccountWithCounts,
  SiteHostAgreementInsert,
} from './types';

export async function listAccounts(): Promise<BillingAccountWithCounts[]> {
  const { data, error } = await supabase
    .from('billing_accounts')
    .select('*, id_tags(count), locations(name)')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { id_tags, locations, ...a } = row as unknown as BillingAccount & {
      id_tags: { count: number }[];
      locations: { name: string } | null;
    };
    return { ...a, tag_count: id_tags?.[0]?.count ?? 0, location_name: locations?.name ?? null };
  });
}

export async function createAccount(row: BillingAccountInsert): Promise<BillingAccount> {
  const { data, error } = await supabase.from('billing_accounts').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateAccount(
  id: string,
  patch: BillingAccountUpdate,
): Promise<BillingAccount> {
  const { data, error } = await supabase
    .from('billing_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('billing_accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function listAgreements(hostAccountId: string): Promise<AgreementWithLocation[]> {
  const { data, error } = await supabase
    .from('site_host_agreements')
    .select('*, locations(name)')
    .eq('host_account_id', hostAccountId)
    .order('valid_from', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { locations, ...a } = row as unknown as AgreementWithLocation & {
      locations: { name: string } | null;
    };
    return { ...a, location_name: locations?.name ?? null };
  });
}

export async function upsertAgreement(
  row: SiteHostAgreementInsert & { id?: string },
): Promise<void> {
  const { error } = await supabase.from('site_host_agreements').upsert(row);
  if (error) throw error;
}

export async function deleteAgreement(id: string): Promise<void> {
  const { error } = await supabase.from('site_host_agreements').delete().eq('id', id);
  if (error) throw error;
}
