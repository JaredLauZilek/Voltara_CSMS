import { billing, ocpp16, type ConnectorStatus } from '@voltara/shared';
import type { GatewayConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import type { Db } from '../../db/client.js';
import {
  applyBootNotification,
  ensureConnector,
  findIdTag,
  touchLastSeen,
  updateConnectorStatus,
} from '../../db/chargePoints.js';
import { insertStatusLog } from '../../db/logs.js';
import {
  applySessionCost,
  insertCdr,
  listEnergySamples,
  markChargingEnded,
  resolveTariff,
} from '../../db/billing.js';
import {
  findOpenSessionOnConnector,
  findSessionByTransactionId,
  recordOrphanedStop,
  setSessionStatus,
  startSession,
  stopSession,
} from '../../db/sessions.js';
import type { BatchWriter, MeterValueRow } from '../../db/writers.js';
import {
  parseMeterValues,
  parseTimestamp,
  summariseForBroadcast,
  toMeterValueRows,
} from '../../domain/meter.js';
import { normalizeConnectorStatus, sessionStatusFor } from '../../domain/status.js';
import type { RealtimePublisher } from '../../realtime.js';
import type { WebhookDispatcher } from '../../webhooks.js';
import type { ChargerConnection } from '../../registry.js';

export interface HandlerContext {
  db: Db;
  config: GatewayConfig;
  logger: Logger;
  realtime: RealtimePublisher;
  meterWriter: BatchWriter<MeterValueRow>;
  webhooks: WebhookDispatcher;
  connection: ChargerConnection;
}

// ── Authorization ───────────────────────────────────────────────────────────

/**
 * Resolves an idTag to an OCPP idTagInfo.
 *
 * Unknown tags are Invalid, not Blocked: Blocked means "this tag exists and is
 * barred", and conflating the two makes RFID problems undiagnosable from the
 * charger's own logs.
 */
async function authorizeIdTag(
  ctx: HandlerContext,
  idTag: string,
): Promise<{ info: ocpp16.IdTagInfo; idTagId: string | null }> {
  const { db, connection } = ctx;
  const tag = await findIdTag(db, connection.tenantId, idTag);

  if (!tag) {
    if (connection.quirks.alwaysAuthorize) {
      return { info: { status: 'Accepted' }, idTagId: null };
    }
    return { info: { status: 'Invalid' }, idTagId: null };
  }

  if (tag.status === 'blocked') return { info: { status: 'Blocked' }, idTagId: tag.id };

  // The driver returns timestamptz as a Date; the wire schema demands an ISO
  // string, and strict mode validates the response object before it is
  // serialised — so a raw Date here fails outbound validation.
  const expiryDate = tag.expires_at ? new Date(tag.expires_at).toISOString() : undefined;

  const expired =
    tag.status === 'expired' || (tag.expires_at !== null && new Date(tag.expires_at) < new Date());
  if (expired) {
    return { info: { status: 'Expired', expiryDate }, idTagId: tag.id };
  }

  return {
    info: {
      status: 'Accepted',
      expiryDate,
      parentIdTag: tag.parent_tag ?? undefined,
    },
    idTagId: tag.id,
  };
}

// ── Charge-point-initiated handlers ─────────────────────────────────────────

export async function handleBootNotification(
  ctx: HandlerContext,
  params: unknown,
): Promise<ocpp16.BootNotificationConf> {
  const req = ocpp16.bootNotificationReqSchema.parse(params);
  const { connection } = ctx;

  await applyBootNotification(ctx.db, connection.chargePointId, {
    vendor: req.chargePointVendor,
    model: req.chargePointModel,
    serialNumber: req.chargePointSerialNumber ?? req.chargeBoxSerialNumber ?? null,
    firmwareVersion: req.firmwareVersion ?? null,
  });

  ctx.logger.info(
    { vendor: req.chargePointVendor, model: req.chargePointModel, fw: req.firmwareVersion },
    'charger booted',
  );

  ctx.realtime.cpStatus(connection.tenantId, {
    chargePointId: connection.chargePointId,
    ocppIdentity: connection.identity,
    connectionState: 'online',
    at: new Date().toISOString(),
  });

  return {
    status: 'Accepted',
    currentTime: new Date().toISOString(),
    interval: connection.quirks.heartbeatIntervalS ?? ctx.config.HEARTBEAT_INTERVAL_S,
  };
}

export async function handleHeartbeat(ctx: HandlerContext): Promise<ocpp16.HeartbeatConf> {
  await touchLastSeen(ctx.db, ctx.connection.chargePointId);
  return { currentTime: new Date().toISOString() };
}

export async function handleStatusNotification(
  ctx: HandlerContext,
  params: unknown,
): Promise<Record<string, never>> {
  const req = ocpp16.statusNotificationReqSchema.parse(params);
  const { db, connection } = ctx;
  const status = normalizeConnectorStatus(req.status);
  const recordedAt = parseTimestamp(req.timestamp, new Date());
  const errorCode = req.errorCode && req.errorCode !== 'NoError' ? req.errorCode : null;

  // connectorId 0 addresses the charge point itself, not a connector. It is
  // never stored as a connector row (CLAUDE.md / gateway contract).
  if (req.connectorId === 0) {
    if (!connection.quirks.ignoreConnectorZeroStatus) {
      await insertStatusLog(db, {
        tenantId: connection.tenantId,
        chargePointId: connection.chargePointId,
        ocppConnectorId: 0,
        status,
        errorCode,
        info: req.info ?? null,
        vendorId: req.vendorId ?? null,
        vendorErrorCode: req.vendorErrorCode ?? null,
        recordedAt,
      });
    }
    return {};
  }

  const connector = await ensureConnector(
    db,
    connection.tenantId,
    connection.chargePointId,
    req.connectorId,
  );

  await updateConnectorStatus(db, connector.id, status, errorCode);
  await insertStatusLog(db, {
    tenantId: connection.tenantId,
    chargePointId: connection.chargePointId,
    ocppConnectorId: req.connectorId,
    status,
    errorCode,
    info: req.info ?? null,
    vendorId: req.vendorId ?? null,
    vendorErrorCode: req.vendorErrorCode ?? null,
    recordedAt,
  });

  await mirrorStatusOntoOpenSession(ctx, req.connectorId, status, recordedAt);

  ctx.realtime.cpStatus(connection.tenantId, {
    chargePointId: connection.chargePointId,
    ocppIdentity: connection.identity,
    connectionState: 'online',
    connector: { ocppConnectorId: req.connectorId, status, errorCode },
    at: recordedAt.toISOString(),
  });

  return {};
}

/**
 * Keeps a running session's status in step with its connector, so "charging"
 * versus "suspended" is answerable without replaying the status log. Idle-fee
 * accounting in Phase 3 reads this.
 */
async function mirrorStatusOntoOpenSession(
  ctx: HandlerContext,
  ocppConnectorId: number,
  status: ConnectorStatus,
  recordedAt: Date,
): Promise<void> {
  const next = sessionStatusFor(status);
  if (!next) return;

  const session = await findOpenSessionOnConnector(
    ctx.db,
    ctx.connection.chargePointId,
    ocppConnectorId,
  );
  if (!session) return;
  // Idle time (Phase 3) is measured from the last moment charging ended.
  await markChargingEnded(ctx.db, session.id, recordedAt, next !== 'active');
  if (session.status === next) return;

  await setSessionStatus(ctx.db, session.id, next);
  ctx.realtime.sessionUpdate(ctx.connection.tenantId, {
    sessionId: session.id,
    chargePointId: ctx.connection.chargePointId,
    ocppConnectorId,
    status: next,
    energyWh: null,
    at: new Date().toISOString(),
  });
}

export async function handleAuthorize(
  ctx: HandlerContext,
  params: unknown,
): Promise<{ idTagInfo: ocpp16.IdTagInfo }> {
  const req = ocpp16.authorizeReqSchema.parse(params);
  const { info } = await authorizeIdTag(ctx, req.idTag);
  return { idTagInfo: info };
}

export async function handleStartTransaction(
  ctx: HandlerContext,
  params: unknown,
): Promise<{ transactionId: number; idTagInfo: ocpp16.IdTagInfo }> {
  const req = ocpp16.startTransactionReqSchema.parse(params);
  const { db, connection } = ctx;

  const { info, idTagId } = await authorizeIdTag(ctx, req.idTag);
  if (info.status !== 'Accepted') {
    // No session row for a start we refused — a phantom "active" session would
    // corrupt utilisation and never be closed by anything.
    ctx.logger.info({ idTag: req.idTag, status: info.status }, 'start transaction refused');
    return { transactionId: 0, idTagInfo: info };
  }

  const receivedAt = new Date();
  const startedAt = parseTimestamp(req.timestamp, receivedAt);
  // A start reported well in the past was buffered by the charger while it had
  // no connection; the timestamps are historical, not observed.
  const offline =
    receivedAt.getTime() - startedAt.getTime() > ctx.config.OFFLINE_REPLAY_THRESHOLD_MS;

  const connector = await ensureConnector(
    db,
    connection.tenantId,
    connection.chargePointId,
    req.connectorId,
  );

  // Phase 3: resolve the tariff now and freeze it. A tariff edit after this
  // instant cannot change what this session costs.
  const resolved = await resolveTariff(db, {
    tenantId: connection.tenantId,
    chargePointId: connection.chargePointId,
    connectorId: connector.id,
    idTagId,
  });
  if (!resolved) {
    ctx.logger.warn({ idTag: req.idTag }, 'no tariff applies — session will be unbillable');
  }

  const session = await startSession(db, {
    tenantId: connection.tenantId,
    chargePointId: connection.chargePointId,
    connectorId: connector.id,
    evseId: connector.evse_id,
    ocppConnectorId: req.connectorId,
    idTag: req.idTag,
    idTagId,
    meterStartWh: req.meterStart,
    startedAt,
    offline,
    reservationId: req.reservationId ?? null,
    startSource: 'rfid',
    tariff: resolved
      ? {
          tariffVersionId: resolved.tariffVersionId,
          snapshot: resolved.snapshot,
          billingAccountId: resolved.billingAccountId,
          driverGroupId: resolved.driverGroupId,
        }
      : null,
  });

  ctx.logger.info(
    {
      sessionId: session.id,
      transactionId: session.ocpp_transaction_id,
      offline,
      tariff: resolved?.snapshot.name ?? null,
    },
    'session started',
  );

  ctx.realtime.sessionUpdate(connection.tenantId, {
    sessionId: session.id,
    chargePointId: connection.chargePointId,
    ocppConnectorId: req.connectorId,
    status: 'active',
    energyWh: 0,
    at: startedAt.toISOString(),
  });

  return { transactionId: session.ocpp_transaction_id, idTagInfo: info };
}

export async function handleStopTransaction(
  ctx: HandlerContext,
  params: unknown,
): Promise<{ idTagInfo?: ocpp16.IdTagInfo }> {
  const req = ocpp16.stopTransactionReqSchema.parse(params);
  const { db, connection } = ctx;

  const receivedAt = new Date();
  const stoppedAt = parseTimestamp(req.timestamp, receivedAt);
  const session = await findSessionByTransactionId(db, connection.tenantId, req.transactionId);

  if (!session) {
    // The charger is reporting a transaction we never saw start — buffered
    // across a gateway outage, or predating onboarding. Recorded rather than
    // discarded: the energy was really delivered.
    ctx.logger.warn({ transactionId: req.transactionId }, 'stop for unknown transaction');
    await db.begin(async (tx) => {
      const orphanId = await recordOrphanedStop(tx, {
        tenantId: connection.tenantId,
        chargePointId: connection.chargePointId,
        connectorId: null,
        evseId: null,
        ocppConnectorId: 0,
        transactionId: req.transactionId,
        meterStopWh: req.meterStop,
        stoppedAt,
        reason: req.reason ?? null,
        idTag: req.idTag ?? null,
      });
      // The energy was really delivered, so it gets a record — flagged so an
      // invoice run never bills a session with no start reading.
      if (orphanId) {
        await insertCdr(tx, {
          tenantId: connection.tenantId,
          chargingSessionId: orphanId,
          chargePointId: connection.chargePointId,
          ocppConnectorId: 0,
          billingAccountId: null,
          driverGroupId: null,
          idTag: req.idTag ?? null,
          authMethod: 'whitelist',
          startAt: stoppedAt,
          endAt: stoppedAt,
          tariffId: null,
          tariffVersionId: null,
          tariffSnapshot: null,
          periods: [],
          totals: { energyWh: 0, timeS: 0, parkingTimeS: 0 },
          cost: null,
          billable: false,
          unbillableReason: 'orphaned_no_start',
          remark: `StopTransaction for unknown transaction ${req.transactionId}`,
        });
      }
    });
    return req.idTag ? { idTagInfo: { status: 'Accepted' } } : {};
  }

  const finalSamples = parseMeterValues(req.transactionData ?? [], receivedAt, {
    assumeKwhWhenUnitMissing: connection.quirks.assumeKwhWhenUnitMissing,
  });

  // Periodic samples still sitting in the batch writer belong to this session;
  // the CDR's charging periods are built from them, so land them first.
  await ctx.meterWriter.flush();

  // One transaction: the close, its final readings, the status log, and the
  // priced CDR land together or not at all. A session closed without its
  // final meter values would be billed short; a closed session without its
  // CDR would be unbillable forever.
  const outcome = await db.begin(async (tx) => {
    const result = await stopSession(tx, {
      sessionId: session.id,
      meterStopWh: req.meterStop,
      stoppedAt,
      reason: req.reason ?? null,
      stopIdTag: req.idTag ?? null,
    });

    if (finalSamples.length > 0) {
      const rows = toMeterValueRows(finalSamples, {
        tenantId: connection.tenantId,
        chargePointId: connection.chargePointId,
        chargingSessionId: session.id,
        ocppConnectorId: session.ocpp_connector_id,
      });
      await tx`insert into public.meter_values ${tx(rows as unknown as readonly Record<string, unknown>[])}`;
    }

    await insertStatusLog(tx, {
      tenantId: connection.tenantId,
      chargePointId: connection.chargePointId,
      ocppConnectorId: session.ocpp_connector_id,
      status: 'Finishing',
      errorCode: null,
      info: `Transaction ${req.transactionId} stopped: ${req.reason ?? 'Local'}`,
      vendorId: null,
      vendorErrorCode: null,
      recordedAt: stoppedAt,
    });

    if (!result)
      return {
        energyWh: null as number | null,
        cdrId: null as string | null,
        cost: null as billing.CostBreakdown | null,
      };

    // ── Price it ──────────────────────────────────────────────────────────
    const startedAt = new Date(session.started_at);
    const chargingEndedAt = result.charging_ended_at ? new Date(result.charging_ended_at) : null;
    const meterStart = Number(session.meter_start_wh ?? 0);
    const samples = await listEnergySamples(tx, session.id);
    const periods = billing.periodsFromSession({
      startedAt: startedAt.toISOString(),
      endedAt: stoppedAt.toISOString(),
      chargingEndedAt:
        chargingEndedAt && chargingEndedAt > startedAt && chargingEndedAt < stoppedAt
          ? chargingEndedAt.toISOString()
          : null,
      totalEnergyWh: result.energy_wh,
      samples:
        samples.length > 0
          ? [
              { at: startedAt.toISOString(), energyWh: meterStart },
              ...samples.filter((s) => new Date(s.at) > startedAt && new Date(s.at) < stoppedAt),
              { at: stoppedAt.toISOString(), energyWh: req.meterStop },
            ]
          : undefined,
    });
    const seconds = (p: billing.ChargingPeriod) =>
      (new Date(p.end).getTime() - new Date(p.start).getTime()) / 1000;
    const idleSeconds = periods.filter((p) => !p.charging).reduce((s, p) => s + seconds(p), 0);
    const chargingSeconds = periods.filter((p) => p.charging).reduce((s, p) => s + seconds(p), 0);

    const snapshot = session.tariff_snapshot;
    const cost = snapshot ? billing.priceSession(periods, snapshot) : null;
    const cdr = await insertCdr(tx, {
      tenantId: connection.tenantId,
      chargingSessionId: session.id,
      chargePointId: connection.chargePointId,
      ocppConnectorId: session.ocpp_connector_id,
      billingAccountId: session.billing_account_id,
      driverGroupId: session.driver_group_id,
      idTag: session.id_tag,
      authMethod: 'whitelist',
      startAt: startedAt,
      endAt: stoppedAt,
      tariffId: snapshot?.tariff_id ?? null,
      tariffVersionId: session.tariff_version_id,
      tariffSnapshot: snapshot,
      periods,
      totals: { energyWh: result.energy_wh, timeS: chargingSeconds, parkingTimeS: idleSeconds },
      cost,
      billable: Boolean(cost),
      unbillableReason: cost ? null : 'no_tariff',
    });
    await applySessionCost(tx, session.id, cost, Math.round(idleSeconds));

    return { energyWh: result.energy_wh as number | null, cdrId: cdr.id as string | null, cost };
  });
  const energyWh = outcome.energyWh;

  ctx.logger.info(
    {
      sessionId: session.id,
      transactionId: req.transactionId,
      energyWh,
      cdrId: outcome.cdrId,
      totalSen: outcome.cost?.totalSen ?? null,
    },
    'session stopped',
  );

  if (outcome.cdrId) {
    ctx.webhooks.emit(connection.tenantId, 'session.completed', {
      sessionId: session.id,
      cdrId: outcome.cdrId,
      chargePointId: connection.chargePointId,
      ocppIdentity: connection.identity,
      ocppConnectorId: session.ocpp_connector_id,
      transactionId: req.transactionId,
      startedAt: session.started_at,
      endedAt: stoppedAt.toISOString(),
      energyWh,
      currency: outcome.cost?.currency ?? null,
      totalSen: outcome.cost?.totalSen ?? null,
      taxSen: outcome.cost?.taxSen ?? null,
      billable: Boolean(outcome.cost),
    });
  }

  ctx.realtime.sessionUpdate(connection.tenantId, {
    sessionId: session.id,
    chargePointId: connection.chargePointId,
    ocppConnectorId: session.ocpp_connector_id,
    status: 'completed',
    energyWh,
    at: stoppedAt.toISOString(),
  });

  return req.idTag ? { idTagInfo: { status: 'Accepted' } } : {};
}

export async function handleMeterValues(
  ctx: HandlerContext,
  params: unknown,
): Promise<Record<string, never>> {
  const req = ocpp16.meterValuesReqSchema.parse(params);
  const { db, connection } = ctx;
  const receivedAt = new Date();

  const samples = parseMeterValues(req.meterValue, receivedAt, {
    assumeKwhWhenUnitMissing: connection.quirks.assumeKwhWhenUnitMissing,
  });
  if (samples.length === 0) return {};

  // Prefer the explicit transactionId; fall back to whatever session is open on
  // the connector, since some firmware omits it on periodic samples.
  const session = req.transactionId
    ? await findSessionByTransactionId(db, connection.tenantId, req.transactionId)
    : await findOpenSessionOnConnector(db, connection.chargePointId, req.connectorId);

  const rows = toMeterValueRows(samples, {
    tenantId: connection.tenantId,
    chargePointId: connection.chargePointId,
    chargingSessionId: session?.id ?? null,
    ocppConnectorId: req.connectorId,
  });
  for (const row of rows) ctx.meterWriter.add(row);

  if (session) {
    const summary = summariseForBroadcast(samples);
    ctx.realtime.meter(connection.tenantId, {
      sessionId: session.id,
      chargePointId: connection.chargePointId,
      ocppConnectorId: req.connectorId,
      powerW: summary.powerW,
      energyWh: summary.energyWh,
      socPercent: summary.socPercent,
      at: receivedAt.toISOString(),
    });
  }

  return {};
}

export async function handleDataTransfer(
  ctx: HandlerContext,
  params: unknown,
): Promise<{ status: string }> {
  const req = ocpp16.dataTransferReqSchema.parse(params);
  // Vendor extensions are not implemented, but the frame is already in
  // ocpp_messages — which is exactly how we learn which ones matter.
  ctx.logger.info({ vendorId: req.vendorId, messageId: req.messageId }, 'data transfer received');
  return { status: 'UnknownVendorId' };
}
