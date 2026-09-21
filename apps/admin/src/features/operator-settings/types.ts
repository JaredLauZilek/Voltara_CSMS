import type { Database } from '@voltara/shared/database.types';

export type TenantSettings = Database['public']['Tables']['tenant_settings']['Row'];
export type TenantSettingsInsert = Database['public']['Tables']['tenant_settings']['Insert'];

/** The editable identity fields — what prints as the seller on every document. */
export type OperatorForm = Pick<
  TenantSettingsInsert,
  | 'app_name'
  | 'legal_name'
  | 'business_registration_no'
  | 'tax_identification_no'
  | 'sst_registration_no'
  | 'address'
  | 'support_email'
  | 'support_phone'
>;
