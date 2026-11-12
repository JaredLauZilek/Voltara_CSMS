import type { Database } from '@voltara/shared/database.types';
import type { DealerRole } from '@voltara/shared';

export type Dealer = Database['public']['Tables']['dealers']['Row'];
export type DealerInsert = Database['public']['Tables']['dealers']['Insert'];
export type DealerUpdate = Database['public']['Tables']['dealers']['Update'];
export type Person = Database['public']['Views']['vw_people']['Row'];
export type DealerPerson = Person & { user_id: string };
export type DealerMembership = Pick<Person, 'user_id' | 'dealer_id'>;

export { DEALER_ROLES, DEALER_ROLE_LABELS } from '@voltara/shared';
export type { DealerRole } from '@voltara/shared';

export interface InviteInput {
  email: string;
  role: DealerRole;
  dealerId: string;
}

/** What the dealer modal edits. Server-managed columns are left out. */
export interface DealerFormRow {
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_first_party: boolean;
  status: string;
}

export const DEALER_STATUSES = ['active', 'inactive'] as const;
export const DEALER_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

/** Badge family per dealer role (six colour pairs only). */
export const DEALER_ROLE_PILL: Record<string, string> = {
  dealer_admin: 'Active',
  installer: 'Scheduled',
};

export const DEALER_ROLE_HINTS: Record<string, string> = {
  dealer_admin: "Manage the dealer's people and details; register and commission chargers.",
  installer: 'Register and commission chargers for this dealer.',
};
