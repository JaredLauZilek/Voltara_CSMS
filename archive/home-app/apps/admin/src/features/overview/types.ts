import type { Database, Json } from '@voltara/shared/database.types';

export type ChargerEvent = Database['public']['Tables']['charger_events']['Row'];

/** What fleet_overview() returns for staff (jsonb). */
export interface FleetOverview {
  chargers_total: number;
  chargers_claimed: number;
  chargers_commissioned: number;
  chargers_registered: number;
  seen_24h: number;
  charging_now: number;
  faulted: number;
  open_tickets: number;
  kwh_30d: number;
  sessions_30d: number;
  owners: number;
  dealers: number;
}

/** The subset the overview KPIs need; dealers derive it client-side. */
export type FleetKpis = Pick<
  FleetOverview,
  'chargers_total' | 'chargers_claimed' | 'seen_24h' | 'charging_now' | 'faulted' | 'open_tickets'
>;

/** Narrow the untyped jsonb; the RPC returns null for non-staff. */
export function parseFleetOverview(json: Json | null): FleetOverview | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const n = (k: string): number => {
    const v = o[k];
    const x = typeof v === 'number' ? v : Number(v ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    chargers_total: n('chargers_total'),
    chargers_claimed: n('chargers_claimed'),
    chargers_commissioned: n('chargers_commissioned'),
    chargers_registered: n('chargers_registered'),
    seen_24h: n('seen_24h'),
    charging_now: n('charging_now'),
    faulted: n('faulted'),
    open_tickets: n('open_tickets'),
    kwh_30d: n('kwh_30d'),
    sessions_30d: n('sessions_30d'),
    owners: n('owners'),
    dealers: n('dealers'),
  };
}
