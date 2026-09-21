import type { Database } from '@voltara/shared/database.types';

export type BillingAccount = Database['public']['Tables']['billing_accounts']['Row'];
export type BillingAccountInsert = Database['public']['Tables']['billing_accounts']['Insert'];
export type BillingAccountUpdate = Database['public']['Tables']['billing_accounts']['Update'];
export type SiteHostAgreement = Database['public']['Tables']['site_host_agreements']['Row'];
export type SiteHostAgreementInsert =
  Database['public']['Tables']['site_host_agreements']['Insert'];

export interface BillingAccountWithCounts extends BillingAccount {
  tag_count: number;
  location_name: string | null;
}

export interface AgreementWithLocation extends SiteHostAgreement {
  location_name: string | null;
}

export const ACCOUNT_KINDS = ['individual', 'corporate', 'site_host'] as const;
export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  individual: 'Individual',
  corporate: 'Corporate',
  site_host: 'Site host (JMB / landlord)',
};

export const BILLING_MODELS = [
  'postpaid_invoice',
  'postpaid_card',
  'preauth',
  'wallet',
  'corporate',
  'subscription',
  'voucher',
  'open',
] as const;
export const BILLING_MODEL_LABELS: Record<string, string> = {
  postpaid_invoice: 'Monthly invoice',
  postpaid_card: 'Card on file, charged after each session',
  preauth: 'Card pre-authorisation per session',
  wallet: 'Prepaid wallet',
  corporate: 'Corporate account (pooled, invoiced)',
  subscription: 'Subscription plan',
  voucher: 'Vouchers',
  open: 'Free / open access',
};

export const ELECTRICITY_BASIS_LABELS: Record<string, string> = {
  none: 'Not accounted here',
  deduct_from_share: 'Deducted from the host share (operator pays utility)',
  reimburse_host: 'Reimbursed to the host (host pays utility)',
};

export const ACCOUNT_FILTERS = ['All', 'Individual', 'Corporate', 'Site host'] as const;

export const ACCOUNT_STATUS_BADGE: Record<string, string> = {
  active: 'Active',
  suspended: 'Pending',
  closed: 'Inactive',
};
