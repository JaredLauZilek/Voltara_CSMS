// Protocol-agnostic domain enums. OCPP wire values are normalised into these
// by the gateway; nothing outside apps/ocpp-gateway/src/ocpp/ may use raw
// OCPP shapes. See CLAUDE.md §6.

// OCPP 1.6 ChargePointStatus values map 1:1 today; 2.0.1 will map onto the
// same set via its adapter. 'Offline' is ours (charger unreachable), 'Unknown'
// is ours (never reported since boot).
export const CONNECTOR_STATUSES = [
  'Available',
  'Preparing',
  'Charging',
  'SuspendedEVSE',
  'SuspendedEV',
  'Finishing',
  'Reserved',
  'Unavailable',
  'Faulted',
  'Unknown',
  'Offline',
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CHARGE_POINT_LIFECYCLES = ['pending', 'active', 'decommissioned'] as const;
export type ChargePointLifecycle = (typeof CHARGE_POINT_LIFECYCLES)[number];

export const CONNECTION_STATES = ['never_connected', 'online', 'offline'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const SESSION_STATUSES = [
  'pending',
  'active',
  'suspended',
  'finishing',
  'completed',
  'faulted',
  'orphaned',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const COMMAND_STATUSES = [
  'queued',
  'sent',
  'accepted',
  'rejected',
  'timeout',
  'failed',
] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

// Remote commands the gateway knows how to dispatch (OCPP 1.6 central-system calls).
export const REMOTE_COMMAND_ACTIONS = [
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'Reset',
  'UnlockConnector',
  'ChangeAvailability',
  'ChangeConfiguration',
  'GetConfiguration',
  'TriggerMessage',
  'ClearCache',
] as const;
export type RemoteCommandAction = (typeof REMOTE_COMMAND_ACTIONS)[number];

export const TENANT_ROLES = ['owner', 'admin', 'operator', 'viewer'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const SITE_TYPES = ['public', 'condo', 'workplace', 'home', 'fleet_depot'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/** Display labels for site types (STATUS_COLORS keys in @voltara/ui use these). */
export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  public: 'Public',
  condo: 'Condo',
  workplace: 'Workplace',
  home: 'Home',
  fleet_depot: 'Fleet Depot',
};

export const ID_TAG_STATUSES = ['active', 'blocked', 'expired'] as const;
export type IdTagStatus = (typeof ID_TAG_STATUSES)[number];

export const CONNECTOR_TYPES = [
  'Type2',
  'CCS2',
  'CHAdeMO',
  'Type1',
  'GBT_AC',
  'GBT_DC',
  'Schuko',
  'Other',
] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

// Malaysian states/territories — drives the EVCS licensing jurisdiction:
// Sabah → ECoS, Sarawak → its own authority, everywhere else → Suruhanjaya Tenaga.
export const MY_STATES = [
  'Kuala Lumpur',
  'Selangor',
  'Putrajaya',
  'Penang',
  'Johor',
  'Perak',
  'Negeri Sembilan',
  'Melaka',
  'Pahang',
  'Kedah',
  'Kelantan',
  'Terengganu',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Labuan',
] as const;
export type MyState = (typeof MY_STATES)[number];

export type LicensingJurisdiction = 'ST' | 'ECoS' | 'Sarawak';

export function licensingJurisdiction(state: string | null | undefined): LicensingJurisdiction {
  if (state === 'Sabah' || state === 'Labuan') return 'ECoS';
  if (state === 'Sarawak') return 'Sarawak';
  return 'ST';
}
