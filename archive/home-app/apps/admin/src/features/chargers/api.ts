// The ONLY place supabase.from(...) / supabase.rpc(...) appears for this
// feature (CLAUDE.md §4). vw_chargers is the read model; lifecycle changes go
// through the RPCs so the guard trigger and audit events always fire (§5).
import { supabase } from '@/shared/lib/supabase';
import { dayKey } from '@/shared/lib/format';
import type {
  ChargerEvent,
  ChargerModel,
  ChargerRow,
  ChargingSession,
  CommissionInput,
  DailyEnergy,
  DealerOption,
  HouseholdMember,
  ReadingPoint,
  RegisterChargerInput,
  RegisteredCharger,
  VwChargerRow,
} from './types';

function isChargerRow(row: VwChargerRow): row is ChargerRow {
  return !!row.id && !!row.serial && !!row.name && !!row.lifecycle;
}

export async function listChargers(): Promise<ChargerRow[]> {
  const { data, error } = await supabase
    .from('vw_chargers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).filter(isChargerRow);
}

export async function getCharger(id: string): Promise<ChargerRow | null> {
  const { data, error } = await supabase.from('vw_chargers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data && isChargerRow(data) ? data : null;
}

export async function listChargerModels(): Promise<ChargerModel[]> {
  const { data, error } = await supabase
    .from('charger_models')
    .select('*')
    .eq('is_active', true)
    .order('brand')
    .order('model');
  if (error) throw error;
  return data ?? [];
}

export async function listDealerOptions(): Promise<DealerOption[]> {
  const { data, error } = await supabase
    .from('dealers')
    .select('id, name, code')
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listDailyEnergy(chargerId: string, days: number): Promise<DailyEnergy[]> {
  const from = dayKey(new Date(Date.now() - days * 86_400_000));
  const { data, error } = await supabase
    .from('vw_daily_energy')
    .select('*')
    .eq('charger_id', chargerId)
    .gte('day', from)
    .order('day');
  if (error) throw error;
  return data ?? [];
}

export async function listReadings(chargerId: string, hours: number): Promise<ReadingPoint[]> {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from('charger_readings')
    .select('recorded_at, power_kw, state')
    .eq('charger_id', chargerId)
    .gt('recorded_at', since)
    .order('recorded_at', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

export async function listSessions(chargerId: string, limit = 20): Promise<ChargingSession[]> {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select('*')
    .eq('charger_id', chargerId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listEvents(chargerId: string, limit = 30): Promise<ChargerEvent[]> {
  const { data, error } = await supabase
    .from('charger_events')
    .select('*')
    .eq('charger_id', chargerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listHousehold(chargerId: string): Promise<HouseholdMember[]> {
  const { data: members, error } = await supabase
    .from('charger_members')
    .select('user_id, role, created_at')
    .eq('charger_id', chargerId)
    .order('created_at');
  if (error) throw error;
  const rows = members ?? [];
  if (rows.length === 0) return [];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in(
      'id',
      rows.map((m) => m.user_id),
    );
  if (profilesError) throw profilesError;
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at,
    full_name: byId.get(m.user_id)?.full_name ?? null,
    email: byId.get(m.user_id)?.email ?? null,
  }));
}

/**
 * Registration is a database function, not an insert: the claim code is
 * hashed server-side and returned exactly once.
 */
export async function registerCharger(input: RegisterChargerInput): Promise<RegisteredCharger> {
  const { data, error } = await supabase.rpc('register_charger', {
    p_serial: input.serial,
    p_model_id: input.modelId,
    // SQL defaults: omit rather than pass null.
    p_dealer_id: input.dealerId ?? undefined,
    p_claim_code: input.claimCode ?? undefined,
    p_name: input.name ?? undefined,
  });
  if (error) throw error;
  const row = data as unknown as { id?: string; serial?: string; claim_code?: string } | null;
  if (!row?.id || !row.claim_code) throw new Error('Registration returned no charger.');
  return { id: row.id, serial: row.serial ?? input.serial, claimCode: row.claim_code };
}

export async function commissionCharger(input: CommissionInput): Promise<void> {
  const { error } = await supabase.rpc('commission_charger', {
    p_charger_id: input.chargerId,
    p_rated_current_a: input.ratedCurrentA,
    p_phase_mode: input.phaseMode,
    p_firmware_version: input.firmwareVersion ?? undefined,
    p_site: input.site ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error) throw error;
}

export async function decommissionCharger(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('decommission_charger', {
    p_charger_id: id,
    p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

export async function releaseCharger(id: string): Promise<void> {
  const { error } = await supabase.rpc('release_charger', { p_charger_id: id });
  if (error) throw error;
}
