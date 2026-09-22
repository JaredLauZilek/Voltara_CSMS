// The ONLY place `supabase.from('charging_sessions' | 'cdrs' | 'documents')` appears.
import { supabase } from '@/lib/supabase';
import type { Database } from '@voltara/shared/database.types';

export type DriverSession = Database['public']['Tables']['charging_sessions']['Row'] & {
  charge_points: {
    name: string;
    ocpp_identity: string;
    locations: { id: string; name: string } | null;
  } | null;
};
export type DriverCdr = Database['public']['Tables']['cdrs']['Row'];
export type DriverReceipt = Pick<
  Database['public']['Tables']['documents']['Row'],
  'id' | 'number' | 'total_sen' | 'issued_at' | 'lines' | 'seller' | 'tax_sen' | 'subtotal_sen'
>;

const SELECT = '*, charge_points(name, ocpp_identity, locations(id, name))';

export async function listSessions(): Promise<DriverSession[]> {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select(SELECT)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as DriverSession[];
}

export async function activeSession(): Promise<DriverSession | null> {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select(SELECT)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as DriverSession | null) ?? null;
}

export async function getSession(id: string): Promise<DriverSession | null> {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as DriverSession | null) ?? null;
}

export async function getCdr(sessionId: string): Promise<DriverCdr | null> {
  const { data, error } = await supabase
    .from('cdrs')
    .select('*')
    .eq('charging_session_id', sessionId)
    .eq('credit', false)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getReceipt(cdrId: string): Promise<DriverReceipt | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, number, total_sen, issued_at, lines, seller, tax_sen, subtotal_sen')
    .eq('cdr_id', cdrId)
    .eq('kind', 'receipt')
    .eq('status', 'issued')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Latest per-minute rollup rows for a running session (energy + power). */
export async function sessionMinutes(sessionId: string) {
  const { data, error } = await supabase
    .from('meter_values_agg_1m')
    .select('minute, avg_power_w, energy_wh')
    .eq('charging_session_id', sessionId)
    .order('minute', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
