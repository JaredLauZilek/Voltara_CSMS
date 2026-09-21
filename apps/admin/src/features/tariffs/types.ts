import type { Database } from '@voltara/shared/database.types';
import type { billing } from '@voltara/shared';

export type Tariff = Database['public']['Tables']['tariffs']['Row'];
export type TariffInsert = Database['public']['Tables']['tariffs']['Insert'];
export type TariffUpdate = Database['public']['Tables']['tariffs']['Update'];
export type TariffVersion = Database['public']['Tables']['tariff_versions']['Row'];
export type TariffAssignment = Database['public']['Tables']['tariff_assignments']['Row'];
export type TaxProfile = Database['public']['Tables']['tax_profiles']['Row'];
export type TaxProfileInsert = Database['public']['Tables']['tax_profiles']['Insert'];

/** A tariff with its latest version and how many places it is assigned. */
export interface TariffWithLatest extends Tariff {
  latest: TariffVersion | null;
  version_count: number;
  assignment_count: number;
}

export interface TariffDetail extends Tariff {
  versions: TariffVersion[];
  assignments: AssignmentWithNames[];
}

export interface AssignmentWithNames extends TariffAssignment {
  location_name: string | null;
  charge_point_name: string | null;
  connector_label: string | null;
  driver_group_name: string | null;
}

/** What the editor submits to create the next version. */
export interface NewVersionInput {
  elements: billing.TariffElement[];
  tax_included: boolean;
  tax_profile_id: string | null;
  min_price_sen: number | null;
  max_price_sen: number | null;
  display_text: string | null;
}

export interface NewAssignmentInput {
  scope_type: 'tenant' | 'location' | 'charge_point' | 'connector';
  location_id: string | null;
  charge_point_id: string | null;
  connector_id: string | null;
  audience: 'all' | 'ad_hoc' | 'group';
  driver_group_id: string | null;
  priority: number;
  valid_from: string;
  valid_to: string | null;
}

export const SCOPE_LABELS: Record<string, string> = {
  tenant: 'Whole operator',
  location: 'Site',
  charge_point: 'Charger',
  connector: 'Connector',
};

export const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Everyone',
  ad_hoc: 'Ad-hoc drivers (not in any group)',
  group: 'A driver group',
};

export const TARIFF_FILTERS = ['Active', 'Draft', 'Archived', 'All'] as const;

/** Badge families (six colour pairs only). */
export const TARIFF_STATUS_BADGE: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Inactive',
};

export function elementsOf(version: TariffVersion | null | undefined): billing.TariffElement[] {
  return (version?.elements as unknown as billing.TariffElement[] | undefined) ?? [];
}
