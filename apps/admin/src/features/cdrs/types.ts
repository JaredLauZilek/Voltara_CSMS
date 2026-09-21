import type { Database } from '@voltara/shared/database.types';
import type { billing } from '@voltara/shared';

export type Cdr = Database['public']['Tables']['cdrs']['Row'];

export interface CdrWithNames extends Cdr {
  charge_point_name: string | null;
  location_name: string | null;
  account_name: string | null;
  group_name: string | null;
  document_number: string | null;
}

export interface CdrFilters {
  from: string | null;
  to: string | null;
  locationId: string | null;
  chargePointId: string | null;
  accountId: string | null;
  /** 'billable' | 'unbillable' | 'uninvoiced' | null */
  state: string | null;
}

export const CDR_FILTERS = ['All', 'Billable', 'Uninvoiced', 'Unbillable'] as const;

export const UNBILLABLE_LABELS: Record<string, string> = {
  no_tariff: 'No tariff applied',
  orphaned_no_start: 'Stop without a start',
};

export function linesOf(cdr: Cdr): billing.CostLine[] {
  return (cdr.lines as unknown as billing.CostLine[] | null) ?? [];
}

export function periodsOf(cdr: Cdr): billing.ChargingPeriod[] {
  return (cdr.charging_periods as unknown as billing.ChargingPeriod[] | null) ?? [];
}

export function snapshotOf(cdr: Cdr): billing.TariffSnapshot | null {
  return (cdr.tariff_snapshot as unknown as billing.TariffSnapshot | null) ?? null;
}
