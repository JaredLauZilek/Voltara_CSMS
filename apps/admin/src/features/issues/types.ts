import type { Database } from '@voltara/shared/database.types';

export type Issue = Database['public']['Tables']['issues']['Row'];
export type IssueInsert = Database['public']['Tables']['issues']['Insert'];
export type IssueUpdate = Database['public']['Tables']['issues']['Update'];

export {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  ISSUE_SEVERITY_LABELS,
} from '@voltara/shared';
export type { IssueSeverity, IssueStatus } from '@voltara/shared';

/** An issue with the charger it points at, for lists. */
export interface IssueWithChargePoint extends Issue {
  charge_point_name: string | null;
  charge_point_identity: string | null;
}

/** Badge families for severities — the six existing colour pairs only. */
export const SEVERITY_BADGE: Record<string, string> = {
  low: 'Inactive',
  medium: 'Pending',
  high: 'Reserved',
  critical: 'Faulted',
};
