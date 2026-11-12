import type { Database } from '@voltara/shared/database.types';

export type AuditRow = Database['public']['Tables']['audit_log']['Row'];
export type PersonLite = Pick<
  Database['public']['Views']['vw_people']['Row'],
  'user_id' | 'full_name' | 'email'
>;

const MAX_JSON = 240;

/** One-line JSON for the change column, truncated so a row stays a row. */
export function compactJson(value: unknown): string {
  if (value == null) return '';
  const s = JSON.stringify(value);
  return s.length > MAX_JSON ? `${s.slice(0, MAX_JSON)}…` : s;
}
