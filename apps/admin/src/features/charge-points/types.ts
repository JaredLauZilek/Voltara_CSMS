import { CONNECTOR_STATUSES, type ConnectorStatus as ConnectorStatusName } from '@voltara/shared';
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
  /** 'ABB Terra 54' — the catalogue model it was registered as; null if none. */
  model_label: string | null;
}

/** One gun as entered at registration: its connector and the car park lot it serves. */
export interface GunInput {
  connectorType: string;
  parkingLot: string;
}

/** A catalogue model, flattened with its brand (global, curated by Voltara). */
export interface ChargerModel {
  id: string;
  vendor: string;
  name: string;
  power_kw: number | null;
  connector_count: number;
  connector_types: string[];
}

export interface RegisterChargerInput {
  /** As printed on the unit; required. */
  serialNumber: string;
  locationId: string | null;
  ocppIdentity: string | null;
  modelId: string | null;
  /** One entry per gun, in connector order (Gun A first). */
  guns: GunInput[];
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

/**
 * Every connector status in plain words, for the status board. `ocpp` is the
 * wire name an operator will meet in charger manuals and the frame log;
 * Offline and Unknown are ours, not OCPP's.
 */
export const CONNECTOR_STATUS_INFO: Record<
  ConnectorStatusName,
  { label: string; ocpp: string | null; hint: string }
> = {
  Available: { label: 'Available', ocpp: 'Available', hint: 'Free for the next driver' },
  Preparing: {
    label: 'Preparing',
    ocpp: 'Preparing',
    hint: 'Plugged in or authorised, not yet charging',
  },
  Charging: { label: 'Charging', ocpp: 'Charging', hint: 'Delivering energy' },
  SuspendedEV: {
    label: 'Paused · car',
    ocpp: 'SuspendedEV',
    hint: 'Car stopped drawing power: full or on its own timer',
  },
  SuspendedEVSE: {
    label: 'Paused · charger',
    ocpp: 'SuspendedEVSE',
    hint: 'Charger is withholding power: load limit or schedule',
  },
  Finishing: {
    label: 'Finishing',
    ocpp: 'Finishing',
    hint: 'Session ended, cable still plugged in',
  },
  Reserved: { label: 'Reserved', ocpp: 'Reserved', hint: 'Held for one driver' },
  Unavailable: {
    label: 'Unavailable',
    ocpp: 'Unavailable',
    hint: 'Taken out of service by an operator',
  },
  Faulted: { label: 'Faulted', ocpp: 'Faulted', hint: 'Charger reported an error' },
  Offline: { label: 'Offline', ocpp: null, hint: 'Not connected to the CSMS' },
  Unknown: { label: 'Unknown', ocpp: null, hint: 'Connected, no status reported yet' },
};

/** Statuses during which a connector is occupied by a session. */
export const IN_SESSION_STATUSES: readonly ConnectorStatusName[] = [
  'Preparing',
  'Charging',
  'SuspendedEV',
  'SuspendedEVSE',
  'Finishing',
];

/**
 * The status board, as two rows of groups. Row one answers "can a driver
 * use it?"; row two follows a session through its stages. A status with a
 * zero count still shows, so the board doubles as a map of the lifecycle;
 * Unknown only appears when something is in it.
 */
export const STATUS_GROUPS: {
  label: string;
  row: 1 | 2;
  statuses: readonly ConnectorStatusName[];
  hideWhenEmpty?: readonly ConnectorStatusName[];
}[] = [
  { label: 'Ready', row: 1, statuses: ['Available'] },
  {
    label: 'Needs attention',
    row: 1,
    statuses: ['Faulted', 'Offline', 'Unknown'],
    hideWhenEmpty: ['Unknown'],
  },
  { label: 'Not open to drivers', row: 1, statuses: ['Reserved', 'Unavailable'] },
  { label: 'In a session', row: 2, statuses: IN_SESSION_STATUSES },
];

/**
 * List filters: every connector status (set from the status board) plus
 * Pending — a charger registered but never connected has no connectors yet.
 */
export const STATUS_FILTERS = ['All', ...CONNECTOR_STATUSES, 'Pending'] as const;
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
  UnlockConnector: 'Unlock gun',
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
