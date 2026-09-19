import type { Database } from '@voltara/shared/database.types';

export type OcppMessage = Database['public']['Tables']['ocpp_messages']['Row'];

export const DIRECTION_FILTERS = ['All', 'From charger', 'To charger', 'Errors'] as const;

/** The 1.6 actions worth a quick filter; anything else is reachable via search. */
export const COMMON_ACTIONS = [
  'BootNotification',
  'Heartbeat',
  'StatusNotification',
  'Authorize',
  'StartTransaction',
  'StopTransaction',
  'MeterValues',
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'GetConfiguration',
  'ChangeConfiguration',
  'Reset',
  'TriggerMessage',
  'DataTransfer',
] as const;

export interface LogFilters {
  chargePointId: string | null;
  action: string | null;
  direction: 'in' | 'out' | null;
  errorsOnly: boolean;
}
