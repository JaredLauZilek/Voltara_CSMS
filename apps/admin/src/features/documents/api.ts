// The ONLY place `supabase.from('documents')` and the document RPCs may appear.
import { supabase } from '@/shared/lib/supabase';
import type { Document, DocumentWithNames } from './types';

const SELECT = '*, billing_accounts(name), locations(name)';

function flatten(row: unknown): DocumentWithNames {
  const { billing_accounts, locations, ...d } = row as Document & {
    billing_accounts: { name: string } | null;
    locations: { name: string } | null;
  };
  return {
    ...(d as Document),
    account_name: billing_accounts?.name ?? null,
    location_name: locations?.name ?? null,
  };
}

export async function listDocuments(): Promise<DocumentWithNames[]> {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(flatten);
}

export async function getDocument(id: string): Promise<DocumentWithNames | null> {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? flatten(data) : null;
}

export async function runInvoice(accountId: string, from: string, to: string): Promise<string> {
  const { data, error } = await supabase.rpc('run_invoice', {
    p_billing_account_id: accountId,
    p_period_start: from,
    p_period_end: to,
  });
  if (error) throw error;
  return data as string;
}

export async function runSettlement(locationId: string, from: string, to: string): Promise<string> {
  const { data, error } = await supabase.rpc('run_settlement', {
    p_location_id: locationId,
    p_period_start: from,
    p_period_end: to,
  });
  if (error) throw error;
  return data as string;
}

export async function issueDocument(id: string): Promise<void> {
  const { error } = await supabase.rpc('issue_document', { p_document_id: id });
  if (error) throw error;
}

export async function voidDocument(id: string): Promise<void> {
  const { error } = await supabase.rpc('void_document', { p_document_id: id });
  if (error) throw error;
}
