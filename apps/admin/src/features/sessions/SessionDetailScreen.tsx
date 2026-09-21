import { Link, useParams } from 'react-router-dom';
import { Badge, C, LineChart } from '@voltara/ui';
import { billing } from '@voltara/shared';
import { formatDateTime, formatDuration, formatKw, formatKwh } from '@voltara/shared';
import { useSessionCdr } from '@/features/cdrs';
import { useSessionDetail, useSessionMinutes } from './hooks';
import { OPEN_STATUSES, SESSION_BADGE, SESSION_STATUS_LABELS } from './types';
import type { SessionStatus } from './types';

const card: React.CSSProperties = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

/** One session: the numbers, and the power/energy curve from the per-minute rollup. */
export function SessionDetailScreen() {
  const { id = '' } = useParams();
  const { data, isLoading } = useSessionDetail(id);
  const session = data?.session ?? null;
  const open = session ? OPEN_STATUSES.includes(session.status) : false;
  const { data: minutes = [] } = useSessionMinutes(id, open);
  const { data: cdr } = useSessionCdr(id);

  if (isLoading) return null;
  if (!session) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        Session not found.{' '}
        <Link to="/sessions" style={{ color: C.green, fontWeight: 600 }}>
          Back to sessions
        </Link>
      </div>
    );
  }

  const endMs = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const durationS = Math.max(0, (endMs - new Date(session.started_at).getTime()) / 1000);
  const powerSeries = minutes.map((m) => Number(m.avg_power_w ?? 0));
  const energySeries = minutes.map((m) =>
    Math.max(0, Number(m.energy_wh ?? 0) - Number(session.meter_start_wh ?? 0)),
  );
  const labelEvery = Math.max(1, Math.ceil(minutes.length / 8));
  const labels = minutes.map((m, i) =>
    i % labelEvery === 0
      ? new Date(m.minute).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '',
  );
  const peakW = powerSeries.length
    ? Math.max(...minutes.map((m) => Number(m.max_power_w ?? 0)))
    : null;
  const livePower =
    data?.livePowerW ?? (open && powerSeries.length ? powerSeries[powerSeries.length - 1] : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link
        to="/sessions"
        style={{ fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: 'none' }}
      >
        ‹ Sessions
      </Link>

      <div
        style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}
            >
              Transaction {session.ocpp_transaction_id}
            </span>
            <Badge status={SESSION_BADGE[session.status] ?? session.status} />
            {session.offline && <Badge status="Replayed" />}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
            {session.charge_point_id ? (
              <Link
                to={`/charge-points/${session.charge_point_id}`}
                style={{ color: C.green, fontWeight: 600, textDecoration: 'none' }}
              >
                {session.charge_point_name ?? session.charge_point_identity}
              </Link>
            ) : (
              '—'
            )}
            {' · connector '}
            {session.ocpp_connector_id}
            {session.id_tag ? (
              <>
                {' '}
                · <span style={{ fontFamily: 'monospace' }}>{session.id_tag}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {cdr && (
        <Link to={`/cdrs/${cdr.id}`} style={{ textDecoration: 'none' }}>
          <div
            style={{
              ...card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              background: cdr.billable ? C.honeydew : C.warningBg,
              borderColor: cdr.billable ? C.green : C.warning,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: cdr.billable ? C.green : C.warning,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {cdr.billable ? 'Priced' : 'Unbillable'}
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: cdr.billable ? C.green : C.warning,
                letterSpacing: '-0.03em',
                fontFamily: 'monospace',
              }}
            >
              {cdr.billable
                ? billing.formatSen(Number(cdr.total_sen))
                : cdr.unbillable_reason?.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 12, color: C.slate }}>
              {cdr.billable
                ? `incl. ${billing.formatSen(Number(cdr.tax_sen))} tax · ${cdr.document_number ? `on ${cdr.document_number}` : 'not yet invoiced'}`
                : 'recorded, not billed'}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.green }}>
              Charging record ›
            </span>
          </div>
        </Link>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Stat label="Energy" value={formatKwh(session.energy_wh, 2)} accent />
        <Stat
          label={open ? 'Power now' : 'Peak power'}
          value={open ? formatKw(livePower) : formatKw(peakW)}
        />
        <Stat
          label="Duration"
          value={formatDuration(durationS)}
          sub={open ? 'still running' : undefined}
        />
        <Stat
          label="Status"
          value={SESSION_STATUS_LABELS[session.status as SessionStatus]}
          sub={session.stop_reason ? `stopped: ${session.stop_reason}` : undefined}
        />
      </div>

      <div style={card}>
        <div style={sectionTitle}>Power · kW</div>
        {powerSeries.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.slate, fontSize: 13 }}>
            {open
              ? 'The first minute of readings arrives after the rollup runs (every 5 minutes).'
              : 'No meter readings were recorded for this session.'}
          </div>
        ) : (
          <LineChart
            data={powerSeries}
            labels={labels}
            formatValue={(v) => (v / 1000).toFixed(1)}
            showPoints={powerSeries.length <= 30}
            gradientId="power"
          />
        )}
      </div>

      <div style={card}>
        <div style={sectionTitle}>Energy delivered · kWh</div>
        {energySeries.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.slate, fontSize: 13 }}>
            No readings.
          </div>
        ) : (
          <LineChart
            data={energySeries}
            labels={labels}
            color={C.opal}
            formatValue={(v) => (v / 1000).toFixed(1)}
            showPoints={energySeries.length <= 30}
            gradientId="energy"
          />
        )}
      </div>

      <div style={card}>
        <div style={sectionTitle}>Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Meta label="Started" value={formatDateTime(session.started_at)} />
          <Meta label="Ended" value={session.ended_at ? formatDateTime(session.ended_at) : '—'} />
          <Meta label="Start source" value={session.start_source} />
          <Meta
            label="Meter start"
            value={session.meter_start_wh != null ? `${session.meter_start_wh} Wh` : '—'}
          />
          <Meta
            label="Meter stop"
            value={session.meter_stop_wh != null ? `${session.meter_stop_wh} Wh` : '—'}
          />
          <Meta label="Stop tag" value={session.stop_id_tag ?? '—'} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? C.green : C.white,
        borderRadius: 16,
        padding: '20px 24px',
        border: `1px solid ${accent ? C.green : C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: accent ? 'rgba(255,255,255,0.7)' : C.slate,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: accent ? C.yellow : C.green,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          marginTop: 12,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{ fontSize: 12, color: accent ? 'rgba(255,255,255,0.6)' : C.slate, marginTop: 8 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.slate,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}
