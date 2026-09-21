import type { Database } from '@voltara/shared/database.types';

export type DriverGroup = Database['public']['Tables']['driver_groups']['Row'];
export type DriverGroupInsert = Database['public']['Tables']['driver_groups']['Insert'];
export type DriverGroupMember = Database['public']['Tables']['driver_group_members']['Row'];

export interface DriverGroupWithCount extends DriverGroup {
  member_count: number;
}

export interface MemberWithNames extends DriverGroupMember {
  tag: string | null;
  tag_label: string | null;
  account_name: string | null;
}

export const GROUP_KINDS = ['residents', 'staff', 'fleet', 'partner', 'custom'] as const;
export const GROUP_KIND_LABELS: Record<string, string> = {
  residents: 'Residents',
  staff: 'Staff',
  fleet: 'Fleet',
  partner: 'Partner',
  custom: 'Custom',
};
