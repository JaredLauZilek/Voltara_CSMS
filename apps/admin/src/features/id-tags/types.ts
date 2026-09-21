import type { Database } from '@voltara/shared/database.types';

export type IdTag = Database['public']['Tables']['id_tags']['Row'];
export type IdTagInsert = Database['public']['Tables']['id_tags']['Insert'];
export type IdTagUpdate = Database['public']['Tables']['id_tags']['Update'];

export { ID_TAG_STATUSES, ID_TAG_KINDS } from '@voltara/shared';
export type { IdTagStatus, IdTagKind } from '@voltara/shared';

export const KIND_LABELS: Record<string, string> = {
  rfid: 'RFID card',
  virtual: 'Virtual (app)',
  mac: 'Vehicle MAC',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  blocked: 'Blocked',
  expired: 'Expired',
};

/** A tag with the payer it bills to. */
export interface IdTagWithAccount extends IdTag {
  billing_account_name: string | null;
}
