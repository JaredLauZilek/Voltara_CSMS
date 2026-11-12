// GATT layout for HiCi wallboxes.
//
// STATUS: PLACEHOLDER. HiCi has not published its BLE profile. The UUIDs
// below are the 16-bit "serial over BLE" pattern most Chinese EVSE modules
// use (FFF0 service, FFF1 write, FFF2 notify). Confirm on a real unit with
// the GATT explorer and replace. Nothing outside this folder may hard-code a
// HiCi UUID.

export const HICI_GATT = {
  /** Advertised local-name prefix used to filter scans. Confirm on bench. */
  namePrefix: 'HICI',
  service: '0000fff0-0000-1000-8000-00805f9b34fb',
  /** App → charger. Write (with response preferred; fall back to without). */
  write: '0000fff1-0000-1000-8000-00805f9b34fb',
  /** Charger → app. Enable notifications after connect. */
  notify: '0000fff2-0000-1000-8000-00805f9b34fb',
  /** Standard Device Information Service — usually present, useful for firmware/serial. */
  deviceInfoService: '0000180a-0000-1000-8000-00805f9b34fb',
  firmwareRevision: '00002a26-0000-1000-8000-00805f9b34fb',
  serialNumber: '00002a25-0000-1000-8000-00805f9b34fb',
  /** Request on connect; Android negotiates up to 517, iOS picks its own. */
  requestedMtu: 247,
} as const;

/** How long to wait for a reply to a command before failing it. */
export const HICI_COMMAND_TIMEOUT_MS = 4000;
/** Status push cadence we ask for while a screen is open. */
export const HICI_STATUS_INTERVAL_MS = 1000;
