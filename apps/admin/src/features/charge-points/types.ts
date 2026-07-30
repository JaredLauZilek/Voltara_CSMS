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
  /**
   * The security ladder, matching how chargers actually ship in this market:
   *   0 — identity only, no credentials (incumbent-CSMS parity; easiest
   *       commissioning; anyone knowing the ID could impersonate the charger)
   *   1 — password over plaintext ws:// (legacy TLS stacks)
   *   2 — password over TLS (the default, and the floor for revenue chargers)
   */
  securityProfile: 0 | 1 | 2;
}

export const SECURITY_PROFILES = [
  {
    value: 2 as const,
    label: 'Password over TLS',
    hint: 'Recommended. Required for revenue chargers.',
  },
  {
    value: 1 as const,
    label: 'Password, no TLS',
    hint: 'For firmware that cannot complete a modern TLS handshake.',
  },
  {
    value: 0 as const,
    label: 'Open — charger ID only',
    hint: 'No password. How most incumbent networks run. Easiest to commission; least secure.',
  },
];

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
