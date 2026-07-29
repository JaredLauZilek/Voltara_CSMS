import type { Database } from '@voltara/shared/database.types';

export type ChargePoint = Database['public']['Tables']['charge_points']['Row'];
export type ChargePointInsert = Database['public']['Tables']['charge_points']['Insert'];
export type ChargePointUpdate = Database['public']['Tables']['charge_points']['Update'];
export type Connector = Database['public']['Tables']['connectors']['Row'];

export { CONNECTOR_TYPES, CONNECTOR_STATUSES } from '@voltara/shared';
export type { ConnectorStatus, ConnectionState } from '@voltara/shared';

/** A charge point with its connectors and the location it sits at. */
export interface ChargePointWithConnectors extends ChargePoint {
  connectors: Connector[];
  location_name: string | null;
  location_site_type: string | null;
}

export interface RegisterChargerInput {
  name: string;
  locationId: string | null;
  ocppIdentity: string | null;
  connectorCount: number;
  connectorType: string;
  maxKw: number | null;
}

/** Returned once, at registration. The key is never retrievable again. */
export interface RegisteredCharger {
  chargePointId: string;
  ocppIdentity: string;
  authKey: string;
}

/**
 * What an operator sees on a connector tile.
 *
 * A charger that is offline overrides whatever its connectors last reported —
 * the last known status of an unreachable charger is not its current status,
 * and showing "Available" for a dead charger sends drivers to a bay that will
 * not work.
 */
export function displayStatus(cp: ChargePointWithConnectors, connector: Connector): string {
  if (cp.connection_state !== 'online') return 'Offline';
  return connector.status;
}

export const STATUS_FILTERS = [
  'All',
  'Available',
  'Charging',
  'Faulted',
  'Offline',
  'Pending',
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
