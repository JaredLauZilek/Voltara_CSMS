import type { Db } from './client.js';

export interface ChargePointAuthRow {
  id: string;
  tenant_id: string;
  ocpp_identity: string;
  lifecycle: 'pending' | 'active' | 'decommissioned';
  security_profile: number;
  heartbeat_interval_s: number;
  location_id: string | null;
  has_key: boolean;
  key_ok: boolean;
  vendor_name: string | null;
  vendor_quirks: Record<string, unknown> | null;
  quirks_override: Record<string, unknown> | null;
}

/**
 * Resolves a charger by the identity in its WebSocket path and verifies the
 * Basic Auth key in the same round-trip.
 *
 * The comparison happens in Postgres via pgcrypto rather than in Node: the key
 * is a high-entropy machine-generated secret, keeping the hash function in one
 * place avoids a native crypto dependency in the container image, and this
 * query is one we have to make anyway.
 *
 * `has_key` and `key_ok` are returned separately so the caller can distinguish
 * "never registered a key" from "wrong key" in the connection log without
 * telling the client which it was.
 */
export async function findChargePointForAuth(
  db: Db,
  identity: string,
  password: string | null,
): Promise<ChargePointAuthRow | null> {
  const rows = await db<ChargePointAuthRow[]>`
    select
      cp.id,
      cp.tenant_id,
      cp.ocpp_identity,
      cp.lifecycle,
      cp.security_profile,
      cp.heartbeat_interval_s,
      cp.location_id,
      cp.auth_key_hash is not null as has_key,
      coalesce(
        cp.auth_key_hash is not null
          and ${password}::text is not null
          and cp.auth_key_hash = crypt(${password}::text, cp.auth_key_hash),
        false
      ) as key_ok,
      v.name as vendor_name,
      v.quirks as vendor_quirks,
      cp.quirks_override
    from public.charge_points cp
    left join public.charge_point_models m on m.id = cp.model_id
    left join public.charge_point_vendors v on v.id = m.vendor_id
    where cp.ocpp_identity = ${identity}
    limit 1
  `;
  return rows[0] ?? null;
}

export interface BootUpdate {
  vendor: string;
  model: string;
  serialNumber?: string | null;
  firmwareVersion?: string | null;
}

/** Records what the charger reported at boot and marks it online. */
export async function applyBootNotification(
  db: Db,
  chargePointId: string,
  boot: BootUpdate,
): Promise<void> {
  await db`
    update public.charge_points set
      vendor_reported = ${boot.vendor},
      model_reported = ${boot.model},
      serial_number = coalesce(${boot.serialNumber ?? null}, serial_number),
      firmware_version = coalesce(${boot.firmwareVersion ?? null}, firmware_version),
      last_boot_at = now(),
      last_seen_at = now(),
      connection_state = 'online',
      -- A charger that has never booted is 'pending' from registration; the
      -- first successful boot is what makes it real.
      lifecycle = case when lifecycle = 'pending' then 'active' else lifecycle end
    where id = ${chargePointId}
  `;
}

export async function touchLastSeen(db: Db, chargePointId: string): Promise<void> {
  await db`
    update public.charge_points
    set last_seen_at = now(), connection_state = 'online'
    where id = ${chargePointId}
  `;
}

export async function markOffline(db: Db, chargePointId: string): Promise<void> {
  await db`
    update public.charge_points
    set connection_state = 'offline'
    where id = ${chargePointId}
  `;
  // A charger that dropped cannot still have live connectors.
  await db`
    update public.connectors
    set status = 'Offline', status_updated_at = now()
    where charge_point_id = ${chargePointId} and status <> 'Offline'
  `;
}

export async function saveConfigurationSnapshot(
  db: Db,
  chargePointId: string,
  config: Record<string, unknown>,
): Promise<void> {
  await db`
    update public.charge_points
    set config = ${db.json(config as never)}
    where id = ${chargePointId}
  `;
}

/** Merges keys into the stored snapshot, or replaces it wholesale. */
export async function mergeConfigurationSnapshot(
  db: Db,
  chargePointId: string,
  config: Record<string, unknown>,
  options: { replace: boolean },
): Promise<void> {
  if (options.replace) {
    await saveConfigurationSnapshot(db, chargePointId, config);
    return;
  }
  await db`
    update public.charge_points
    set config = config || ${db.json(config as never)}
    where id = ${chargePointId}
  `;
}

export interface ConnectorRow {
  id: string;
  evse_id: string;
  ocpp_connector_id: number;
}

/**
 * Returns the connector row, creating it (and its EVSE) if the charger reports
 * one we don't know about. Chargers are the authority on their own hardware;
 * refusing to record a session because the connector was never registered
 * loses real revenue data.
 */
export async function ensureConnector(
  db: Db,
  tenantId: string,
  chargePointId: string,
  ocppConnectorId: number,
): Promise<ConnectorRow> {
  const existing = await db<ConnectorRow[]>`
    select id, evse_id, ocpp_connector_id
    from public.connectors
    where charge_point_id = ${chargePointId} and ocpp_connector_id = ${ocppConnectorId}
    limit 1
  `;
  if (existing[0]) return existing[0];

  return db.begin(async (tx) => {
    const evse = await tx<{ id: string }[]>`
      insert into public.evses (tenant_id, charge_point_id, evse_number)
      values (${tenantId}, ${chargePointId}, ${ocppConnectorId})
      on conflict (charge_point_id, evse_number) do update set evse_number = excluded.evse_number
      returning id
    `;
    const connector = await tx<ConnectorRow[]>`
      insert into public.connectors (tenant_id, evse_id, charge_point_id, ocpp_connector_id)
      values (${tenantId}, ${evse[0].id}, ${chargePointId}, ${ocppConnectorId})
      on conflict (charge_point_id, ocpp_connector_id) do update
        set ocpp_connector_id = excluded.ocpp_connector_id
      returning id, evse_id, ocpp_connector_id
    `;
    return connector[0];
  });
}

export async function updateConnectorStatus(
  db: Db,
  connectorId: string,
  status: string,
  errorCode: string | null,
): Promise<void> {
  await db`
    update public.connectors
    set status = ${status},
        status_updated_at = now(),
        last_error_code = ${errorCode}
    where id = ${connectorId}
  `;
}

export interface IdTagLookup {
  id: string;
  status: 'active' | 'blocked' | 'expired';
  expires_at: string | null;
  parent_tag: string | null;
}

export async function findIdTag(
  db: Db,
  tenantId: string,
  tag: string,
): Promise<IdTagLookup | null> {
  const rows = await db<IdTagLookup[]>`
    select id, status, expires_at, parent_tag
    from public.id_tags
    where tenant_id = ${tenantId} and tag = ${tag}
    limit 1
  `;
  return rows[0] ?? null;
}
