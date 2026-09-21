// The ONLY place the revenue_summary RPC is called.
import { supabase } from '@/shared/lib/supabase';

export interface RevenueRow {
  location_id: string | null;
  location_name: string | null;
  charge_point_id: string | null;
  charge_point_name: string | null;
  driver_group_id: string | null;
  driver_group_name: string | null;
  sessions: number;
  unbillable_sessions: number;
  energy_wh: number;
  idle_s: number;
  subtotal_sen: number;
  tax_sen: number;
  total_sen: number;
}

export async function revenueSummary(from: string, to: string): Promise<RevenueRow[]> {
  const { data, error } = await supabase.rpc('revenue_summary', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    sessions: Number(r.sessions),
    unbillable_sessions: Number(r.unbillable_sessions),
    energy_wh: Number(r.energy_wh),
    idle_s: Number(r.idle_s),
    subtotal_sen: Number(r.subtotal_sen),
    tax_sen: Number(r.tax_sen),
    total_sen: Number(r.total_sen),
  }));
}
