// The ONLY place supabase.from('charging_sessions' | 'charger_readings') may appear.
import type { ReadingRow } from '@voltara/shared';
import { supabase } from '@/lib/supabase';
import type { ChargingSession, DailyEnergy } from './types';

export async function listSessions(
  chargerId: string | null,
  limit = 50,
): Promise<ChargingSession[]> {
  let q = supabase
    .from('charging_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (chargerId) q = q.eq('charger_id', chargerId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listDailyEnergy(chargerId: string, days = 30): Promise<DailyEnergy[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('vw_daily_energy')
    .select('*')
    .eq('charger_id', chargerId)
    .gte('day', since)
    .order('day');
  if (error) throw error;
  return data ?? [];
}

export async function ingestReadings(chargerId: string, rows: ReadingRow[]): Promise<number> {
  const { data, error } = await supabase.rpc('ingest_readings', {
    p_charger_id: chargerId,
    p_readings: rows as never,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function openSession(
  chargerId: string,
  startedAt: string,
  startEnergyKwh: number,
  source: ReadingRow['source'],
): Promise<string> {
  const { data, error } = await supabase.rpc('open_session', {
    p_charger_id: chargerId,
    p_started_at: startedAt,
    p_start_energy_kwh: startEnergyKwh,
    p_source: source,
  });
  if (error) throw error;
  return data as string;
}

export async function closeSession(
  sessionId: string,
  endedAt: string,
  endEnergyKwh: number,
  maxPowerKw: number,
  stopReason: string,
): Promise<void> {
  const { error } = await supabase.rpc('close_session', {
    p_session_id: sessionId,
    p_ended_at: endedAt,
    p_end_energy_kwh: endEnergyKwh,
    p_max_power_kw: maxPowerKw,
    p_stop_reason: stopReason,
  });
  if (error) throw error;
}
