// The ONLY place `supabase.from('cdrs')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type { Cdr, CdrFilters, CdrWithNames } from './types';

const SELECT =
  '*, charge_points(name), locations(name), billing_accounts(name), driver_groups(name), documents!cdrs_invoice_document_fk(number)';

function flatten(row: unknown): CdrWithNames {
  const { charge_points, locations, billing_accounts, driver_groups, documents, ...c } =
    row as Cdr & {
      charge_points: { name: string } | null;
      locations: { name: string } | null;
      billing_accounts: { name: string } | null;
      driver_groups: { name: string } | null;
      documents: { number: string } | null;
    };
  return {
    ...(c as Cdr),
    charge_point_name: charge_points?.name ?? null,
    location_name: locations?.name ?? null,
    account_name: billing_accounts?.name ?? null,
    group_name: driver_groups?.name ?? null,
    document_number: documents?.number ?? null,
  };
}

export async function listCdrs(f: CdrFilters): Promise<CdrWithNames[]> {
  let q = supabase
    .from('cdrs')
    .select(SELECT)
    .eq('credit', false)
    .order('start_at', { ascending: false })
    .limit(500);
  if (f.from) q = q.gte('start_at', new Date(`${f.from}T00:00:00`).toISOString());
  if (f.to)
    q = q.lt(
      'start_at',
      new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString(),
    );
  if (f.locationId) q = q.eq('location_id', f.locationId);
  if (f.chargePointId) q = q.eq('charge_point_id', f.chargePointId);
  if (f.accountId) q = q.eq('billing_account_id', f.accountId);
  if (f.state === 'billable') q = q.eq('billable', true);
  if (f.state === 'unbillable') q = q.eq('billable', false);
  if (f.state === 'uninvoiced') q = q.eq('billable', true).is('invoice_document_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(flatten);
}

export async function getCdr(id: string): Promise<CdrWithNames | null> {
  const { data, error } = await supabase.from('cdrs').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? flatten(data) : null;
}

export async function getCdrForSession(sessionId: string): Promise<CdrWithNames | null> {
  const { data, error } = await supabase
    .from('cdrs')
    .select(SELECT)
    .eq('charging_session_id', sessionId)
    .eq('credit', false)
    .maybeSingle();
  if (error) throw error;
  return data ? flatten(data) : null;
}

/** Receipt for one session — built server-side, returns the document id. */
export async function createReceipt(cdrId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_receipt', { p_cdr_id: cdrId });
  if (error) throw error;
  return data as string;
}
