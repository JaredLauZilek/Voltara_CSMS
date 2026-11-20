// What the QR sticker on a charger carries, and how the driver app reads it.
//
// The code is a plain web address on Voltara's own neutral domain, so a phone
// camera without the app still lands somewhere useful, and the address
// outlives any change of hosting:
//
//   https://voltaracharging.com/c/<charge point ID>?gun=<connector number>
//
// The charge point ID is the one the charger dials in with. `gun` is optional:
// one sticker per gun on a twin charger, or one for the whole unit.

export const CHARGER_QR_BASE = 'https://voltaracharging.com/c/';

/** Same alphabet the database accepts for a charge point ID. */
const IDENTITY = /^[A-Za-z0-9*_=:+|@.-]{3,48}$/;

export interface ChargerQr {
  /** The charge point ID. */
  code: string;
  /** OCPP connector number (1 = Gun A), when the sticker names a gun. */
  connectorId: number | null;
}

export function chargerQrUrl(chargePointIdentity: string, connectorId?: number | null): string {
  const url = `${CHARGER_QR_BASE}${encodeURIComponent(chargePointIdentity)}`;
  return connectorId ? `${url}?gun=${connectorId}` : url;
}

/**
 * Reads a scanned code. Accepts the web address above, the app's own
 * `voltara://c/<id>` link, or a bare charge point ID typed in by hand.
 * Returns null for anything else (a menu, a payment QR, another network).
 */
export function parseChargerQr(text: string): ChargerQr | null {
  const raw = text.trim();
  if (!raw) return null;

  const link =
    /^(?:https?:\/\/(?:www\.|app\.)?voltaracharging\.com\/c\/|voltara:\/\/c\/)([^/?#]+)(?:\?([^#]*))?/i.exec(
      raw,
    );
  if (link) {
    let code: string;
    try {
      code = decodeURIComponent(link[1]!);
    } catch {
      return null;
    }
    if (!IDENTITY.test(code)) return null;
    const gun = /(?:^|&)gun=(\d{1,2})(?:&|$)/.exec(link[2] ?? '');
    const connectorId = gun ? Number(gun[1]) : null;
    return { code, connectorId: connectorId && connectorId > 0 ? connectorId : null };
  }

  // Anything that looks like another address is someone else's code.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null;
  return IDENTITY.test(raw) ? { code: raw, connectorId: null } : null;
}
