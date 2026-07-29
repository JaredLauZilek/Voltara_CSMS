import type { Quirks } from './quirks/index.js';

/**
 * A charger's live socket, as the rest of the gateway sees it.
 *
 * `call` is a function rather than the ocpp-rpc client so nothing outside the
 * protocol module holds a transport object — the same reason wire types stop
 * at src/ocpp/v16 (CLAUDE.md §6). When OCPP 2.0.1 lands it supplies its own
 * `call` and the command bus is unchanged.
 */
export interface ChargerConnection {
  identity: string;
  chargePointId: string;
  tenantId: string;
  quirks: Quirks;
  remoteAddress: string | null;
  connectedAt: Date;
  /**
   * Whether the socket is genuinely still open.
   *
   * The registry entry is removed on the 'close' event, but a socket can be
   * dead before that fires — half-open TCP on a mobile link is the normal case,
   * not the exception. Without this check the command bus would claim a command
   * for a zombie connection and sit on it until the call timeout, silently
   * swallowing an operator's remote stop.
   */
  isOpen: () => boolean;
  call: (action: string, payload: unknown) => Promise<unknown>;
  close: () => Promise<void>;
}

/**
 * In-memory index of the chargers this process holds.
 *
 * Authoritative only for this instance — `charge_point_connections` is the
 * cross-instance view. Kept in memory because the command bus needs to answer
 * "do I hold this charger?" on every notification, and that must not be a
 * database round-trip.
 */
export class ConnectionRegistry {
  private readonly byIdentity = new Map<string, ChargerConnection>();
  private readonly byChargePointId = new Map<string, ChargerConnection>();

  add(connection: ChargerConnection): void {
    // A reconnect before the old socket's cleanup ran must not leave the stale
    // entry indexed; the newest connection always wins.
    this.remove(connection.identity);
    this.byIdentity.set(connection.identity, connection);
    this.byChargePointId.set(connection.chargePointId, connection);
  }

  remove(identity: string): ChargerConnection | null {
    const existing = this.byIdentity.get(identity);
    if (!existing) return null;
    this.byIdentity.delete(identity);
    // Only clear the reverse index if it still points at this same socket.
    if (this.byChargePointId.get(existing.chargePointId) === existing) {
      this.byChargePointId.delete(existing.chargePointId);
    }
    return existing;
  }

  getByIdentity(identity: string): ChargerConnection | null {
    return this.byIdentity.get(identity) ?? null;
  }

  getByChargePointId(chargePointId: string): ChargerConnection | null {
    return this.byChargePointId.get(chargePointId) ?? null;
  }

  all(): ChargerConnection[] {
    return [...this.byIdentity.values()];
  }

  get size(): number {
    return this.byIdentity.size;
  }
}
