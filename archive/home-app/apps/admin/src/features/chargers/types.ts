import type { Database, Json } from '@voltara/shared/database.types';
import type { ChargerLifecycle, PhaseMode } from '@voltara/shared';

export type VwChargerRow = Database['public']['Views']['vw_chargers']['Row'];

/** vw_chargers, with the columns every charger row carries made non-null. */
export type ChargerRow = Omit<VwChargerRow, 'id' | 'serial' | 'name' | 'lifecycle'> & {
  id: string;
  serial: string;
  name: string;
  lifecycle: ChargerLifecycle;
};

export type ChargerModel = Database['public']['Tables']['charger_models']['Row'];
export type ChargerEvent = Database['public']['Tables']['charger_events']['Row'];
export type ChargingSession = Database['public']['Tables']['charging_sessions']['Row'];
export type DailyEnergy = Database['public']['Views']['vw_daily_energy']['Row'];
export type ReadingPoint = Pick<
  Database['public']['Tables']['charger_readings']['Row'],
  'recorded_at' | 'power_kw' | 'state'
>;

export interface DealerOption {
  id: string;
  name: string;
  code: string;
}

export interface HouseholdMember {
  user_id: string;
  role: string;
  created_at: string;
  full_name: string | null;
  email: string | null;
}

export interface RegisterChargerInput {
  serial: string;
  modelId: string;
  dealerId: string | null;
  claimCode: string | null;
  name: string | null;
}

/** Returned once, at registration. The code is stored only as a bcrypt hash. */
export interface RegisteredCharger {
  id: string;
  serial: string;
  claimCode: string;
}

/** The p_site jsonb for commission_charger(). A type alias so it is assignable to Json. */
export type CommissionSite = {
  site_label?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

export interface CommissionInput {
  chargerId: string;
  ratedCurrentA: number;
  phaseMode: PhaseMode;
  firmwareVersion: string | null;
  site: CommissionSite | null;
  notes: string | null;
}

/** chargers.last_status — the newest ReadingRow the app forwarded (ingest_readings). */
export interface LastStatus {
  at: string | null;
  state: string | null;
  power_kw: number | null;
  i1: number | null;
  i2: number | null;
  i3: number | null;
  v1: number | null;
  v2: number | null;
  v3: number | null;
  energy_total_kwh: number | null;
  session_kwh: number | null;
  temperature_c: number | null;
  source: string | null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Narrow the untyped jsonb without trusting any of it. */
export function parseLastStatus(json: Json | null | undefined): LastStatus | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  return {
    at: str(o.at),
    state: str(o.state),
    power_kw: num(o.power_kw),
    i1: num(o.i1),
    i2: num(o.i2),
    i3: num(o.i3),
    v1: num(o.v1),
    v2: num(o.v2),
    v3: num(o.v3),
    energy_total_kwh: num(o.energy_total_kwh),
    session_kwh: num(o.session_kwh),
    temperature_c: num(o.temperature_c),
    source: str(o.source),
  };
}

export const LIFECYCLE_FILTERS = [
  'All',
  'Registered',
  'Commissioned',
  'Claimed',
  'Decommissioned',
] as const;
export type LifecycleFilter = (typeof LIFECYCLE_FILTERS)[number];

/** Pill family for a charger's live state. Offline overrides whatever it last reported. */
export function chargerStatePill(row: Pick<ChargerRow, 'seen_recently' | 'last_state'>): string {
  if (!row.seen_recently) return 'Offline';
  return row.last_state ?? 'Unknown';
}

export const DAY_MS = 86_400_000;

export function seenWithin(
  row: Pick<ChargerRow, 'last_seen_at'>,
  ms: number,
  now = Date.now(),
): boolean {
  return !!row.last_seen_at && now - new Date(row.last_seen_at).getTime() < ms;
}

/** Mirrors fleet_overview(): a fault reported within the last 24 h. */
export function isFaulted(row: Pick<ChargerRow, 'last_state' | 'last_seen_at'>): boolean {
  return row.last_state === 'Faulted' && seenWithin(row, DAY_MS);
}

/** An owned charger that has not reported in the last 10 minutes. */
export function isOffline(row: Pick<ChargerRow, 'lifecycle' | 'seen_recently'>): boolean {
  return row.lifecycle === 'claimed' && !row.seen_recently;
}

export function isChargingNow(row: Pick<ChargerRow, 'seen_recently' | 'last_state'>): boolean {
  return !!row.seen_recently && row.last_state === 'Charging';
}
