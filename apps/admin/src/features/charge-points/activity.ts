// The Logs tab's timeline: connection events, status changes and OCPP
// exchanges merged into one list, optionally narrowed to one session.
//
// The frame log is the one place the admin reads wire payloads — loosely and
// untyped, for display only. Nothing here feeds a decision (CLAUDE.md §6).

import { formatGun } from '@voltara/shared';
import type { ChargerLog, ConnectionEvent, OcppFrame, StatusEvent } from './api';

/** A CALL and the CALLRESULT/CALLERROR that answered it, shown as one row. */
export interface Exchange {
  key: string;
  action: string | null;
  /** The charger sent the CALL (BootNotification…) rather than us (Reset…). */
  fromCharger: boolean;
  at: string;
  call: OcppFrame | null;
  reply: OcppFrame | null;
  latencyMs: number | null;
}

export type ActivityEntry =
  | { kind: 'connection'; key: string; at: string; event: ConnectionEvent }
  | { kind: 'status'; key: string; at: string; event: StatusEvent }
  | { kind: 'message'; key: string; at: string; exchange: Exchange };

export const ACTIVITY_FILTERS = ['All', 'Messages', 'Status', 'Connection'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

/** What "this session's activity" means: its connector, transaction and card. */
export interface SessionScope {
  connectorId: number;
  transactionId: number;
  idTag: string | null;
}

type Payload = Record<string, unknown>;

const payloadOf = (f: OcppFrame | null): Payload =>
  f?.payload && typeof f.payload === 'object' && !Array.isArray(f.payload)
    ? (f.payload as Payload)
    : {};

/**
 * Pairs each CALL with its answer: same message id, opposite direction, after
 * it. Ids are only unique per connection (chargers restart their counters on
 * reboot) and some firmware reuses them sooner, so calls waiting on the same
 * id are answered first-in, first-out. A reply whose CALL fell outside the
 * loaded window stays on its own row.
 */
export function pairFrames(frames: OcppFrame[]): Exchange[] {
  const asc = [...frames].sort(
    (a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.id - b.id,
  );
  const awaiting = new Map<string, Exchange[]>();
  const out: Exchange[] = [];
  for (const f of asc) {
    if (f.message_type === 2) {
      const ex: Exchange = {
        key: `f${f.id}`,
        action: f.action,
        fromCharger: f.direction === 'in',
        at: f.recorded_at,
        call: f,
        reply: null,
        latencyMs: null,
      };
      out.push(ex);
      if (f.ocpp_message_id) {
        const waitKey = `${f.ocpp_message_id}|${f.direction === 'in' ? 'out' : 'in'}`;
        awaiting.set(waitKey, [...(awaiting.get(waitKey) ?? []), ex]);
      }
      continue;
    }
    const ex = f.ocpp_message_id
      ? awaiting.get(`${f.ocpp_message_id}|${f.direction}`)?.shift()
      : undefined;
    if (ex) {
      ex.reply = f;
      ex.latencyMs = Date.parse(f.recorded_at) - Date.parse(ex.at);
    } else {
      out.push({
        key: `f${f.id}`,
        action: f.action,
        fromCharger: f.direction === 'out',
        at: f.recorded_at,
        call: null,
        reply: f,
        latencyMs: null,
      });
    }
  }
  return out;
}

/**
 * Whether an exchange belongs to the session: its transaction, its connector,
 * its card's Authorize — or whole-charger traffic (boot, configuration…),
 * which can explain what happened to it.
 */
export function exchangeInScope(ex: Exchange, scope: SessionScope): boolean {
  const req = payloadOf(ex.call);
  const res = payloadOf(ex.reply);
  if (req.transactionId === scope.transactionId || res.transactionId === scope.transactionId) {
    return true;
  }
  if (typeof req.connectorId === 'number') {
    return req.connectorId === scope.connectorId || req.connectorId === 0;
  }
  if (ex.action === 'Authorize') return req.idTag === scope.idTag;
  if (typeof req.transactionId === 'number') return false; // another session's transaction
  return true;
}

export function buildActivity(
  log: ChargerLog | undefined,
  filter: ActivityFilter,
  scope: SessionScope | null,
): { entries: ActivityEntry[]; counts: Record<ActivityFilter, number> } {
  const exchanges = pairFrames(log?.frames ?? []).filter(
    (ex) => !scope || exchangeInScope(ex, scope),
  );
  const statuses = (log?.status ?? []).filter(
    (s) => !scope || s.ocpp_connector_id === scope.connectorId || s.ocpp_connector_id === 0,
  );
  const connection = log?.connection ?? [];

  // In "All", a status change stands in for the StatusNotification that
  // carried it — showing both would list every status twice.
  const allMessages = exchanges.filter((ex) => ex.action !== 'StatusNotification');

  const entries: ActivityEntry[] = [
    ...(filter === 'All' || filter === 'Connection'
      ? connection.map((e) => ({
          kind: 'connection' as const,
          key: `c${e.id}`,
          at: e.recorded_at,
          event: e,
        }))
      : []),
    ...(filter === 'All' || filter === 'Status'
      ? statuses.map((e) => ({
          kind: 'status' as const,
          key: `s${e.id}`,
          at: e.recorded_at,
          event: e,
        }))
      : []),
    ...(filter === 'All' || filter === 'Messages'
      ? (filter === 'All' ? allMessages : exchanges).map((ex) => ({
          kind: 'message' as const,
          key: ex.key,
          at: ex.at,
          exchange: ex,
        }))
      : []),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.key.localeCompare(a.key));

  return {
    entries,
    counts: {
      All: connection.length + statuses.length + allMessages.length,
      Messages: exchanges.length,
      Status: statuses.length,
      Connection: connection.length,
    },
  };
}

// ── Plain-language summaries ─────────────────────────────────────────────

const text = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : null;

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** 'Gun A', or 'Charger' for connector 0 (the whole unit); null if not a number. */
export function connectorLabel(n: unknown): string | null {
  return typeof n === 'number' ? formatGun(n) : null;
}

const meter = (wh: unknown) =>
  typeof wh === 'number' ? `meter ${(wh / 1000).toLocaleString('en-GB')} kWh` : null;

function meterSample(q: Payload): string | null {
  const first = Array.isArray(q.meterValue) ? (q.meterValue[0] as Payload | undefined) : undefined;
  const samples = (Array.isArray(first?.sampledValue) ? first.sampledValue : []) as Payload[];
  const find = (measurand: string) =>
    samples.find((s) => (s.measurand ?? 'Energy.Active.Import.Register') === measurand && !s.phase);
  const num = (s: Payload | undefined) => (s ? Number(s.value) : NaN);
  const power = find('Power.Active.Import');
  const energy = find('Energy.Active.Import.Register');
  const soc = find('SoC');
  const kw = power ? num(power) / (power.unit === 'kW' ? 1 : 1000) : NaN;
  const kwh = energy ? num(energy) / (energy.unit === 'kWh' ? 1 : 1000) : NaN;
  return join(
    Number.isFinite(kw) && `${kw.toFixed(1)} kW`,
    Number.isFinite(kwh) && `meter ${kwh.toLocaleString('en-GB')} kWh`,
    soc && `SoC ${text(soc.value)}%`,
  );
}

/** One line for each side of an exchange: what was asked, what came back. */
export function describeExchange(ex: Exchange): { request: string; reply: string } {
  const q = payloadOf(ex.call);
  const r = payloadOf(ex.reply);
  const answered =
    text(r.status) ?? text((r.idTagInfo as Payload | undefined)?.status) ?? (ex.reply ? 'OK' : '');

  let request = '';
  let reply = answered;
  switch (ex.action) {
    case 'BootNotification':
      request = join(
        text(q.chargePointVendor),
        text(q.chargePointModel),
        q.firmwareVersion ? `firmware ${text(q.firmwareVersion)}` : null,
      );
      reply = join(answered, typeof r.interval === 'number' && `heartbeat every ${r.interval}s`);
      break;
    case 'StatusNotification':
      request = join(
        `${connectorLabel(q.connectorId)} → ${text(q.status)}`,
        q.errorCode !== 'NoError' && text(q.errorCode),
        text(q.vendorErrorCode),
        text(q.info),
      );
      reply = '';
      break;
    case 'Authorize':
      request = text(q.idTag) ?? '';
      break;
    case 'StartTransaction':
      request = join(connectorLabel(q.connectorId), text(q.idTag), meter(q.meterStart));
      reply = join(typeof r.transactionId === 'number' && `Txn ${r.transactionId}`, answered);
      break;
    case 'StopTransaction':
      request = join(`Txn ${text(q.transactionId)}`, text(q.reason), meter(q.meterStop));
      break;
    case 'MeterValues':
      request = join(connectorLabel(q.connectorId), meterSample(q));
      reply = '';
      break;
    case 'Heartbeat':
      reply = '';
      break;
    case 'GetConfiguration':
      request = Array.isArray(q.key) && q.key.length ? q.key.join(', ') : 'all keys';
      reply = Array.isArray(r.configurationKey) ? `${r.configurationKey.length} keys` : answered;
      break;
    case 'ChangeConfiguration':
      request = `${text(q.key)} = ${text(q.value)}`;
      break;
    case 'RemoteStartTransaction':
      request = join(connectorLabel(q.connectorId), text(q.idTag));
      break;
    case 'RemoteStopTransaction':
      request = `Txn ${text(q.transactionId)}`;
      break;
    case 'Reset':
      request = text(q.type) ?? '';
      break;
    case 'UnlockConnector':
      request = connectorLabel(q.connectorId) ?? '';
      break;
    case 'ChangeAvailability':
      request = `${connectorLabel(q.connectorId)} → ${text(q.type)}`;
      break;
    case 'TriggerMessage':
      request = join(text(q.requestedMessage), connectorLabel(q.connectorId));
      break;
    case 'GetDiagnostics':
      request = 'upload diagnostics';
      reply = text(r.fileName) ?? answered;
      break;
    case 'ReserveNow':
      request = join(
        connectorLabel(q.connectorId),
        text(q.idTag),
        typeof q.expiryDate === 'string' &&
          `until ${new Date(q.expiryDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      );
      break;
  }

  if (ex.reply?.message_type === 4) {
    reply = join(ex.reply.error_code, ex.reply.error_description);
  } else if (!ex.reply && ex.call) {
    reply = 'no reply recorded';
  }
  return { request, reply };
}
