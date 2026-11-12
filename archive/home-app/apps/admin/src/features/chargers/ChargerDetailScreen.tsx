import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, BarChart, C, LineChart, STATUS_COLORS } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { errorMessage } from '@/shared/lib/errors';
import {
  dayKey,
  formatDate,
  formatDateTime,
  formatDayShort,
  formatDuration,
  formatRelative,
  formatTime,
} from '@/shared/lib/format';
import {
  backLink,
  cancelButton,
  card,
  cardHeader,
  dangerButton,
  dangerOutlineButton,
  emptyState,
  errorText,
  linkStyle,
  paddedCard,
  rowStyle,
  secondaryButton,
  sectionTitle,
  smallButton,
  table,
  td,
  th,
} from '@/shared/lib/styles';
import { LifecycleBadge, SeverityBadge, StateBadge } from './badges';
import { CommissionModal } from './CommissionModal';
import {
  useCharger,
  useChargerEvents,
  useDailyEnergy,
  useDecommissionCharger,
  useHousehold,
  useReadings,
  useReleaseCharger,
  useSessions,
} from './hooks';
import { parseLastStatus } from './types';
import type { ChargerRow, ReadingPoint } from './types';

export function ChargerDetailScreen() {
  const { id = '' } = useParams();
  const { data: charger, isLoading } = useCharger(id);

  if (isLoading) return <div style={emptyState}>Loading…</div>;
  if (!charger) {
    return (
      <div style={emptyState}>
        Charger not found.{' '}
        <Link to="/chargers" style={linkStyle}>
          Back to chargers
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link to="/chargers" style={backLink}>
        ‹ Chargers
      </Link>
      <HeaderCard charger={charger} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <LiveStatusCard charger={charger} />
        <EnergyCard chargerId={charger.id} />
      </div>
      <ReadingsCard chargerId={charger.id} />
      <SessionsCard chargerId={charger.id} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <EventsCard chargerId={charger.id} />
        <HouseholdCard charger={charger} />
      </div>
    </div>
  );
}

// ── Header + actions ────────────────────────────────────────────────────────

function HeaderCard({ charger }: { charger: ChargerRow }) {
  const { isStaffSupport, isDealer } = useAuth();
  const [showCommission, setShowCommission] = useState(false);
  const [confirm, setConfirm] = useState<'decommission' | 'release' | null>(null);
  const decommission = useDecommissionCharger();
  const release = useReleaseCharger();

  const canCommission = (isStaffSupport || isDealer) && charger.lifecycle !== 'decommissioned';
  const canDecommission = isStaffSupport && charger.lifecycle !== 'decommissioned';
  const canRelease = isStaffSupport && charger.lifecycle === 'claimed';
  const busy = decommission.isPending || release.isPending;
  const error = errorMessage(decommission.error) ?? errorMessage(release.error);

  const site = [
    charger.site_label,
    charger.city,
    [charger.state, charger.postcode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ');

  const runConfirm = () => {
    if (confirm === 'decommission') {
      decommission.mutate(charger.id, { onSuccess: () => setConfirm(null) });
    } else if (confirm === 'release') {
      release.mutate(charger.id, { onSuccess: () => setConfirm(null) });
    }
  };

  return (
    <div style={paddedCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}
            >
              {charger.name}
            </span>
            <LifecycleBadge lifecycle={charger.lifecycle} />
            <StateBadge row={charger} />
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 4, fontFamily: 'monospace' }}>
            {charger.serial}
          </div>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {confirm ? (
            <ConfirmRow
              text={
                confirm === 'decommission'
                  ? 'Decommission this charger? It cannot be claimed or used again.'
                  : 'Release ownership? The household is removed and the owner must claim it again.'
              }
              busy={busy}
              onConfirm={runConfirm}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <>
              {canRelease && (
                <button
                  onClick={() => setConfirm('release')}
                  style={{ ...dangerOutlineButton, ...smallButton }}
                >
                  Release ownership
                </button>
              )}
              {canDecommission && (
                <button
                  onClick={() => setConfirm('decommission')}
                  style={{ ...dangerOutlineButton, ...smallButton }}
                >
                  Decommission
                </button>
              )}
              {canCommission && (
                <button onClick={() => setShowCommission(true)} style={secondaryButton}>
                  {charger.lifecycle === 'registered' ? 'Commission' : 'Edit commissioning'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div style={errorText}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Meta
          label="Model"
          value={charger.model_name}
          sub={[charger.model_brand, charger.model_code].filter(Boolean).join(' ')}
        />
        <Meta label="Firmware" value={charger.firmware_version} />
        <Meta
          label="Dealer"
          value={
            charger.dealer_id ? (
              <Link to={`/dealers/${charger.dealer_id}`} style={linkStyle}>
                {charger.dealer_name ?? 'Dealer'}
              </Link>
            ) : null
          }
        />
        <Meta label="Installer" value={charger.installer_name} />
        <Meta
          label="Owner"
          value={
            charger.owner_user_id ? (
              <Link to={`/chargers?owner=${charger.owner_user_id}`} style={linkStyle}>
                {charger.owner_name ?? charger.owner_email ?? 'Owner'}
              </Link>
            ) : null
          }
          sub={charger.owner_email}
        />
        <Meta label="Site" value={site || null} />
        <Meta
          label="Commissioned"
          value={charger.commissioned_at ? formatDateTime(charger.commissioned_at) : null}
        />
        <Meta
          label="Claimed"
          value={charger.claimed_at ? formatDateTime(charger.claimed_at) : null}
        />
      </div>

      {showCommission && (
        <CommissionModal charger={charger} onClose={() => setShowCommission(false)} />
      )}
    </div>
  );
}

function ConfirmRow({
  text,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>{text}</span>
      <button
        onClick={onConfirm}
        disabled={busy}
        style={{ ...dangerButton, ...smallButton, cursor: busy ? 'wait' : 'pointer' }}
      >
        {busy ? 'Working…' : 'Confirm'}
      </button>
      <button onClick={onCancel} style={{ ...cancelButton, ...smallButton }}>
        Cancel
      </button>
    </div>
  );
}

function Meta({ label, value, sub }: { label: string; value: ReactNode; sub?: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...sectionTitle, fontSize: 10 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 4 }}>
        {value ?? '—'}
      </div>
      {sub ? <div style={{ fontSize: 11, color: C.slate }}>{sub}</div> : null}
    </div>
  );
}

// ── Live status + settings ─────────────────────────────────────────────────

function fmt(v: number | null, unit: string, dp: number): string | null {
  return v == null ? null : `${v.toFixed(dp)} ${unit}`;
}

function triple(
  a: number | null,
  b: number | null,
  c: number | null,
  unit: string,
  dp: number,
): string | null {
  if (a == null && b == null && c == null) return null;
  return `${[a, b, c].map((x) => (x ?? 0).toFixed(dp)).join(' / ')} ${unit}`;
}

function LiveStatusCard({ charger }: { charger: ChargerRow }) {
  const status = parseLastStatus(charger.last_status);
  const applied =
    charger.settings_version != null &&
    charger.settings_applied_version === charger.settings_version;
  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={sectionTitle}>Live status</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.slate }}>
          {charger.last_seen_at
            ? `Last seen ${formatRelative(charger.last_seen_at)}`
            : 'Never seen'}
        </span>
      </div>
      {!status ? (
        <div style={emptyState}>No readings yet.</div>
      ) : (
        <div
          style={{
            padding: '16px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          <Meta label="State" value={<StateBadge row={charger} />} />
          <Meta label="Power" value={fmt(status.power_kw, 'kW', 2)} />
          <Meta label="Current" value={triple(status.i1, status.i2, status.i3, 'A', 1)} />
          <Meta label="Voltage" value={triple(status.v1, status.v2, status.v3, 'V', 0)} />
          <Meta
            label="Energy total"
            value={fmt(status.energy_total_kwh, 'kWh', 1)}
            sub={
              status.session_kwh != null
                ? `${status.session_kwh.toFixed(2)} kWh this session`
                : null
            }
          />
          <Meta label="Temperature" value={fmt(status.temperature_c, '°C', 1)} />
          <Meta
            label="Reported"
            value={status.at ? formatDateTime(status.at) : null}
            sub={status.source ? `via ${status.source}` : null}
          />
        </div>
      )}
      <div
        style={{
          borderTop: `1px solid ${C.divider}`,
          padding: '16px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        <Meta
          label="Max current"
          value={charger.max_current_a != null ? `${charger.max_current_a} A` : null}
          sub={charger.rated_current_a != null ? `rated ${charger.rated_current_a} A` : null}
        />
        <Meta
          label="Cable lock"
          value={charger.cable_locked == null ? null : charger.cable_locked ? 'Locked' : 'Unlocked'}
        />
        <Meta
          label="Settings"
          value={
            charger.settings_version == null ? null : (
              <Badge
                status={applied ? 'Applied' : 'Pending on charger'}
                override={STATUS_COLORS[applied ? 'Completed' : 'Pending']}
              />
            )
          }
          sub={
            charger.settings_version != null
              ? `v${charger.settings_version}${applied ? '' : ` · applied v${charger.settings_applied_version ?? 0}`}`
              : null
          }
        />
      </div>
    </div>
  );
}

// ── Charts ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function EnergyCard({ chargerId }: { chargerId: string }) {
  const { data: rows = [], isLoading } = useDailyEnergy(chargerId, 30);
  const series = useMemo(() => {
    const byDay = new Map(rows.map((r) => [r.day ?? '', r]));
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * DAY_MS));
    const data = days.map((d) => [Number(byDay.get(dayKey(d))?.kwh ?? 0)]);
    const labels = days.map((d, i) => (i % 5 === 4 ? formatDayShort(d) : ''));
    const total = data.reduce((s, [v]) => s + v, 0);
    const sessions = rows.reduce((s, r) => s + Number(r.sessions ?? 0), 0);
    return { data, labels, total, sessions };
  }, [rows]);

  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={sectionTitle}>Energy · last 30 days</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: C.green }}>
          {series.total.toFixed(1)} kWh · {series.sessions} session
          {series.sessions === 1 ? '' : 's'}
        </span>
      </div>
      {!isLoading && rows.length === 0 ? (
        <div style={emptyState}>No sessions in the last 30 days.</div>
      ) : (
        <div style={{ padding: '16px 16px 8px' }}>
          <BarChart data={series.data} labels={series.labels} height={180} />
        </div>
      )}
    </div>
  );
}

/** Bucket-average dense series so the SVG stays light. */
function downsample(points: ReadingPoint[], max: number): ReadingPoint[] {
  if (points.length <= max) return points;
  const bucket = Math.ceil(points.length / max);
  const out: ReadingPoint[] = [];
  for (let i = 0; i < points.length; i += bucket) {
    const slice = points.slice(i, i + bucket);
    const avg = slice.reduce((s, p) => s + (p.power_kw ?? 0), 0) / slice.length;
    out.push({
      recorded_at: slice[0].recorded_at,
      power_kw: avg,
      state: slice[slice.length - 1].state,
    });
  }
  return out;
}

function ReadingsCard({ chargerId }: { chargerId: string }) {
  const { data: points = [], isLoading } = useReadings(chargerId, 24);
  const series = useMemo(() => {
    const sampled = downsample(points, 300);
    const data = sampled.map((p) => p.power_kw ?? 0);
    const every = Math.max(1, Math.ceil(sampled.length / 6));
    const labels = sampled.map((p, i) => (i % every === 0 ? formatTime(p.recorded_at) : ''));
    const peak = data.reduce((m, v) => Math.max(m, v), 0);
    return { data, labels, peak };
  }, [points]);

  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={sectionTitle}>Readings · last 24 h</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.slate }}>
          {points.length === 0
            ? ''
            : `Peak ${series.peak.toFixed(2)} kW · ${points.length} sample${points.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {!isLoading && points.length === 0 ? (
        <div style={emptyState}>No readings in the last 24 h.</div>
      ) : (
        <div style={{ padding: '16px 16px 8px' }}>
          <LineChart
            data={series.data}
            labels={series.labels}
            height={180}
            showPoints={false}
            formatValue={(v) => `${v.toFixed(1)} kW`}
            gradientId="readings-fill"
          />
        </div>
      )}
    </div>
  );
}

// ── Sessions, events, household ────────────────────────────────────────────

function SessionsCard({ chargerId }: { chargerId: string }) {
  const { data: sessions = [], isLoading } = useSessions(chargerId);
  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={sectionTitle}>Sessions</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.slate }}>Newest 20</span>
      </div>
      <table style={table}>
        <thead>
          <tr style={{ background: C.seasalt }}>
            {['Started', 'Duration', 'kWh', 'Peak kW', 'Stop reason'].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} style={rowStyle}>
              <td style={{ ...td, color: C.ink, fontWeight: 600 }}>
                {formatDateTime(s.started_at)}
              </td>
              <td style={td}>
                {s.ended_at
                  ? formatDuration(
                      new Date(s.ended_at).getTime() - new Date(s.started_at).getTime(),
                    )
                  : 'In progress'}
              </td>
              <td style={td}>{s.kwh == null ? '—' : s.kwh.toFixed(2)}</td>
              <td style={td}>{s.max_power_kw == null ? '—' : s.max_power_kw.toFixed(2)}</td>
              <td style={td}>{s.stop_reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!isLoading && sessions.length === 0 && <div style={emptyState}>No sessions yet.</div>}
    </div>
  );
}

function EventsCard({ chargerId }: { chargerId: string }) {
  const { data: events = [], isLoading } = useChargerEvents(chargerId);
  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={sectionTitle}>Events</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.slate }}>Newest 30</span>
      </div>
      {!isLoading && events.length === 0 ? (
        <div style={emptyState}>No events yet.</div>
      ) : (
        events.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 24px',
              borderBottom: `1px solid ${C.divider}`,
              fontSize: 12,
            }}
          >
            <span style={{ color: C.slate, whiteSpace: 'nowrap', width: 130, flexShrink: 0 }}>
              {formatDateTime(e.created_at)}
            </span>
            <span
              style={{
                color: C.ink,
                fontWeight: 600,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {e.message ?? e.type}
            </span>
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <SeverityBadge severity={e.severity} />
            </span>
          </div>
        ))
      )}
    </div>
  );
}

const MEMBER_FAMILY: Record<string, string> = {
  Owner: 'Active',
  Member: 'In Progress',
  Guest: 'Inactive',
};

function PersonRow({
  name,
  email,
  role,
  since,
}: {
  name: string;
  email: string | null;
  role: 'Owner' | 'Member' | 'Guest';
  since: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 24px',
        borderBottom: `1px solid ${C.divider}`,
        fontSize: 13,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: C.honeydew,
          color: C.green,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {name[0]?.toUpperCase() ?? '?'}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: C.ink }}>{name}</div>
        {email && <div style={{ fontSize: 11, color: C.slate }}>{email}</div>}
      </div>
      <span style={{ marginLeft: 'auto' }}>
        <Badge status={role} override={STATUS_COLORS[MEMBER_FAMILY[role]]} />
      </span>
      <span style={{ fontSize: 11, color: C.slate, whiteSpace: 'nowrap' }}>
        {since ? formatDate(since) : ''}
      </span>
    </div>
  );
}

function HouseholdCard({ charger }: { charger: ChargerRow }) {
  const { data: members = [], isLoading } = useHousehold(charger.id);
  const hasOwner = !!charger.owner_user_id;
  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={sectionTitle}>Household</span>
      </div>
      {!hasOwner && !isLoading && members.length === 0 ? (
        <div style={emptyState}>No owner yet.</div>
      ) : (
        <div>
          {hasOwner && (
            <PersonRow
              name={charger.owner_name ?? charger.owner_email ?? 'Owner'}
              email={charger.owner_email}
              role="Owner"
              since={charger.claimed_at}
            />
          )}
          {members.map((m) => (
            <PersonRow
              key={m.user_id}
              name={m.full_name || m.email || m.user_id}
              email={m.email}
              role={m.role === 'guest' ? 'Guest' : 'Member'}
              since={m.created_at}
            />
          ))}
        </div>
      )}
    </div>
  );
}
