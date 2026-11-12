import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, C, Toolbar } from '@voltara/ui';
import { formatDateTime, formatDuration, formatKwh, formatRM } from '@voltara/shared';
import { useSessionDetail, useSessions } from '@/features/sessions';
import { useChargerLog, type LogRange } from './hooks';
import {
  ACTIVITY_FILTERS,
  buildActivity,
  connectorLabel,
  describeExchange,
  type ActivityEntry,
  type ActivityFilter,
  type Exchange,
} from './activity';

const RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '7d': { label: 'Last 7 days', hours: 168 },
};
type RangeKey = keyof typeof RANGES;

/** Session windows open a little early and close a little late: Authorize
 * and Preparing come before StartTransaction, Available after the stop. */
const SESSION_PAD_MS = 2 * 60_000;

const COLUMNS = '86px 72px 210px minmax(0, 1fr) 64px';

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  color: C.ink,
  maxWidth: 360,
};

const linkStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: C.green,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * One charger's activity as a single timeline: connection events, status
 * changes and OCPP exchanges (each request paired with its reply). Narrow it
 * by type, by time, or to one session — its connector, transaction and card,
 * plus whole-charger events that may explain it. Everything is in the URL
 * (`?tab=logs&session=…&show=Messages`) so a support link lands on the view.
 */
export function ChargerActivity({ chargePointId }: { chargePointId: string }) {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session');
  const rangeKey: RangeKey = params.get('range') === '7d' ? '7d' : '24h';
  const rawShow = params.get('show');
  const show: ActivityFilter = (ACTIVITY_FILTERS as readonly string[]).includes(rawShow ?? '')
    ? (rawShow as ActivityFilter)
    : 'All';
  const heartbeats = params.get('hb') === '1';

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const { data: sessions = [] } = useSessions({ chargePointId, limit: 50 });
  const listed = sessions.find((s) => s.id === sessionId) ?? null;
  // A deep link may name a session older than the 50 in the picker.
  const { data: fetched, isLoading: loadingSession } = useSessionDetail(
    sessionId ?? '',
    Boolean(sessionId) && !listed,
  );
  const session =
    listed ?? (fetched?.session?.charge_point_id === chargePointId ? fetched.session : null);

  const range: LogRange | null = sessionId
    ? session
      ? {
          kind: 'session',
          from: new Date(Date.parse(session.started_at) - SESSION_PAD_MS).toISOString(),
          to: session.ended_at
            ? new Date(Date.parse(session.ended_at) + SESSION_PAD_MS).toISOString()
            : null,
        }
      : null
    : { kind: 'recent', hours: RANGES[rangeKey].hours };

  const { data: log, isLoading } = useChargerLog(chargePointId, range, heartbeats);

  const { entries, counts } = useMemo(
    () =>
      buildActivity(
        log,
        show,
        session
          ? {
              connectorId: session.ocpp_connector_id,
              transactionId: session.ocpp_transaction_id,
              idTag: session.id_tag,
            }
          : null,
      ),
    [log, show, session],
  );

  const sessionMissing = Boolean(sessionId) && !session && !loadingSession;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar
        filters={[...ACTIVITY_FILTERS]}
        filter={show}
        onFilterChange={(f) => update({ show: f === 'All' ? null : f })}
        extra={
          <>
            <select
              value={sessionId ? `s:${sessionId}` : rangeKey}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('s:')) update({ session: v.slice(2), range: null });
                else update({ session: null, range: v === '24h' ? null : v });
              }}
              style={inputStyle}
            >
              {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                <option key={k} value={k}>
                  {RANGES[k].label}
                </option>
              ))}
              {sessionId && !listed && (
                <option value={`s:${sessionId}`}>
                  {session ? sessionLabel(session) : 'Selected session'}
                </option>
              )}
              {sessions.length > 0 && (
                <optgroup label="Sessions on this charger">
                  {sessions.map((s) => (
                    <option key={s.id} value={`s:${s.id}`}>
                      {sessionLabel(s)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: C.slate,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Heartbeats are the charger saying it is still there — most of a quiet charger's traffic."
            >
              <input
                type="checkbox"
                checked={heartbeats}
                onChange={(e) => update({ hb: e.target.checked ? '1' : null })}
                style={{ accentColor: C.green }}
              />
              Heartbeats
            </label>
            <Link
              to={`/ocpp-logs?cp=${chargePointId}`}
              style={{ ...linkStyle, marginLeft: 'auto' }}
            >
              Full OCPP log ›
            </Link>
          </>
        }
      />

      {session && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px',
            borderRadius: 12,
            background: C.honeydew,
            fontSize: 13,
            color: C.ink,
          }}
        >
          <span style={{ fontWeight: 700, color: C.green }}>
            Transaction {session.ocpp_transaction_id}
          </span>
          <span style={{ color: C.slate }}>
            {[
              connectorLabel(session.ocpp_connector_id),
              session.id_tag,
              `${formatDateTime(session.started_at)} → ${
                session.ended_at ? formatDateTime(session.ended_at) : 'now'
              }`,
              formatDuration(
                Math.max(
                  0,
                  ((session.ended_at ? Date.parse(session.ended_at) : Date.now()) -
                    Date.parse(session.started_at)) /
                    1000,
                ),
              ),
              formatKwh(session.energy_wh),
              session.amount_gross !== null ? formatRM(Number(session.amount_gross), 2) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <Link to={`/sessions/${session.id}`} style={{ ...linkStyle, marginLeft: 'auto' }}>
            Open session ›
          </Link>
          <button
            onClick={() => update({ session: null })}
            style={{
              border: 'none',
              background: 'transparent',
              color: C.slate,
              fontFamily: 'Figtree',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            × Show all activity
          </button>
        </div>
      )}

      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 24px',
            fontSize: 12,
            color: C.slate,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {counts.Messages} messages · {counts.Status} status changes · {counts.Connection}{' '}
          connection events
          {heartbeats ? '' : ' · heartbeats hidden'}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                gap: 12,
                padding: '10px 24px',
                background: C.seasalt,
                borderBottom: `1px solid ${C.border}`,
                fontSize: 11,
                fontWeight: 700,
                color: C.slate,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <span>Time</span>
              <span>From</span>
              <span>Event</span>
              <span>Detail</span>
              <span style={{ textAlign: 'right' }}>Reply in</span>
            </div>

            {entries.map((entry, i) => {
              const d = day(entry.at);
              const newDay = i === 0 || day(entries[i - 1]!.at) !== d;
              return (
                <Fragment key={entry.key}>
                  {newDay && (
                    <div
                      style={{
                        padding: '8px 24px',
                        background: C.seasalt,
                        borderBottom: `1px solid ${C.divider}`,
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.slate,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {d}
                    </div>
                  )}
                  <ActivityRow entry={entry} />
                </Fragment>
              );
            })}
          </div>
        </div>

        {(isLoading || (sessionId && loadingSession)) && entries.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            Loading activity…
          </div>
        )}
        {sessionMissing && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            That session is not on this charger.
          </div>
        )}
        {!isLoading && !sessionMissing && range && entries.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No activity {session ? 'for this session' : 'in this window'}.
            {!heartbeats && ' Heartbeats are hidden.'}
          </div>
        )}
        {log?.framesTruncated && (
          <div
            style={{
              padding: '12px 24px',
              fontSize: 12,
              color: C.slate,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            Showing the latest 1,000 messages in this window. Pick a session or a shorter window, or{' '}
            <Link to={`/ocpp-logs?cp=${chargePointId}`} style={linkStyle}>
              page through the full OCPP log ›
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function sessionLabel(s: {
  started_at: string;
  ended_at: string | null;
  ocpp_connector_id: number;
  energy_wh: number | null;
  ocpp_transaction_id: number;
}) {
  return [
    formatDateTime(s.started_at),
    connectorLabel(s.ocpp_connector_id),
    s.ended_at ? formatKwh(s.energy_wh) : 'running',
    `Txn ${s.ocpp_transaction_id}`,
  ].join(' · ');
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: COLUMNS,
    gap: 12,
    alignItems: 'center',
    padding: '9px 24px',
    fontSize: 13,
    borderBottom: `1px solid ${C.divider}`,
  };
  const cellTime = (
    <span style={{ color: C.slate, fontVariantNumeric: 'tabular-nums' }}>{time(entry.at)}</span>
  );
  const detailStyle: React.CSSProperties = {
    color: C.slate,
    fontSize: 12,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  if (entry.kind === 'connection') {
    const e = entry.event;
    const label =
      e.event === 'connected' ? 'Online' : e.event === 'rejected' ? 'Rejected' : 'Offline';
    return (
      <div style={rowStyle}>
        {cellTime}
        <span style={{ color: C.slate, fontSize: 12 }}>Network</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge status={label} />
          <span style={{ fontWeight: 600, color: C.ink }}>
            {e.event === 'connected'
              ? 'Connected'
              : e.event === 'rejected'
                ? 'Refused'
                : 'Disconnected'}
          </span>
        </span>
        <span style={{ ...detailStyle, color: e.event === 'rejected' ? C.error : C.slate }}>
          {e.event === 'connected'
            ? (e.remote_address ?? '')
            : [e.close_code, e.close_reason].filter(Boolean).join(' · ') || 'connection closed'}
        </span>
        <span />
      </div>
    );
  }

  if (entry.kind === 'status') {
    const s = entry.event;
    return (
      <div style={rowStyle}>
        {cellTime}
        <span style={{ color: C.slate, fontSize: 12 }}>Charger</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: C.ink, minWidth: 54 }}>
            {connectorLabel(s.ocpp_connector_id)}
          </span>
          <Badge status={s.status} />
        </span>
        <span style={{ ...detailStyle, color: s.error_code ? C.error : C.slate }}>
          {[s.error_code, s.vendor_error_code, s.info].filter(Boolean).join(' · ')}
        </span>
        <span />
      </div>
    );
  }

  const ex = entry.exchange;
  const { request, reply } = describeExchange(ex);
  const isError = ex.reply?.message_type === 4;
  return (
    <div style={{ borderBottom: `1px solid ${C.divider}` }}>
      <div
        style={{ ...rowStyle, borderBottom: 'none', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Show the full request and reply"
      >
        {cellTime}
        <span style={{ color: C.slate, fontSize: 12 }}>{ex.fromCharger ? 'Charger' : 'CSMS'}</span>
        <span
          style={{
            fontWeight: 600,
            color: isError ? C.error : C.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {open ? '▾' : '›'} {ex.action ?? 'Unknown'}
        </span>
        <span style={detailStyle}>
          {request}
          {reply && (
            <span style={{ color: isError ? C.error : C.ink, fontWeight: isError ? 600 : 500 }}>
              {request ? '  →  ' : '→  '}
              {reply}
            </span>
          )}
        </span>
        <span
          style={{
            color: C.slate,
            fontSize: 12,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ex.latencyMs !== null ? `${ex.latencyMs} ms` : ''}
        </span>
      </div>
      {open && <ExchangeDetail exchange={ex} />}
    </div>
  );
}

function ExchangeDetail({ exchange }: { exchange: Exchange }) {
  const block = (title: string, frame: Exchange['call']) => (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {title}
        {frame
          ? ` · ${frame.direction === 'in' ? 'charger → CSMS' : 'CSMS → charger'} · ${time(frame.recorded_at)}`
          : ''}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          borderRadius: 8,
          background: C.seasalt,
          border: `1px solid ${C.border}`,
          fontSize: 11,
          fontFamily: 'monospace',
          color: frame?.message_type === 4 ? C.error : C.ink,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 320,
          overflow: 'auto',
        }}
      >
        {frame
          ? JSON.stringify(
              frame.message_type === 4
                ? {
                    errorCode: frame.error_code,
                    errorDescription: frame.error_description,
                    details: frame.payload,
                  }
                : (frame.payload ?? {}),
              null,
              2,
            )
          : 'Not in this window.'}
      </pre>
    </div>
  );
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        padding: '4px 24px 16px 122px',
      }}
    >
      {block('Request', exchange.call)}
      {block(exchange.reply?.message_type === 4 ? 'Error' : 'Reply', exchange.reply)}
      <div style={{ gridColumn: '1/-1', fontSize: 11, color: C.slate }}>
        Message ID {exchange.call?.ocpp_message_id ?? exchange.reply?.ocpp_message_id ?? '—'}
      </div>
    </div>
  );
}
