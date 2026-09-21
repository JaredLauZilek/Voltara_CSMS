import type { Database } from '@voltara/shared/database.types';

export type Document = Database['public']['Tables']['documents']['Row'];

export interface DocumentWithNames extends Document {
  account_name: string | null;
  location_name: string | null;
}

export interface DocumentLine {
  description: string;
  quantity?: number;
  unit?: string;
  unit_price_sen?: number;
  amount_excl_sen?: number;
  tax_rate_bps?: number;
  tax_sen?: number;
  amount_incl_sen?: number;
  /** Settlement lines carry a signed amount and a kind. */
  amount_sen?: number;
  kind?: 'info' | 'credit' | 'debit';
  cdr_id?: string;
  date?: string;
}

export interface Party {
  name?: string | null;
  legal_name?: string | null;
  trading_name?: string | null;
  business_registration_no?: string | null;
  tax_identification_no?: string | null;
  sst_registration_no?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
}

export const KIND_LABELS: Record<string, string> = {
  receipt: 'Receipt',
  invoice: 'Invoice',
  credit_note: 'Credit note',
  settlement: 'Settlement statement',
};

export const DOC_FILTERS = ['All', 'Invoices', 'Receipts', 'Settlements', 'Drafts'] as const;

export const DOC_STATUS_BADGE: Record<string, string> = {
  draft: 'Draft',
  issued: 'Completed',
  void: 'Cancelled',
};

export function linesOf(doc: Document): DocumentLine[] {
  return (doc.lines as unknown as DocumentLine[] | null) ?? [];
}
export function partyOf(v: unknown): Party {
  return (v as Party | null) ?? {};
}
