// The ONLY place `supabase.from('charge_points' | 'connectors')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type {
  ChargePoint,
  ChargePointUpdate,
  ChargePointWithConnectors,
  RegisterChargerInput,
  RegisteredCharger,
} from './types';

/**
 * One round-trip for the whole board: charge points, their connectors, and the
 * location they belong to. RLS scopes it to the caller's tenant.
 */
export async function listChargePoints(): Promise<ChargePointWithConnectors[]> {
  const { data, error } = await supabase
    .from('charge_points')
    .select('*, connectors(*), locations(name, site_type)')
    .order('name');
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { connectors, locations, ...cp } = row as typeof row & {
      connectors: ChargePointWithConnectors['connectors'];
      locations: { name: string; site_type: string } | null;
    };
    return {
      ...(cp as ChargePoint),
      connectors: [...(connectors ?? [])].sort((a, b) => a.ocpp_connector_id - b.ocpp_connector_id),
      location_name: locations?.name ?? null,
      location_site_type: locations?.site_type ?? null,
    };
  });
}

export async function getChargePoint(id: string): Promise<ChargePoint | null> {
  const { data, error } = await supabase
    .from('charge_points')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Registration goes through a database function, not an insert: the auth key
 * must be generated and hashed server-side and returned exactly once. The
 * browser never picks the secret.
 */
export async function registerChargePoint(input: RegisterChargerInput): Promise<RegisteredCharger> {
  const { data, error } = await supabase.rpc('register_charge_point', {
    p_name: input.name,
    // The function's parameters have SQL defaults, so they are typed optional:
    // omit them rather than passing null.
    p_location_id: input.locationId ?? undefined,
    p_ocpp_identity: input.ocppIdentity ?? undefined,
    p_connector_count: input.connectorCount,
    p_connector_type: input.connectorType,
    p_max_kw: input.maxKw ?? undefined,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Registration returned no charger.');

  return {
    chargePointId: row.charge_point_id as string,
    ocppIdentity: row.ocpp_identity as string,
    authKey: row.auth_key as string,
  };
}

export async function updateChargePoint(
  id: string,
  patch: ChargePointUpdate,
): Promise<ChargePoint> {
  const { data, error } = await supabase
    .from('charge_points')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChargePoint(id: string): Promise<void> {
  const { error } = await supabase.from('charge_points').delete().eq('id', id);
  if (error) throw error;
}
