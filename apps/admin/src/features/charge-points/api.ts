// The ONLY place `supabase.from('charge_points' | 'connectors' | 'remote_commands' | …)`
// may appear for this feature.
import { supabase } from '@/shared/lib/supabase';
import type {
  ChargePoint,
  ChargePointUpdate,
  ChargePointWithConnectors,
  RegisterChargerInput,
  RegisteredCharger,
  RemoteCommand,
  RemoteOpInput,
  UptimeRow,
} from './types';

function withRelations(
  row: ChargePoint & {
    connectors?: ChargePointWithConnectors['connectors'] | null;
    locations?: { name: string; site_type: string } | null;
  },
): ChargePointWithConnectors {
  const { connectors, locations, ...cp } = row;
  return {
    ...(cp as ChargePoint),
    connectors: [...(connectors ?? [])].sort((a, b) => a.ocpp_connector_id - b.ocpp_connector_id),
    location_name: locations?.name ?? null,
    location_site_type: locations?.site_type ?? null,
  };
}

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
  return (data ?? []).map((row) => withRelations(row as Parameters<typeof withRelations>[0]));
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

/** Same shape as the board rows, for one charger. */
export async function getChargePointDetail(id: string): Promise<ChargePointWithConnectors | null> {
  const { data, error } = await supabase
    .from('charge_points')
    .select('*, connectors(*), locations(name, site_type)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return withRelations(data as Parameters<typeof withRelations>[0]);
}

export interface ConnectionEvent {
  id: number;
  event: string;
  close_reason: string | null;
  close_code: number | null;
  remote_address: string | null;
  gateway_instance: string | null;
  recorded_at: string;
}

/**
 * The commissioning debug tool: every connect, disconnect, and — critically —
 * every REJECTION with its reason (bad key, TLS required, decommissioned).
 * An empty list while a charger is "not working" is itself the diagnosis: the
 * unit never reached the gateway at all.
 */
export async function listConnectionEvents(
  chargePointId: string,
  limit = 50,
): Promise<ConnectionEvent[]> {
  const { data, error } = await supabase
    .from('charge_point_connection_log')
    .select('id, event, close_reason, close_code, remote_address, gateway_instance, recorded_at')
    .eq('charge_point_id', chargePointId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface StatusEvent {
  id: number;
  ocpp_connector_id: number;
  status: string;
  error_code: string | null;
  info: string | null;
  vendor_error_code: string | null;
  recorded_at: string;
}

export async function listStatusEvents(chargePointId: string, limit = 50): Promise<StatusEvent[]> {
  const { data, error } = await supabase
    .from('charge_point_status_log')
    .select('id, ocpp_connector_id, status, error_code, info, vendor_error_code, recorded_at')
    .eq('charge_point_id', chargePointId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface OcppFrame {
  id: number;
  direction: 'in' | 'out';
  message_type: number;
  action: string | null;
  ocpp_message_id: string | null;
  payload: unknown;
  error_code: string | null;
  error_description: string | null;
  recorded_at: string;
}

export async function listRecentFrames(chargePointId: string, limit = 50): Promise<OcppFrame[]> {
  const { data, error } = await supabase
    .from('ocpp_messages')
    .select(
      'id, direction, message_type, action, ocpp_message_id, payload, error_code, error_description, recorded_at',
    )
    .eq('charge_point_id', chargePointId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OcppFrame[];
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

// ── Remote operations (the command bus) ─────────────────────────────────────

/**
 * Issue a command. The admin app never talks to the gateway: it inserts a row,
 * the trigger notifies the gateway, and the gateway writes the outcome back
 * (CLAUDE.md §6). `requested_by` must be the caller — the insert policy checks it.
 */
export async function issueRemoteCommand(
  tenantId: string,
  userId: string,
  chargePointId: string,
  op: RemoteOpInput,
): Promise<RemoteCommand> {
  const { data, error } = await supabase
    .from('remote_commands')
    .insert({
      tenant_id: tenantId,
      charge_point_id: chargePointId,
      action: op.action,
      payload: op.payload as never,
      requested_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getRemoteCommand(id: string): Promise<RemoteCommand | null> {
  const { data, error } = await supabase
    .from('remote_commands')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRecentCommands(
  chargePointId: string,
  limit = 20,
): Promise<RemoteCommand[]> {
  const { data, error } = await supabase
    .from('remote_commands')
    .select('*')
    .eq('charge_point_id', chargePointId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ── Uptime ──────────────────────────────────────────────────────────────────

export async function listUptime(windowDays: number): Promise<UptimeRow[]> {
  const { data, error } = await supabase.rpc('charge_point_uptime', {
    p_window: `${windowDays} days`,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    charge_point_id: r.charge_point_id,
    online_seconds: Number(r.online_seconds),
    window_seconds: Number(r.window_seconds),
    uptime_pct: r.uptime_pct === null ? null : Number(r.uptime_pct),
  }));
}
