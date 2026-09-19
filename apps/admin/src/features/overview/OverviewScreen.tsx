import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge, C, KPICard, STATUS_COLORS } from '@voltara/ui';
import { ISSUE_SEVERITY_LABELS, formatDateTime, formatKwh } from '@voltara/shared';
import type { IssueSeverity } from '@voltara/shared';
import { useChargePoints, useUptime, displayStatus } from '@/features/charge-points';
import { useIssues } from '@/features/issues';
import { OPEN_STATUSES, SessionsTable, useTodaySessions } from '@/features/sessions';
import { useRecentActivity } from './hooks';

const card: React.CSSProperties = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  overflow: 'hidden',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

/**
 * The live dashboard. Nothing here polls fast: the KPI cards are derived from
 * caches that the tenant Broadcast channel patches as events arrive.
 */
export function OverviewScreen() {
  const { data: chargePoints = [] } = useChargePoints();
  const { data: sessions = [] } = useTodaySessions();
  const { data: issues = [] } = useIssues();
  const { data: uptime = [] } = useUptime(30);
  const { data: activity = [] } = useRecentActivity();

  const fleet = useMemo(() => {
    let online = 0,
      available = 0,
      charging = 0,
      faulted = 0,
      connectors = 0;
    for (const cp of chargePoints) {
      if (cp.connection_state === 'online') online += 1;
      for (const c of cp.connectors) {
        connectors += 1;
        const s = displayStatus(cp, c);
        if (s === 'Available') available += 1;
        else if (s === 'Charging') charging += 1;
        else if (s === 'Faulted') faulted += 1;
      }
    }
    return { online, available, charging, faulted, connectors };
  }, [chargePoints]);

  const active = sessions.filter((s) => OPEN_STATUSES.includes(s.status));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = sessions.filter((s) => new Date(s.started_at) >= todayStart);
  const energyTodayWh = today.reduce((sum, s) => sum + (s.energy_wh ?? 0), 0);
  const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'in_progress');
  const uptimeAvg = uptime.length
    ? uptime.reduce((sum, u) => sum + (u.uptime_pct ?? 0), 0) /
      uptime.filter((u) => u.uptime_pct !== null).length
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Chargers Online"
          value={`${fleet.online}/${chargePoints.length}`}
          sub={`${fleet.available} of ${fleet.connectors} connectors available`}
          accent
        />
        <KPICard
          label="Charging Now"
          value={active.length}
          sub={`${fleet.charging} connectors delivering`}
        />
        <KPICard
          label="Energy Today"
          value={formatKwh(energyTodayWh, 1)}
          sub={`${today.length} session${today.length === 1 ? '' : 's'} started today`}
        />
        <KPICard
          label="Needs Attention"
          value={fleet.faulted + openIssues.length}
          sub={`${fleet.faulted} faulted · ${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'}`}
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}
      >
        <div style={card}>
          <div
            style={{
              padding: '16px 24px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={sectionTitle}>Live activity</span>
            <Link
              to="/ocpp-logs"
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                fontWeight: 600,
                color: C.green,
                textDecoration: 'none',
              }}
            >
              Frame log ›
            </Link>
          </div>
          {activity.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
              No status changes yet.
            </div>
          ) : (
            <div>
              {activity.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 24px',
                    borderBottom: `1px solid ${C.divider}`,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: C.slate, whiteSpace: 'nowrap', width: 150 }}>
                    {formatDateTime(a.recorded_at)}
                  </span>
                  <Link
                    to={`/charge-points/${a.charge_point_id}`}
                    style={{
                      color: C.ink,
                      fontWeight: 600,
                      textDecoration: 'none',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.charge_points?.name ?? a.charge_points?.ocpp_identity ?? '—'}
                  </Link>
                  <span style={{ color: C.slate, whiteSpace: 'nowrap' }}>
                    {a.ocpp_connector_id === 0
                      ? 'unit'
                      : `PL ${String(a.ocpp_connector_id).padStart(2, '0')}`}
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    <Badge status={a.status} />
                  </span>
                  {a.error_code && (
                    <span style={{ color: C.error, fontWeight: 600 }}>{a.error_code}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={card}>
            <div
              style={{
                padding: '16px 24px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={sectionTitle}>Uptime · 30 days</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: C.green }}>
                {uptimeAvg !== null && !Number.isNaN(uptimeAvg)
                  ? `${uptimeAvg.toFixed(1)}% fleet`
                  : '—'}
              </span>
            </div>
            {uptime.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.slate, fontSize: 13 }}>
                No connection history yet.
              </div>
            ) : (
              <div>
                {chargePoints
                  .map((cp) => ({ cp, u: uptime.find((u) => u.charge_point_id === cp.id) }))
                  .filter((x) => x.u)
                  .sort((a, b) => (a.u!.uptime_pct ?? 0) - (b.u!.uptime_pct ?? 0))
                  .slice(0, 8)
                  .map(({ cp, u }) => (
                    <div
                      key={cp.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '9px 24px',
                        borderBottom: `1px solid ${C.divider}`,
                        fontSize: 12,
                      }}
                    >
                      <Link
                        to={`/charge-points/${cp.id}`}
                        style={{
                          color: C.ink,
                          fontWeight: 600,
                          textDecoration: 'none',
                          width: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cp.name}
                      </Link>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 99,
                          background: C.divider,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${u!.uptime_pct ?? 0}%`,
                            height: '100%',
                            background:
                              (u!.uptime_pct ?? 0) >= 95
                                ? C.green
                                : (u!.uptime_pct ?? 0) >= 80
                                  ? C.warning
                                  : C.error,
                          }}
                        />
                      </div>
                      <span
                        style={{ width: 52, textAlign: 'right', fontWeight: 700, color: C.ink }}
                      >
                        {u!.uptime_pct === null ? '—' : `${u!.uptime_pct.toFixed(1)}%`}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={card}>
            <div
              style={{
                padding: '16px 24px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span style={sectionTitle}>Open issues</span>
              <Link
                to="/issues"
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.green,
                  textDecoration: 'none',
                }}
              >
                All issues ›
              </Link>
            </div>
            {openIssues.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.slate, fontSize: 13 }}>
                Nothing open.
              </div>
            ) : (
              openIssues.slice(0, 6).map((i) => (
                <Link
                  key={i.id}
                  to={`/issues?issue=${i.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 24px',
                    borderBottom: `1px solid ${C.divider}`,
                    fontSize: 12,
                    textDecoration: 'none',
                    color: C.ink,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {i.title}
                  </span>
                  <span style={{ color: C.slate, whiteSpace: 'nowrap' }}>
                    {i.charge_point_name ?? ''}
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    <Badge
                      status={ISSUE_SEVERITY_LABELS[i.severity as IssueSeverity]}
                      override={
                        STATUS_COLORS[
                          i.severity === 'critical'
                            ? 'Faulted'
                            : i.severity === 'high'
                              ? 'Reserved'
                              : i.severity === 'medium'
                                ? 'Pending'
                                : 'Inactive'
                        ]
                      }
                    />
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={sectionTitle}>Sessions today</span>
          <Link
            to="/sessions"
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              fontWeight: 600,
              color: C.green,
              textDecoration: 'none',
            }}
          >
            All sessions ›
          </Link>
        </div>
        <SessionsTable sessions={sessions.slice(0, 10)} emptyText="No sessions today." />
      </div>
    </div>
  );
}
