// The ONLY place supabase.from('audit_log' | 'vw_people') appears for this
// feature (CLAUDE.md §4). Staff-only by RLS.
import { supabase } from '@/shared/lib/supabase';
import type { AuditRow, PersonLite } from './types';

export async function listAuditLog(limit = 200): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listPeople(): Promise<PersonLite[]> {
  const { data, error } = await supabase.from('vw_people').select('user_id, full_name, email');
  if (error) throw error;
  return data ?? [];
}
