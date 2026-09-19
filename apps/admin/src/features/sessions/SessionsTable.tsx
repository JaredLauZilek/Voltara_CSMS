import { useNavigate } from 'react-router-dom';
import { Badge, C } from '@voltara/ui';
import { formatDateTime, formatDuration, formatKwh } from '@voltara/shared';
import { SESSION_BADGE } from './types';
import type { SessionWithChargePoint } from './types';

/** Shared list body — the sessions screen, the charger tab, and the dashboard. */
export function SessionsTable({
  sessions,
  isLoading,
  showCharger = true,
  emptyText = 'No sessions found.',
}: {
  sessions: SessionWithChargePoint[];
  isLoading?: boolean;
  showCharger?: boolean;
  emptyText?: string;
}) {
  const navigate = useNavigate();
  const headers = [
    ...(showCharger ? ['Charger'] : []),
    'Connector',
    'Status',
    'Started',
    'Duration',
    'Energy',
    'ID Tag',
    'Txn',
  ];

  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: C.seasalt }}>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.slate,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const open = s.ended_at === null;
            const durationS =
              ((open ? Date.now() : new Date(s.ended_at!).getTime()) -
                new Date(s.started_at).getTime()) /
              1000;
            return (
              <tr
                key={s.id}
                style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
                onClick={() => navigate(`/sessions/${s.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {showCharger && (
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: C.ink }}>
                    {s.charge_point_name ?? s.charge_point_identity ?? '—'}
                  </td>
                )}
                <td style={{ padding: '12px 16px', color: C.slate }}>
                  {s.ocpp_connector_id || '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge status={SESSION_BADGE[s.status] ?? s.status} />
                  {s.offline && (
                    <span
                      style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.slate }}
                      title="Replayed from the charger's offline buffer"
                    >
                      · replayed
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
                  {formatDateTime(s.started_at)}
                </td>
                <td style={{ padding: '12px 16px', color: C.slate }}>
                  {s.status === 'orphaned' && !s.meter_start_wh
                    ? '—'
                    : formatDuration(Math.max(0, durationS))}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: C.green }}>
                  {formatKwh(s.energy_wh)}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: C.slate,
                  }}
                >
                  {s.id_tag ?? '—'}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: C.slate,
                  }}
                >
                  {s.ocpp_transaction_id}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!isLoading && sessions.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}
