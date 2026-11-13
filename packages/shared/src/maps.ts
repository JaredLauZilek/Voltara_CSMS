// Navigation deep links from a site's coordinates. Pure string building, so
// the admin (checking a pin) and the driver app (directions) share one form.

export interface MapLinks {
  googleMaps: string;
  waze: string;
}

/** Links that open turn-by-turn directions to the point; null without coordinates. */
export function mapLinks(
  lat: number | null | undefined,
  lng: number | null | undefined,
): MapLinks | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const ll = `${lat},${lng}`;
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
  };
}

/**
 * Coordinates from what an operator pastes: a "3.0725, 101.6066" pair (Google
 * Maps → right-click → copy) or a full Google Maps URL. The place pin
 * (`!3d…!4d…`) wins over the viewport centre (`@lat,lng`). Short share links
 * (maps.app.goo.gl) carry no coordinates and return null.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const t = text.trim();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}
