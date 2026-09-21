// The ONLY place `supabase.from('tenant_settings')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type { OperatorForm, TenantSettings } from './types';

export async function getSettings(tenantId: string): Promise<TenantSettings | null> {
  const { data, error } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveSettings(tenantId: string, form: OperatorForm): Promise<TenantSettings> {
  const { data, error } = await supabase
    .from('tenant_settings')
    .upsert({ tenant_id: tenantId, ...form }, { onConflict: 'tenant_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
