import type { Database } from '@voltara/shared/database.types';

type ViewRow = Database['public']['Views']['vw_chargers']['Row'];

/**
 * vw_chargers loses NOT NULL in the generated types (every view column is
 * nullable). These columns come straight from `chargers` and are never null,
 * so the row is narrowed once here and screens stop guarding them.
 */
export type ChargerRow = Omit<
  ViewRow,
  | 'id'
  | 'serial'
  | 'name'
  | 'lifecycle'
  | 'protocol'
  | 'rated_current_a'
  | 'phase_mode'
  | 'model_id'
  | 'created_at'
> & {
  id: string;
  serial: string;
  name: string;
  lifecycle: string;
  protocol: string;
  rated_current_a: number;
  phase_mode: string;
  model_id: string;
  created_at: string;
};
export type ChargerSettings = Database['public']['Tables']['charger_settings']['Row'];
export type ChargerMember = Database['public']['Tables']['charger_members']['Row'];
export type ChargerEvent = Database['public']['Tables']['charger_events']['Row'];
export type ChargerModel = Database['public']['Tables']['charger_models']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Json = Database['public']['Tables']['charger_events']['Row']['data'];
