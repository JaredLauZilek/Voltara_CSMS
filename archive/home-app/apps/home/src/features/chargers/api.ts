// The ONLY place supabase.from('chargers' | 'charger_*') may appear.
import { supabase } from '@/lib/supabase';
import type {
  ChargerEvent,
  ChargerMember,
  ChargerModel,
  ChargerRow,
  ChargerSettings,
  Json,
} from './types';

export async function listMyChargers(): Promise<ChargerRow[]> {
  const { data, error } = await supabase
    .from('vw_chargers')
    .select('*')
    .neq('lifecycle', 'decommissioned')
    .order('claimed_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ChargerRow[];
}

export async function getCharger(id: string): Promise<ChargerRow | null> {
  const { data, error } = await supabase.from('vw_chargers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ChargerRow | null;
}

export async function getChargerBySerial(serial: string): Promise<ChargerRow | null> {
  const { data, error } = await supabase
    .from('vw_chargers')
    .select('*')
    .eq('serial', serial.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data as ChargerRow | null;
}

export async function renameCharger(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('chargers').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function getSettings(chargerId: string): Promise<ChargerSettings | null> {
  const { data, error } = await supabase
    .from('charger_settings')
    .select('*')
    .eq('charger_id', chargerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSettings(
  chargerId: string,
  patch: Partial<
    Pick<ChargerSettings, 'max_current_a' | 'cable_locked' | 'led_brightness' | 'schedule'>
  >,
): Promise<ChargerSettings> {
  const { data, error } = await supabase
    .from('charger_settings')
    .update(patch)
    .eq('charger_id', chargerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reportSettingsApplied(chargerId: string, version: number): Promise<void> {
  const { error } = await supabase.rpc('report_settings_applied', {
    p_charger_id: chargerId,
    p_version: version,
  });
  if (error) throw error;
}

export async function claimCharger(
  serial: string,
  claimCode: string,
  name?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('claim_charger', {
    p_serial: serial.trim().toUpperCase(),
    p_claim_code: claimCode.trim(),
    p_name: name?.trim() || undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function releaseCharger(chargerId: string): Promise<void> {
  const { error } = await supabase.rpc('release_charger', { p_charger_id: chargerId });
  if (error) throw error;
}

export async function listMembers(
  chargerId: string,
): Promise<(ChargerMember & { profile: { full_name: string; email: string | null } | null })[]> {
  const { data, error } = await supabase
    .from('charger_members')
    .select('*, profile:profiles!charger_members_user_id_fkey(full_name, email)')
    .eq('charger_id', chargerId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as never;
}

export async function removeMember(chargerId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('charger_members')
    .delete()
    .eq('charger_id', chargerId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listEvents(chargerId: string, limit = 50): Promise<ChargerEvent[]> {
  const { data, error } = await supabase
    .from('charger_events')
    .select('*')
    .eq('charger_id', chargerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function logEvent(
  chargerId: string,
  userId: string,
  type: string,
  message: string,
  severity: 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('charger_events').insert({
    charger_id: chargerId,
    actor_user_id: userId,
    type,
    message,
    severity,
    data: (data ?? null) as Json,
  });
  if (error) throw error;
}

export async function listModels(): Promise<ChargerModel[]> {
  const { data, error } = await supabase
    .from('charger_models')
    .select('*')
    .eq('is_active', true)
    .order('brand')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function inviteMember(
  chargerId: string,
  email: string,
  role: 'member' | 'guest',
): Promise<void> {
  const { error } = await supabase.rpc('invite_charger_member', {
    p_charger_id: chargerId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
  });
  if (error) throw error;
}
