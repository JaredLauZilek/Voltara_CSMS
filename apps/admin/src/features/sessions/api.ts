// The ONLY place `supabase.from('charging_sessions' | 'meter_values_agg_1m')` may appear.
import { supabase } from '@/shared/lib/supabase';
import { OPEN_STATUSES } from './types';
import type {
  ChargingSession,
  MeterMinute,
  SessionReportRow,
  SessionWithChargePoint,
} from './types';

const SELECT = '*, charge_points(ocpp_identity)';

function flatten(
  row: ChargingSession & { charge_points?: { ocpp_identity: string } | null },
): SessionWithChargePoint {
  const { charge_points, ...s } = row;
  return {
    ...(s as ChargingSession),
    charge_point_identity: charge_points?.ocpp_identity ?? null,
  };
}

export interface SessionFilters {
  chargePointId?: string | null;
  /** ISO date (YYYY-MM-DD), inclusive, local day. */
  from?: string | null;
  to?: string | null;
  limit?: number;
}

export async function listSessions(
  filters: SessionFilters = {},
): Promise<SessionWithChargePoint[]> {
  let q = supabase
    .from('charging_sessions')
    .select(SELECT)
    .order('started_at', { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.chargePointId) q = q.eq('charge_point_id', filters.chargePointId);
  if (filters.from) q = q.gte('started_at', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to)
    q = q.lt(
      'started_at',
      new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86_400_000).toISOString(),
    );
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => flatten(r as Parameters<typeof flatten>[0]));
}

export async function getSession(id: string): Promise<SessionWithChargePoint | null> {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? flatten(data as Parameters<typeof flatten>[0]) : null;
}

/** Sessions still open on one charger, newest first — what a remote stop can target. */
export async function listOpenSessions(chargePointId: string): Promise<SessionWithChargePoint[]> {
  const { data, error } = await supabase
    .from('charging_sessions')
    .select(SELECT)
    .eq('charge_point_id', chargePointId)
    .is('ended_at', null)
    .in('status', OPEN_STATUSES)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => flatten(r as Parameters<typeof flatten>[0]));
}

/** Per-minute rollup for the chart — never the raw meter_values table. */
export async function listSessionMinutes(sessionId: string): Promise<MeterMinute[]> {
  const { data, error } = await supabase
    .from('meter_values_agg_1m')
    .select('*')
    .eq('charging_session_id', sessionId)
    .order('minute', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Sessions started today (local day) plus anything still open — the dashboard's "now". */
export async function listTodayAndOpenSessions(): Promise<SessionWithChargePoint[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('charging_sessions')
    .select(SELECT)
    .or(`started_at.gte.${start.toISOString()},ended_at.is.null`)
    .order('started_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => flatten(r as Parameters<typeof flatten>[0]));
}

export interface SessionReportFilters {
  locationId?: string | null;
  chargePointId?: string | null;
  /** ISO date (YYYY-MM-DD), inclusive, local day. */
  from?: string | null;
  to?: string | null;
}

/** Most rows one view loads; the screen says so when a view reaches it. */
export const SESSION_REPORT_LIMIT = 2000;

/** Sessions with site, driver, vehicle and payer joined — the list and its CSV. */
export async function listSessionReport(
  filters: SessionReportFilters = {},
): Promise<SessionReportRow[]> {
  const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
  const { data, error } = await supabase.rpc('admin_list_sessions', {
    p_location_id: filters.locationId ?? undefined,
    p_charge_point_id: filters.chargePointId ?? undefined,
    p_from: filters.from ? dayStart(filters.from).toISOString() : undefined,
    p_to: filters.to
      ? new Date(dayStart(filters.to).getTime() + 86_400_000).toISOString()
      : undefined,
    p_limit: SESSION_REPORT_LIMIT,
  });
  if (error) throw error;
  return data ?? [];
}
