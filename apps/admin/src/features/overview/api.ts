// The ONLY place `supabase.from('charge_point_status_log')` may appear for the dashboard feed.
import { supabase } from '@/shared/lib/supabase';

export interface ActivityRow {
  id: number;
  charge_point_id: string;
  ocpp_connector_id: number;
  status: string;
  error_code: string | null;
  info: string | null;
  recorded_at: string;
  charge_points: { name: string; ocpp_identity: string } | null;
}

/** The latest connector status changes across the tenant — the "what just happened" feed. */
export async function listRecentActivity(limit = 25): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('charge_point_status_log')
    .select(
      'id, charge_point_id, ocpp_connector_id, status, error_code, info, recorded_at, charge_points(name, ocpp_identity)',
    )
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ActivityRow[];
}
