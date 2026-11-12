import type { Database } from '@voltara/shared/database.types';

export type ChargerModel = Database['public']['Tables']['charger_models']['Row'];
export type ChargerModelInsert = Database['public']['Tables']['charger_models']['Insert'];
export type ChargerModelUpdate = Database['public']['Tables']['charger_models']['Update'];
export type FirmwareRelease = Database['public']['Tables']['firmware_releases']['Row'];
export type FirmwareReleaseInsert = Database['public']['Tables']['firmware_releases']['Insert'];

export { CHARGER_PROTOCOLS } from '@voltara/shared';

/** Mirrors the CHECK constraint on charger_models.connector_type. */
export const CONNECTOR_TYPES = ['Type2', 'Type1', 'GBT'] as const;
export const PHASE_OPTIONS = [1, 3] as const;

/** What the model modal edits. */
export interface ModelFormRow {
  brand: string;
  model: string;
  name: string;
  rated_kw: number;
  rated_amps: number;
  phases: number;
  protocol: string;
  connector_type: string;
  ble_name_prefix: string | null;
  is_active: boolean;
}
