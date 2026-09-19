import type { Database } from '@voltara/shared/database.types';

export type ChargePoint = Database['public']['Tables']['charge_points']['Row'];
export type ChargePointInsert = Database['public']['Tables']['charge_points']['Insert'];
export type ChargePointUpdate = Database['public']['Tables']['charge_points']['Update'];
export type Connector = Database['public']['Tables']['connectors']['Row'];
export type RemoteCommand = Database['public']['Tables']['remote_commands']['Row'];

export { CONNECTOR_TYPES, CONNECTOR_STATUSES, COMMAND_STATUS_LABELS } from '@voltara/shared';
export type {
  ConnectorStatus,
  ConnectionState,
  CommandStatus,
  RemoteCommandAction,
} from '@voltara/shared';

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

export const DETAIL_TABS = ['overview', 'sessions', 'config', 'logs'] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
export const DETAIL_TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Overview',
  sessions: 'Sessions',
  config: 'Configuration',
  logs: 'Logs',
};

/** Per-charger uptime over a window, from charge_point_uptime(). */
export interface UptimeRow {
  charge_point_id: string;
  online_seconds: number;
  window_seconds: number;
  uptime_pct: number | null;
}

/**
 * The remote operations an operator can trigger, with the wording that goes
 * on the confirm step. Payload shapes match @voltara/shared CS_REQUEST_SCHEMAS;
 * the gateway validates them again before anything reaches the charger.
 */
export interface RemoteOpInput {
  action: RemoteCommandActionUi;
  payload: Record<string, unknown>;
}
export type RemoteCommandActionUi =
  | 'RemoteStartTransaction'
  | 'RemoteStopTransaction'
  | 'Reset'
  | 'UnlockConnector'
  | 'ChangeAvailability'
  | 'ChangeConfiguration'
  | 'GetConfiguration'
  | 'TriggerMessage'
  | 'ClearCache';

export const REMOTE_OP_LABELS: Record<RemoteCommandActionUi, string> = {
  RemoteStartTransaction: 'Remote start',
  RemoteStopTransaction: 'Remote stop',
  Reset: 'Reset',
  UnlockConnector: 'Unlock connector',
  ChangeAvailability: 'Change availability',
  ChangeConfiguration: 'Set configuration',
  GetConfiguration: 'Refresh configuration',
  TriggerMessage: 'Request message',
  ClearCache: 'Clear auth cache',
};

/** Resolve the gateway URL for display, honouring an explicit port. */
export function gatewayDisplayHost(gatewayUrl: string, plaintext: boolean): string {
  const stripped = gatewayUrl.replace(/^wss?:\/\//, '').replace(/\/$/, '');
  // Only add the default port when the URL does not carry one already — a
  // local `ws://127.0.0.1:9221` must not become `127.0.0.1:9221:443`.
  const hasPort = /:\d+$/.test(stripped);
  return hasPort ? `${stripped}/ocpp` : `${stripped}:${plaintext ? '80' : '443'}/ocpp`;
}
