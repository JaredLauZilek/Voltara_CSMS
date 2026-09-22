// The ONLY place the discovery / site / join / start RPCs are called.
import { supabase } from '@/lib/supabase';

export interface ConnectorInfo {
  id: string;
  ocpp_connector_id: number;
  type: string;
  max_kw: number | null;
  status: string;
}

export interface NearbyCharger {
  location_id: string;
  tenant_id: string;
  operator_name: string;
  site_name: string;
  site_type: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  charge_point_id: string;
  charge_point_name: string;
  connection_state: string;
  connectors: ConnectorInfo[];
  tariff_text: string | null;
  is_free: boolean;
}

export async function nearbyChargers(
  lat: number | null,
  lng: number | null,
): Promise<NearbyCharger[]> {
  const { data, error } = await supabase.rpc('driver_nearby_chargers', {
    p_lat: lat ?? undefined,
    p_lng: lng ?? undefined,
    p_radius_km: lat == null ? 100_000 : 50,
    p_limit: 200,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    connectors: (r.connectors as unknown as ConnectorInfo[]) ?? [],
  }));
}

export interface SiteContext {
  location_id: string;
  tenant_id: string;
  site_name: string;
  operator_name: string;
  logo_path: string | null;
  theme: Record<string, unknown>;
  support_email: string | null;
  support_phone: string | null;
  member_tag_id: string | null;
  groups: string[];
}

export async function siteContext(locationId: string): Promise<SiteContext> {
  const { data, error } = await supabase.rpc('driver_site_context', { p_location_id: locationId });
  if (error) throw error;
  return data as unknown as SiteContext;
}

export async function joinSite(
  code: string,
): Promise<{ tenant_id: string; location_id: string | null; label: string | null }> {
  const { data, error } = await supabase.rpc('driver_join_site', { p_code: code });
  if (error) throw error;
  return data as unknown as { tenant_id: string; location_id: string | null; label: string | null };
}

export async function startSession(
  chargePointId: string,
  connectorId: number,
): Promise<{ command_id: string }> {
  const { data, error } = await supabase.rpc('driver_start_session', {
    p_charge_point_id: chargePointId,
    p_ocpp_connector_id: connectorId,
  });
  if (error) throw error;
  return data as unknown as { command_id: string };
}

export async function stopSession(sessionId: string): Promise<{ command_id: string }> {
  const { data, error } = await supabase.rpc('driver_stop_session', { p_session_id: sessionId });
  if (error) throw error;
  return data as unknown as { command_id: string };
}

export async function commandStatus(
  commandId: string,
): Promise<{ status: string; error: string | null } | null> {
  const { data, error } = await supabase
    .from('remote_commands')
    .select('status, error')
    .eq('id', commandId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
