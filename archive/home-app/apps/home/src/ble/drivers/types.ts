import type { ChargerInfo, ChargerLink, PairingCredentials } from '@voltara/shared';
import type { ChargerProtocol } from '@voltara/shared';
import type { BleTransport } from '../transport';

/** Per-brand glue between the transport and a ChargerLink. */
export interface ChargerDriver {
  readonly protocol: ChargerProtocol;
  /** Whether this driver needs the radio at all (the simulator does not). */
  readonly needsBle: boolean;
  /**
   * Find the unit for `serial` and return the transport's device id.
   * Drivers that cannot match a serial from the advertisement may return the
   * first candidate; the auth step then proves identity.
   */
  discover(transport: BleTransport, serial: string, opts: { timeoutMs?: number }): Promise<string>;
  connect(
    transport: BleTransport,
    deviceId: string,
    credentials: PairingCredentials,
    hint: Partial<ChargerInfo>,
  ): Promise<ChargerLink>;
}
