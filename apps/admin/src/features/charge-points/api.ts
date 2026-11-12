// The ONLY place `supabase.from('charge_points' | 'connectors' | 'remote_commands' | …)`
// may appear for this feature.
import { supabase } from '@/shared/lib/supabase';
import type {
  ChargePoint,
  ChargerModel,
  ChargePointUpdate,
  ChargePointWithConnectors,
  RegisterChargerInput,
  RegisteredCharger,
  RemoteCommand,
  RemoteOpInput,
  UptimeRow,
} from './types';

const CP_SELECT =
  '*, connectors(*), locations(name, site_type), charge_point_models(name, charge_point_vendors(name))';

function withRelations(
  row: ChargePoint & {
    connectors?: ChargePointWithConnectors['connectors'] | null;
    locations?: { name: string; site_type: string } | null;
    charge_point_models?: { name: string; charge_point_vendors: { name: string } | null } | null;
  },
): ChargePointWithConnectors {
  const { connectors, locations, charge_point_models: model, ...cp } = row;
  return {
    ...(cp as ChargePoint),
    connectors: [...(connectors ?? [])].sort((a, b) => a.ocpp_connector_id - b.ocpp_connector_id),
    location_name: locations?.name ?? null,
    location_site_type: locations?.site_type ?? null,
    model_label: model
      ? [model.charge_point_vendors?.name, model.name].filter(Boolean).join(' ')
      : null,
  };
}

/**
 * One round-trip for the whole board: charge points, their connectors, and the
 * location they belong to. RLS scopes it to the caller's tenant.
 */
export async function listChargePoints(): Promise<ChargePointWithConnectors[]> {
  const { data, error } = await supabase.from('charge_points').select(CP_SELECT).order('name');
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
    .select(CP_SELECT)
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

export interface StatusEvent {
  id: number;
  ocpp_connector_id: number;
  status: string;
  error_code: string | null;
  info: string | null;
  vendor_error_code: string | null;
  recorded_at: string;
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

/** A time window over one charger's logs; `to` null = up to now. */
export interface LogWindow {
  from: string;
  to: string | null;
}

export interface ChargerLog {
  connection: ConnectionEvent[];
  status: StatusEvent[];
  frames: OcppFrame[];
  /** The frame query hit its cap — older frames in the window were not loaded. */
  framesTruncated: boolean;
}

export const LOG_FRAME_LIMIT = 1000;

/**
 * Connection, status and frame logs for one charger over a window — the Logs
 * tab merges them into one timeline.
 *
 * Connection events are the commissioning debug tool: every connect,
 * disconnect, and — critically — every REJECTION with its reason (bad key,
 * TLS required, decommissioned). An empty list while a charger is "not
 * working" is itself the diagnosis: the unit never reached the gateway.
 */
export async function listChargerLog(
  chargePointId: string,
  window: LogWindow,
  includeHeartbeats: boolean,
): Promise<ChargerLog> {
  let connection = supabase
    .from('charge_point_connection_log')
    .select('id, event, close_reason, close_code, remote_address, gateway_instance, recorded_at')
    .eq('charge_point_id', chargePointId)
    .gte('recorded_at', window.from);
  let status = supabase
    .from('charge_point_status_log')
    .select('id, ocpp_connector_id, status, error_code, info, vendor_error_code, recorded_at')
    .eq('charge_point_id', chargePointId)
    .gte('recorded_at', window.from);
  let frames = supabase
    .from('ocpp_messages')
    .select(
      'id, direction, message_type, action, ocpp_message_id, payload, error_code, error_description, recorded_at',
    )
    .eq('charge_point_id', chargePointId)
    .gte('recorded_at', window.from);
  if (window.to) {
    connection = connection.lte('recorded_at', window.to);
    status = status.lte('recorded_at', window.to);
    frames = frames.lte('recorded_at', window.to);
  }
  // Heartbeats are most of a quiet charger's traffic. `neq` alone would also
  // drop rows with no action (CALLERRORs we could not match), hence the `or`.
  if (!includeHeartbeats) frames = frames.or('action.is.null,action.neq.Heartbeat');

  const [c, st, f] = await Promise.all([
    connection.order('id', { ascending: false }).limit(500),
    status.order('id', { ascending: false }).limit(1000),
    frames.order('id', { ascending: false }).limit(LOG_FRAME_LIMIT),
  ]);
  if (c.error) throw c.error;
  if (st.error) throw st.error;
  if (f.error) throw f.error;

  return {
    connection: c.data ?? [],
    status: st.data ?? [],
    frames: (f.data ?? []) as OcppFrame[],
    framesTruncated: (f.data?.length ?? 0) >= LOG_FRAME_LIMIT,
  };
}

/**
 * Registration goes through a database function, not an insert: the auth key
 * must be generated and hashed server-side and returned exactly once. The
 * browser never picks the secret.
 */
export async function registerChargePoint(input: RegisterChargerInput): Promise<RegisteredCharger> {
  const { data, error } = await supabase.rpc('register_charge_point', {
    p_serial_number: input.serialNumber,
    // The function's parameters have SQL defaults, so they are typed optional:
    // omit them rather than passing null.
    p_location_id: input.locationId ?? undefined,
    p_ocpp_identity: input.ocppIdentity ?? undefined,
    p_connector_count: input.guns.length,
    p_connector_type: input.guns[0]?.connectorType ?? 'Type2',
    p_max_kw: input.maxKw ?? undefined,
    p_model_id: input.modelId ?? undefined,
    p_guns: input.guns.map((g) => ({
      connector_type: g.connectorType,
      parking_lot: g.parkingLot.trim() || null,
    })),
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

/** The brand/model catalogue for the Add Charger search, brand then model order. */
export async function listChargerModels(): Promise<ChargerModel[]> {
  const { data, error } = await supabase
    .from('charge_point_models')
    .select('id, name, power_kw, connector_count, connector_types, charge_point_vendors(name)');
  if (error) throw error;
  return (data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name,
      vendor: (m.charge_point_vendors as { name: string } | null)?.name ?? 'Other',
      power_kw: m.power_kw,
      connector_count: m.connector_count,
      connector_types: m.connector_types,
    }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
}

/** Sets the car park lot on each listed gun (at most 16 per charger). */
export async function updateGunLots(
  lots: { id: string; parking_lot: string | null }[],
): Promise<void> {
  const results = await Promise.all(
    lots.map(({ id, parking_lot }) =>
      supabase.from('connectors').update({ parking_lot }).eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
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
  if (error) {
    // The per-operator unique index on serials; say it in words.
    if (error.code === '23505' && error.message.includes('serial')) {
      throw new Error('That serial number is already registered to another charger.');
    }
    throw error;
  }
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
