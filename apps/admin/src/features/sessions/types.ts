import type { Database } from '@voltara/shared/database.types';

export type ChargingSession = Database['public']['Tables']['charging_sessions']['Row'];
export type MeterMinute = Database['public']['Tables']['meter_values_agg_1m']['Row'];

export { SESSION_STATUSES, SESSION_STATUS_LABELS } from '@voltara/shared';
export type { SessionStatus } from '@voltara/shared';

export interface SessionWithChargePoint extends ChargingSession {
  charge_point_identity: string | null;
}

export const SESSION_FILTERS = ['All', 'Active', 'Completed', 'Orphaned', 'Faulted'] as const;

/** Badge family per session status (six colour pairs only). */
export const SESSION_BADGE: Record<string, string> = {
  pending: 'Pending',
  active: 'Charging',
  suspended: 'SuspendedEV',
  finishing: 'Finishing',
  completed: 'Completed',
  faulted: 'Faulted',
  orphaned: 'Orphaned',
};

export const OPEN_STATUSES = ['pending', 'active', 'suspended', 'finishing'];

/** One row of the sessions report: a session with its site, driver, vehicle and payer. */
export type SessionReportRow =
  Database['public']['Functions']['admin_list_sessions']['Returns'][number];

/** DC connectors; everything else is AC. */
const DC_CONNECTORS = ['CCS2', 'CCS1', 'CHAdeMO', 'GBT_DC'];
export function currentType(connectorType: string | null): 'AC' | 'DC' | null {
  if (!connectorType) return null;
  return DC_CONNECTORS.includes(connectorType) ? 'DC' : 'AC';
}

/** How the session is paid for, as an operator would say it. */
export function billingType(s: SessionReportRow): string {
  if (s.billing_account_kind === 'corporate') return 'Corporate';
  if (s.driver_group_id) return 'Whitelist';
  return 'Pay-per-use';
}

/** Where the money stands. Card payments are not live yet, so nothing reads "Paid". */
export function paymentStatus(s: SessionReportRow): string {
  if (s.ended_at === null) return 'Charging';
  if (s.amount_gross === null) return 'Not priced';
  if (Number(s.amount_gross) === 0) return 'Free';
  if (s.billing_account_kind === 'corporate') return 'Monthly invoice';
  return 'Pending';
}

export function sessionMinutes(s: SessionReportRow, now = Date.now()): number {
  const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
  return Math.max(0, (end - new Date(s.started_at).getTime()) / 60_000);
}

/** List price before any whitelist discount. */
export function listAmount(s: SessionReportRow): number | null {
  if (s.amount_gross === null) return null;
  return Number(s.amount_gross) + Number(s.amount_discount ?? 0);
}
