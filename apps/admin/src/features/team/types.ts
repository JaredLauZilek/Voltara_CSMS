import type { Database } from '@voltara/shared/database.types';

export type TeamMember = Database['public']['Functions']['list_team_members']['Returns'][number];

export { TENANT_ROLES } from '@voltara/shared';
export type { TenantRole } from '@voltara/shared';

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const ROLE_HINTS: Record<string, string> = {
  owner: 'Everything, including managing owners and billing.',
  admin: 'Manage chargers, sites, tags, and the team (except owners).',
  operator: 'Run the network: remote operations, issues, notes. No configuration changes.',
  viewer: 'Read-only.',
};

/** Badge family per role (six colour pairs only). */
export const ROLE_BADGE: Record<string, string> = {
  owner: 'Active',
  admin: 'Charging',
  operator: 'Pending',
  viewer: 'Inactive',
};
