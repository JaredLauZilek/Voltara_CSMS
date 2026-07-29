import type { Queryable } from './client.js';

export interface StatusLogInput {
  tenantId: string;
  chargePointId: string;
  ocppConnectorId: number;
  status: string;
  errorCode: string | null;
  info: string | null;
  vendorId: string | null;
  vendorErrorCode: string | null;
  recordedAt: Date;
}

export async function insertStatusLog(db: Queryable, input: StatusLogInput): Promise<void> {
  await db`
    insert into public.charge_point_status_log (
      tenant_id, charge_point_id, ocpp_connector_id, status, error_code,
      info, vendor_id, vendor_error_code, recorded_at
    ) values (
      ${input.tenantId}, ${input.chargePointId}, ${input.ocppConnectorId}, ${input.status},
      ${input.errorCode}, ${input.info}, ${input.vendorId}, ${input.vendorErrorCode},
      ${input.recordedAt}
    )
  `;
}

export async function insertConnectionLog(
  db: Queryable,
  input: {
    tenantId: string;
    chargePointId: string;
    event: 'connected' | 'disconnected' | 'rejected';
    gatewayInstance: string;
    remoteAddress?: string | null;
    closeCode?: number | null;
    closeReason?: string | null;
  },
): Promise<void> {
  await db`
    insert into public.charge_point_connection_log (
      tenant_id, charge_point_id, event, gateway_instance,
      remote_address, close_code, close_reason
    ) values (
      ${input.tenantId}, ${input.chargePointId}, ${input.event}, ${input.gatewayInstance},
      ${input.remoteAddress ?? null}, ${input.closeCode ?? null}, ${input.closeReason ?? null}
    )
  `;
}

/**
 * Claims a charger for this gateway instance. The upsert matters: if a charger
 * reconnects to a different instance before the old socket's cleanup ran, the
 * newest connection must win rather than error.
 */
export async function registerConnection(
  db: Queryable,
  input: {
    ocppIdentity: string;
    chargePointId: string;
    tenantId: string;
    gatewayInstance: string;
  },
): Promise<void> {
  await db`
    insert into public.charge_point_connections (
      ocpp_identity, charge_point_id, tenant_id, gateway_instance, connected_at, last_message_at
    ) values (
      ${input.ocppIdentity}, ${input.chargePointId}, ${input.tenantId},
      ${input.gatewayInstance}, now(), now()
    )
    on conflict (ocpp_identity) do update set
      charge_point_id = excluded.charge_point_id,
      tenant_id = excluded.tenant_id,
      gateway_instance = excluded.gateway_instance,
      connected_at = now(),
      last_message_at = now()
  `;
}

/**
 * Releases the claim — but only if this instance still holds it, so a late
 * cleanup from an old socket cannot evict a charger that has already
 * reconnected elsewhere.
 */
export async function unregisterConnection(
  db: Queryable,
  ocppIdentity: string,
  gatewayInstance: string,
): Promise<void> {
  await db`
    delete from public.charge_point_connections
    where ocpp_identity = ${ocppIdentity} and gateway_instance = ${gatewayInstance}
  `;
}

/**
 * Which gateway instance, if any, currently holds this charger.
 *
 * Every instance receives every pg_notify, so an instance that does not hold
 * the socket must be able to tell "nobody has it" (fail the command) from
 * "another instance has it" (stay out of the way).
 */
export async function findConnectionOwner(
  db: Queryable,
  chargePointId: string,
): Promise<string | null> {
  const rows = await db<{ gateway_instance: string }[]>`
    select gateway_instance from public.charge_point_connections
    where charge_point_id = ${chargePointId}
    limit 1
  `;
  return rows[0]?.gateway_instance ?? null;
}

/** Clears any rows this instance left behind after an unclean shutdown. */
export async function clearStaleConnections(
  db: Queryable,
  gatewayInstance: string,
): Promise<number> {
  const rows = await db`
    delete from public.charge_point_connections
    where gateway_instance = ${gatewayInstance}
    returning ocpp_identity
  `;
  return rows.length;
}
