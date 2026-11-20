// The map shows sites, not individual chargers: one pin per car park, with the
// chargers inside it. Pure grouping over the discovery rows.
import type { ConnectorInfo, NearbyCharger } from './api';

const DC_TYPES = ['CCS2', 'CCS1', 'CHAdeMO', 'GBT_DC'];

export interface Site {
  location_id: string;
  site_name: string;
  operator_name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  tariff_text: string | null;
  chargers: NearbyCharger[];
  /** Guns that could take a car right now. */
  available: number;
  guns: number;
  online: boolean;
  maxKw: number | null;
  hasDc: boolean;
}

const usable = (c: NearbyCharger, k: ConnectorInfo) =>
  c.connection_state === 'online' && k.status === 'Available';

export function groupSites(chargers: NearbyCharger[]): Site[] {
  const byId = new Map<string, Site>();
  for (const c of chargers) {
    let site = byId.get(c.location_id);
    if (!site) {
      site = {
        location_id: c.location_id,
        site_name: c.site_name,
        operator_name: c.operator_name,
        address: c.address,
        city: c.city,
        lat: c.lat,
        lng: c.lng,
        distance_km: c.distance_km,
        tariff_text: c.tariff_text,
        chargers: [],
        available: 0,
        guns: 0,
        online: false,
        maxKw: null,
        hasDc: false,
      };
      byId.set(c.location_id, site);
    }
    site.chargers.push(c);
    site.online ||= c.connection_state === 'online';
    for (const k of c.connectors) {
      site.guns += 1;
      if (usable(c, k)) site.available += 1;
      if (k.max_kw != null) site.maxKw = Math.max(site.maxKw ?? 0, Number(k.max_kw));
      if (DC_TYPES.includes(k.type)) site.hasDc = true;
    }
  }
  return [...byId.values()];
}

export type SiteState = 'available' | 'busy' | 'offline';

export function siteState(s: Site): SiteState {
  if (!s.online) return 'offline';
  return s.available > 0 ? 'available' : 'busy';
}

export function formatDistance(km: number | null): string | null {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
