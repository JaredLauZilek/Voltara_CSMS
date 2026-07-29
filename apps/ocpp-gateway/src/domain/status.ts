import { CONNECTOR_STATUSES, type ConnectorStatus } from '@voltara/shared';

const KNOWN = new Set<string>(CONNECTOR_STATUSES);

/**
 * Maps a wire status onto our protocol-agnostic connector status.
 *
 * OCPP 1.6 values map one-to-one today, but this is the seam where 2.0.1
 * (which reports a different set) and vendor misspellings get normalised, so
 * nothing downstream ever branches on a raw wire value. Anything unrecognised
 * becomes 'Unknown' rather than being written through — an unmapped status
 * silently entering the database is how dashboards start lying.
 */
export function normalizeConnectorStatus(raw: string | null | undefined): ConnectorStatus {
  if (!raw) return 'Unknown';

  if (KNOWN.has(raw)) return raw as ConnectorStatus;

  // Case-insensitive second pass: some firmware sends 'available'/'CHARGING'.
  const match = CONNECTOR_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  return match ?? 'Unknown';
}

/** Connector states that mean a session is physically delivering energy. */
export function isChargingStatus(status: ConnectorStatus): boolean {
  return status === 'Charging';
}

/**
 * Session status implied by a connector status, or null when the connector
 * status says nothing about the session (e.g. Available, Preparing).
 */
export function sessionStatusFor(
  status: ConnectorStatus,
): 'active' | 'suspended' | 'finishing' | null {
  switch (status) {
    case 'Charging':
      return 'active';
    case 'SuspendedEV':
    case 'SuspendedEVSE':
      return 'suspended';
    case 'Finishing':
      return 'finishing';
    default:
      return null;
  }
}
