// Place search for the location form. Photon (photon.komoot.io) is a free,
// keyless geocoder over OpenStreetMap — enough to fill an address and pin
// while prototyping. A paid provider with better local coverage (Google
// Places) is a pre-production decision: docs/roadmap.md §8.
import { MY_STATES } from './types';

export interface PlaceResult {
  id: string;
  name: string;
  /** One line under the name: street, area, city, state. */
  detail: string;
  address: string | null;
  city: string | null;
  state: string | null;
  /** False for places outside Malaysia, whose state is not one of ours. */
  inMalaysia: boolean;
  postcode: string | null;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
}

const STATE_ALIASES: Record<string, string> = { 'pulau pinang': 'Penang', malacca: 'Melaka' };

/** OSM's state name → our MY_STATES spelling; null outside Malaysia or if unknown. */
function toMyState(state: string | undefined): string | null {
  if (!state) return null;
  const s = state.toLowerCase();
  for (const [alias, name] of Object.entries(STATE_ALIASES)) if (s.includes(alias)) return name;
  return MY_STATES.find((m) => s.includes(m.toLowerCase())) ?? null;
}

/** "Subang Jaya City Council" → "Subang Jaya". */
const cleanCity = (c: string | undefined) =>
  c?.replace(/\s+(City|Municipal|District|Town) Council$/i, '').trim() || null;

// Peninsular Malaysia / Singapore, so nearer matches rank first.
const BIAS = { lat: 3.14, lon: 101.69 };

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('lat', String(BIAS.lat));
  url.searchParams.set('lon', String(BIAS.lon));
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Place search is unavailable right now.');
  const body = (await res.json()) as { features?: PhotonFeature[] };

  return (body.features ?? []).map((f, i) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const city = cleanCity(p.city ?? p.county);
    const area = p.district ?? p.locality;
    const name = p.name ?? (street || city || 'Unnamed place');
    return {
      id: `${p.osm_type ?? ''}${p.osm_id ?? i}`,
      name,
      detail: [street, area, city, p.state].filter((x) => x && x !== name).join(' · '),
      address: [street, area].filter(Boolean).join('\n') || null,
      city,
      state: p.countrycode === 'MY' ? toMyState(p.state) : null,
      inMalaysia: p.countrycode === 'MY',
      postcode: p.postcode ?? null,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    };
  });
}
