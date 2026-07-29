// OCPP 1.6J vocabulary — enums, payload schemas, and inferred types for the
// messages in scope (core profile + remote trigger).
//
// Two layers of validation exist and they have different jobs:
//   • ocpp-rpc `strictMode` validates the wire against the official JSON
//     schemas and answers malformed frames with a spec-correct CALLERROR.
//   • These zod schemas parse the payload into typed data our handlers can
//     trust. They are deliberately `.passthrough()` — real chargers append
//     vendor fields, and dropping a whole transaction over an extra key is a
//     worse failure than ignoring it.
//
// Wire shapes must not leak past apps/ocpp-gateway/src/ocpp/v16/ — see
// CLAUDE.md §6. Import these in the gateway's protocol module only.

import { z } from 'zod';

// ── Framing ─────────────────────────────────────────────────────────────────

/** OCPP-J message type numbers (element 0 of every frame). */
export const MESSAGE_TYPE = {
  CALL: 2,
  CALLRESULT: 3,
  CALLERROR: 4,
} as const;

/** WebSocket subprotocol identifier for OCPP 1.6 JSON. */
export const OCPP16_SUBPROTOCOL = 'ocpp1.6';

// ── Enumerations ────────────────────────────────────────────────────────────

export const REGISTRATION_STATUS = ['Accepted', 'Pending', 'Rejected'] as const;
export const AUTHORIZATION_STATUS = [
  'Accepted',
  'Blocked',
  'Expired',
  'Invalid',
  'ConcurrentTx',
] as const;

export const CHARGE_POINT_STATUS = [
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
export type Ocpp16ChargePointStatus = (typeof CHARGE_POINT_STATUS)[number];

export const CHARGE_POINT_ERROR_CODE = [
  'ConnectorLockFailure',
  'EVCommunicationError',
  'GroundFailure',
  'HighTemperature',
  'InternalError',
  'LocalListConflict',
  'NoError',
  'OtherError',
  'OverCurrentFailure',
  'OverVoltage',
  'PowerMeterFailure',
  'PowerSwitchFailure',
  'ReaderFailure',
  'ResetFailure',
  'UnderVoltage',
  'WeakSignal',
] as const;

export const STOP_REASON = [
  'EmergencyStop',
  'EVDisconnected',
  'HardReset',
  'Local',
  'Other',
  'PowerLoss',
  'Reboot',
  'Remote',
  'SoftReset',
  'UnlockCommand',
  'DeAuthorized',
] as const;

export const READING_CONTEXT = [
  'Interruption.Begin',
  'Interruption.End',
  'Other',
  'Sample.Clock',
  'Sample.Periodic',
  'Transaction.Begin',
  'Transaction.End',
  'Trigger',
] as const;

export const MEASURAND = [
  'Current.Export',
  'Current.Import',
  'Current.Offered',
  'Energy.Active.Export.Register',
  'Energy.Active.Import.Register',
  'Energy.Reactive.Export.Register',
  'Energy.Reactive.Import.Register',
  'Energy.Active.Export.Interval',
  'Energy.Active.Import.Interval',
  'Energy.Reactive.Export.Interval',
  'Energy.Reactive.Import.Interval',
  'Frequency',
  'Power.Active.Export',
  'Power.Active.Import',
  'Power.Factor',
  'Power.Offered',
  'Power.Reactive.Export',
  'Power.Reactive.Import',
  'RPM',
  'SoC',
  'Temperature',
  'Voltage',
] as const;

/** The default when a sampledValue omits `measurand` (spec §7.31). */
export const DEFAULT_MEASURAND = 'Energy.Active.Import.Register';

export const PHASE = [
  'L1',
  'L2',
  'L3',
  'N',
  'L1-N',
  'L2-N',
  'L3-N',
  'L1-L2',
  'L2-L3',
  'L3-L1',
] as const;
export const LOCATION = ['Body', 'Cable', 'EV', 'Inlet', 'Outlet'] as const;
export const VALUE_FORMAT = ['Raw', 'SignedData'] as const;

export const UNIT_OF_MEASURE = [
  'Wh',
  'kWh',
  'varh',
  'kvarh',
  'W',
  'kW',
  'VA',
  'kVA',
  'var',
  'kvar',
  'A',
  'V',
  'K',
  'Celcius',
  'Celsius',
  'Fahrenheit',
  'Percent',
] as const;

export const REMOTE_START_STOP_STATUS = ['Accepted', 'Rejected'] as const;
export const RESET_TYPE = ['Hard', 'Soft'] as const;
export const RESET_STATUS = ['Accepted', 'Rejected'] as const;
export const UNLOCK_STATUS = ['Unlocked', 'UnlockFailed', 'NotSupported'] as const;
export const AVAILABILITY_TYPE = ['Inoperative', 'Operative'] as const;
export const AVAILABILITY_STATUS = ['Accepted', 'Rejected', 'Scheduled'] as const;
export const CONFIGURATION_STATUS = [
  'Accepted',
  'Rejected',
  'RebootRequired',
  'NotSupported',
] as const;
export const CLEAR_CACHE_STATUS = ['Accepted', 'Rejected'] as const;
export const DATA_TRANSFER_STATUS = [
  'Accepted',
  'Rejected',
  'UnknownMessageId',
  'UnknownVendorId',
] as const;
export const MESSAGE_TRIGGER = [
  'BootNotification',
  'DiagnosticsStatusNotification',
  'FirmwareStatusNotification',
  'Heartbeat',
  'MeterValues',
  'StatusNotification',
] as const;
export const TRIGGER_MESSAGE_STATUS = ['Accepted', 'Rejected', 'NotImplemented'] as const;

// ── Actions ─────────────────────────────────────────────────────────────────

/** Charge-point-initiated actions the gateway answers. */
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

/** Central-system-initiated actions the gateway can dispatch. */
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

// ── Shared structures ───────────────────────────────────────────────────────

/**
 * Timestamps arrive as ISO 8601. Some chargers send a trailing space, omit the
 * zone, or (offline) send a date years in the past — we accept the string and
 * let the gateway decide, rather than rejecting the transaction outright.
 */
const isoDateTime = z.string().min(4);

export const idTagInfoSchema = z
  .object({
    status: z.enum(AUTHORIZATION_STATUS),
    expiryDate: isoDateTime.optional(),
    parentIdTag: z.string().optional(),
  })
  .passthrough();
export type IdTagInfo = z.infer<typeof idTagInfoSchema>;

export const sampledValueSchema = z
  .object({
    // Numeric on the wire but transported as a string (spec §7.28).
    value: z.union([z.string(), z.number()]),
    context: z.string().optional(),
    format: z.string().optional(),
    measurand: z.string().optional(),
    phase: z.string().optional(),
    location: z.string().optional(),
    unit: z.string().optional(),
  })
  .passthrough();
export type SampledValue = z.infer<typeof sampledValueSchema>;

export const meterValueSchema = z
  .object({
    timestamp: isoDateTime,
    sampledValue: z.array(sampledValueSchema).default([]),
  })
  .passthrough();
export type MeterValue = z.infer<typeof meterValueSchema>;

// ── Charge-point-initiated payloads ─────────────────────────────────────────

export const bootNotificationReqSchema = z
  .object({
    chargePointVendor: z.string(),
    chargePointModel: z.string(),
    chargePointSerialNumber: z.string().optional(),
    chargeBoxSerialNumber: z.string().optional(),
    firmwareVersion: z.string().optional(),
    iccid: z.string().optional(),
    imsi: z.string().optional(),
    meterType: z.string().optional(),
    meterSerialNumber: z.string().optional(),
  })
  .passthrough();
export type BootNotificationReq = z.infer<typeof bootNotificationReqSchema>;

export interface BootNotificationConf {
  status: (typeof REGISTRATION_STATUS)[number];
  currentTime: string;
  interval: number;
}

export const heartbeatReqSchema = z.object({}).passthrough();
export interface HeartbeatConf {
  currentTime: string;
}

export const statusNotificationReqSchema = z
  .object({
    connectorId: z.number().int().nonnegative(),
    errorCode: z.string(),
    status: z.string(),
    info: z.string().optional(),
    timestamp: isoDateTime.optional(),
    vendorId: z.string().optional(),
    vendorErrorCode: z.string().optional(),
  })
  .passthrough();
export type StatusNotificationReq = z.infer<typeof statusNotificationReqSchema>;

export const meterValuesReqSchema = z
  .object({
    connectorId: z.number().int().nonnegative(),
    transactionId: z.number().int().optional(),
    meterValue: z.array(meterValueSchema).default([]),
  })
  .passthrough();
export type MeterValuesReq = z.infer<typeof meterValuesReqSchema>;

export const authorizeReqSchema = z.object({ idTag: z.string() }).passthrough();
export type AuthorizeReq = z.infer<typeof authorizeReqSchema>;

export const startTransactionReqSchema = z
  .object({
    connectorId: z.number().int().positive(),
    idTag: z.string(),
    meterStart: z.number().int(),
    timestamp: isoDateTime,
    reservationId: z.number().int().optional(),
  })
  .passthrough();
export type StartTransactionReq = z.infer<typeof startTransactionReqSchema>;

export const stopTransactionReqSchema = z
  .object({
    transactionId: z.number().int(),
    meterStop: z.number().int(),
    timestamp: isoDateTime,
    idTag: z.string().optional(),
    reason: z.string().optional(),
    transactionData: z.array(meterValueSchema).optional(),
  })
  .passthrough();
export type StopTransactionReq = z.infer<typeof stopTransactionReqSchema>;

export const dataTransferReqSchema = z
  .object({
    vendorId: z.string(),
    messageId: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();
export type DataTransferReq = z.infer<typeof dataTransferReqSchema>;

// ── Central-system-initiated payloads ───────────────────────────────────────
// Validated on the way OUT: a malformed command is our bug, so these are
// strict, unlike the permissive inbound schemas above.

export const remoteStartTransactionReqSchema = z.object({
  idTag: z.string().min(1).max(20),
  connectorId: z.number().int().positive().optional(),
  chargingProfile: z.record(z.unknown()).optional(),
});

export const remoteStopTransactionReqSchema = z.object({
  transactionId: z.number().int(),
});

export const resetReqSchema = z.object({ type: z.enum(RESET_TYPE) });

export const unlockConnectorReqSchema = z.object({
  connectorId: z.number().int().positive(),
});

export const changeAvailabilityReqSchema = z.object({
  connectorId: z.number().int().nonnegative(),
  type: z.enum(AVAILABILITY_TYPE),
});

export const changeConfigurationReqSchema = z.object({
  key: z.string().max(50),
  value: z.string().max(500),
});

export const getConfigurationReqSchema = z.object({
  key: z.array(z.string()).optional(),
});

export const clearCacheReqSchema = z.object({}).default({});

export const triggerMessageReqSchema = z.object({
  requestedMessage: z.enum(MESSAGE_TRIGGER),
  connectorId: z.number().int().positive().optional(),
});

/** Outbound payload validators, keyed by action — used by the command bus. */
export const CS_REQUEST_SCHEMAS = {
  RemoteStartTransaction: remoteStartTransactionReqSchema,
  RemoteStopTransaction: remoteStopTransactionReqSchema,
  Reset: resetReqSchema,
  UnlockConnector: unlockConnectorReqSchema,
  ChangeAvailability: changeAvailabilityReqSchema,
  ChangeConfiguration: changeConfigurationReqSchema,
  GetConfiguration: getConfigurationReqSchema,
  ClearCache: clearCacheReqSchema,
  TriggerMessage: triggerMessageReqSchema,
} as const satisfies Record<CsAction, z.ZodTypeAny>;

/**
 * Every CS response carries an outcome, but under different key names. The
 * command bus uses this to decide accepted vs rejected without a per-action
 * branch.
 */
export function readCommandOutcome(action: CsAction, response: unknown): 'accepted' | 'rejected' {
  if (!response || typeof response !== 'object') return 'accepted';
  const r = response as Record<string, unknown>;

  // GetConfiguration has no status field — returning data at all is success.
  if (action === 'GetConfiguration') return 'accepted';

  const status = typeof r.status === 'string' ? r.status : null;
  if (!status) return 'accepted';

  return status === 'Accepted' || status === 'Scheduled' || status === 'Unlocked'
    ? 'accepted'
    : 'rejected';
}

// ── Redaction ───────────────────────────────────────────────────────────────

/** Configuration keys whose values are credentials and must never be persisted. */
export const SECRET_CONFIG_KEYS = ['authorizationkey'] as const;

export function isSecretConfigKey(key: unknown): boolean {
  return (
    typeof key === 'string' && SECRET_CONFIG_KEYS.includes(key.toLowerCase() as 'authorizationkey')
  );
}
