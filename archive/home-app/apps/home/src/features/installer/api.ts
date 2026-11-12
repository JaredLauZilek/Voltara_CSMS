// Installer / dealer flows: register stock, commission on site. The ONLY place
// rpc('register_charger' | 'commission_charger') may appear.
import { supabase } from '@/lib/supabase';
import type { PhaseMode } from '@voltara/shared';
import type { ChargerRow } from '@/features/chargers/types';

export interface Registered {
  id: string;
  serial: string;
  claim_code: string;
}

export async function registerCharger(input: {
  serial: string;
  modelId: string;
  claimCode?: string;
  name?: string;
}): Promise<Registered> {
  const { data, error } = await supabase.rpc('register_charger', {
    p_serial: input.serial.trim().toUpperCase(),
    p_model_id: input.modelId,
    p_claim_code: input.claimCode?.trim() || undefined,
    p_name: input.name?.trim() || undefined,
  });
  if (error) throw error;
  return data as unknown as Registered;
}

export async function commissionCharger(input: {
  chargerId: string;
  ratedCurrentA: number;
  phaseMode: PhaseMode;
  firmwareVersion?: string | null;
  site?: { site_label?: string; city?: string; state?: string; postcode?: string };
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('commission_charger', {
    p_charger_id: input.chargerId,
    p_rated_current_a: input.ratedCurrentA,
    p_phase_mode: input.phaseMode,
    p_firmware_version: input.firmwareVersion ?? undefined,
    p_site: input.site ? (input.site as never) : undefined,
    p_notes: input.notes || undefined,
  });
  if (error) throw error;
}

/** Units the installer's dealer is responsible for, newest first. */
export async function listDealerChargers(): Promise<ChargerRow[]> {
  const { data, error } = await supabase
    .from('vw_chargers')
    .select('*')
    .neq('lifecycle', 'decommissioned')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ChargerRow[];
}
