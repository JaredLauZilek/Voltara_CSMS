// OCPP 1.6J vocabulary shared between the gateway, admin log viewer, and tests.
// Full zod payload schemas land in Phase 1 (hand-written once from the official
// JSON schemas at ocpp-spec.org/schemas/v1.6/). Wire-level validation is done
// by ocpp-rpc's bundled ajv schemas (strictMode); these are for our own code.

/** Charge-point-initiated actions in scope (core profile). */
export const CP_ACTIONS = [
  'BootNotification',
  'Heartbeat',
  'StatusNotification',
  'MeterValues',
  'Authorize',
  'StartTransaction',
  'StopTransaction',
  'DataTransfer',
] as const;
export type CpAction = (typeof CP_ACTIONS)[number];

/** Central-system-initiated actions in scope (core + remote trigger). */
export const CS_ACTIONS = [
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'Reset',
  'UnlockConnector',
  'ChangeAvailability',
  'ChangeConfiguration',
  'GetConfiguration',
  'ClearCache',
  'TriggerMessage',
] as const;
export type CsAction = (typeof CS_ACTIONS)[number];

/** OCPP-J message type numbers (frame element 0). */
export const MESSAGE_TYPE = {
  CALL: 2,
  CALLRESULT: 3,
  CALLERROR: 4,
} as const;

/** OCPP 1.6 ChargePointStatus wire values (StatusNotification.status). */
export const OCPP16_CHARGE_POINT_STATUS = [
  'Available',
  'Preparing',
  'Charging',
  'SuspendedEVSE',
  'SuspendedEV',
  'Finishing',
  'Reserved',
  'Unavailable',
  'Faulted',
] as const;
export type Ocpp16ChargePointStatus = (typeof OCPP16_CHARGE_POINT_STATUS)[number];

/** WebSocket subprotocol identifier for OCPP 1.6 JSON. */
export const OCPP16_SUBPROTOCOL = 'ocpp1.6';
