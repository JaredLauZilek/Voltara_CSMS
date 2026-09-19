import type { Database } from '@voltara/shared/database.types';

export type ChargingSession = Database['public']['Tables']['charging_sessions']['Row'];
export type MeterMinute = Database['public']['Tables']['meter_values_agg_1m']['Row'];

export { SESSION_STATUSES, SESSION_STATUS_LABELS } from '@voltara/shared';
export type { SessionStatus } from '@voltara/shared';

export interface SessionWithChargePoint extends ChargingSession {
  charge_point_name: string | null;
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
