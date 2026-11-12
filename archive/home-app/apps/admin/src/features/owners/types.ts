import type { Database } from '@voltara/shared/database.types';

type VwChargerRow = Database['public']['Views']['vw_chargers']['Row'];

/** The columns the owners table needs from vw_chargers. */
export type OwnerChargerRow = Pick<
  VwChargerRow,
  | 'id'
  | 'owner_user_id'
  | 'owner_name'
  | 'owner_email'
  | 'last_seen_at'
  | 'dealer_name'
  | 'lifecycle'
>;

export interface OwnerRow {
  user_id: string;
  name: string;
  email: string | null;
  chargers: number;
  last_seen_at: string | null;
  dealers: string[];
  seen_24h: boolean;
}

const DAY_MS = 86_400_000;

/** One row per owner from the charger rows the caller can see. */
export function groupOwners(rows: OwnerChargerRow[], now = Date.now()): OwnerRow[] {
  const map = new Map<string, OwnerRow>();
  for (const r of rows) {
    if (!r.owner_user_id) continue;
    const existing = map.get(r.owner_user_id);
    const row: OwnerRow = existing ?? {
      user_id: r.owner_user_id,
      name: r.owner_name || r.owner_email || 'Unnamed',
      email: r.owner_email,
      chargers: 0,
      last_seen_at: null,
      dealers: [],
      seen_24h: false,
    };
    row.chargers += 1;
    if (r.last_seen_at && (!row.last_seen_at || r.last_seen_at > row.last_seen_at)) {
      row.last_seen_at = r.last_seen_at;
    }
    if (r.last_seen_at && now - new Date(r.last_seen_at).getTime() < DAY_MS) row.seen_24h = true;
    if (r.dealer_name && !row.dealers.includes(r.dealer_name)) row.dealers.push(r.dealer_name);
    map.set(r.owner_user_id, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
