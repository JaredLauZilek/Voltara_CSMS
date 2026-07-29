import type { Queryable } from './client.js';

export interface SessionRow {
  id: string;
  tenant_id: string;
  charge_point_id: string;
  connector_id: string | null;
  ocpp_connector_id: number;
  ocpp_transaction_id: number;
  status: string;
  started_at: string;
  meter_start_wh: string | number | null;
}

export interface StartSessionInput {
  tenantId: string;
  chargePointId: string;
  connectorId: string;
  evseId: string;
  ocppConnectorId: number;
  idTag: string;
  idTagId: string | null;
  meterStartWh: number;
  startedAt: Date;
  offline: boolean;
  reservationId?: number | null;
  startSource: 'cable' | 'rfid' | 'remote' | 'app' | 'unknown';
}

/**
 * Opens a session and allocates the OCPP transaction id in one statement.
 * The id comes from a sequence rather than a uuid because OCPP 1.6 types
 * transactionId as a signed 32-bit integer on the wire.
 */
export async function startSession(
  db: Queryable,
  input: StartSessionInput,
): Promise<{ id: string; ocpp_transaction_id: number }> {
  const rows = await db<{ id: string; ocpp_transaction_id: number }[]>`
    insert into public.charging_sessions (
      tenant_id, charge_point_id, connector_id, evse_id, ocpp_connector_id,
      ocpp_transaction_id, id_tag, id_tag_id, status, started_at,
      meter_start_wh, offline, reservation_id, start_source
    ) values (
      ${input.tenantId}, ${input.chargePointId}, ${input.connectorId}, ${input.evseId},
      ${input.ocppConnectorId}, nextval('public.ocpp_transaction_id_seq')::int,
      ${input.idTag}, ${input.idTagId}, 'active', ${input.startedAt},
      ${input.meterStartWh}, ${input.offline}, ${input.reservationId ?? null}, ${input.startSource}
    )
    returning id, ocpp_transaction_id
  `;
  return rows[0];
}

export async function findSessionByTransactionId(
  db: Queryable,
  tenantId: string,
  transactionId: number,
): Promise<SessionRow | null> {
  const rows = await db<SessionRow[]>`
    select id, tenant_id, charge_point_id, connector_id, ocpp_connector_id,
           ocpp_transaction_id, status, started_at, meter_start_wh
    from public.charging_sessions
    where tenant_id = ${tenantId} and ocpp_transaction_id = ${transactionId}
    limit 1
  `;
  return rows[0] ?? null;
}

/** The still-open session on a connector — used to attribute meter values. */
export async function findOpenSessionOnConnector(
  db: Queryable,
  chargePointId: string,
  ocppConnectorId: number,
): Promise<SessionRow | null> {
  const rows = await db<SessionRow[]>`
    select id, tenant_id, charge_point_id, connector_id, ocpp_connector_id,
           ocpp_transaction_id, status, started_at, meter_start_wh
    from public.charging_sessions
    where charge_point_id = ${chargePointId}
      and ocpp_connector_id = ${ocppConnectorId}
      and ended_at is null
    order by started_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

export interface StopSessionInput {
  sessionId: string;
  meterStopWh: number;
  stoppedAt: Date;
  reason: string | null;
  stopIdTag: string | null;
}

/**
 * Closes a session. Energy is computed from the meter readings the charger
 * reported, never from accumulated meter values — the register is the billable
 * source of truth and survives dropped samples.
 */
export async function stopSession(
  db: Queryable,
  input: StopSessionInput,
): Promise<{ energy_wh: number } | null> {
  const rows = await db<{ energy_wh: number }[]>`
    update public.charging_sessions set
      status = 'completed',
      ended_at = ${input.stoppedAt},
      meter_stop_wh = ${input.meterStopWh},
      energy_wh = greatest(${input.meterStopWh}::bigint - coalesce(meter_start_wh, 0), 0),
      stop_reason = ${input.reason},
      stop_id_tag = ${input.stopIdTag}
    where id = ${input.sessionId} and ended_at is null
    returning energy_wh
  `;
  return rows[0] ?? null;
}

/**
 * A StopTransaction for a transaction we never saw started — the charger
 * buffered it across a gateway outage, or it predates onboarding. Recorded as
 * `orphaned` so the energy is not silently lost; it is deliberately not
 * billable without a start reading.
 */
export async function recordOrphanedStop(
  db: Queryable,
  input: {
    tenantId: string;
    chargePointId: string;
    connectorId: string | null;
    evseId: string | null;
    ocppConnectorId: number;
    transactionId: number;
    meterStopWh: number;
    stoppedAt: Date;
    reason: string | null;
    idTag: string | null;
  },
): Promise<string> {
  const rows = await db<{ id: string }[]>`
    insert into public.charging_sessions (
      tenant_id, charge_point_id, connector_id, evse_id, ocpp_connector_id,
      ocpp_transaction_id, id_tag, status, started_at, ended_at,
      meter_stop_wh, stop_reason, offline, start_source
    ) values (
      ${input.tenantId}, ${input.chargePointId}, ${input.connectorId}, ${input.evseId},
      ${input.ocppConnectorId}, ${input.transactionId}, ${input.idTag}, 'orphaned',
      ${input.stoppedAt}, ${input.stoppedAt}, ${input.meterStopWh}, ${input.reason},
      true, 'unknown'
    )
    on conflict (ocpp_transaction_id) do nothing
    returning id
  `;
  return rows[0]?.id ?? '';
}

export async function setSessionStatus(
  db: Queryable,
  sessionId: string,
  status: 'active' | 'suspended' | 'finishing',
): Promise<void> {
  await db`
    update public.charging_sessions
    set status = ${status}
    where id = ${sessionId} and ended_at is null
  `;
}
