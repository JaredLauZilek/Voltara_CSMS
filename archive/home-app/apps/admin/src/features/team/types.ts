import type { Database } from '@voltara/shared/database.types';

export type Person = Database['public']['Views']['vw_people']['Row'];
export type TeamPerson = Person & { user_id: string };

export { STAFF_ROLES, DEALER_ROLES, DEALER_ROLE_LABELS } from '@voltara/shared';
export type { StaffRole, DealerRole } from '@voltara/shared';

export const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  support: 'Support',
  viewer: 'Viewer',
};

export const STAFF_ROLE_HINTS: Record<string, string> = {
  admin: 'Everything, including the team, dealers and models.',
  support: 'Register, commission and decommission chargers; work tickets.',
  viewer: 'Read-only.',
};

export const DEALER_ROLE_HINTS: Record<string, string> = {
  dealer_admin: "Manage the dealer's people and details; register and commission chargers.",
  installer: 'Register and commission chargers for this dealer.',
};

/** Badge family per role (six colour pairs only). */
export const STAFF_ROLE_PILL: Record<string, string> = {
  admin: 'Active',
  support: 'In Progress',
  viewer: 'Inactive',
};
export const DEALER_ROLE_PILL: Record<string, string> = {
  dealer_admin: 'Active',
  installer: 'Scheduled',
};

export interface InviteInput {
  email: string;
  kind: 'staff' | 'dealer';
  role: string;
  dealerId?: string;
}
