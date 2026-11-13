import { useNavigate } from 'react-router-dom';
import { Badge, C } from '@voltara/ui';
import { formatDateTime, formatDuration, formatKwh, formatRM, gunLetter } from '@voltara/shared';
import {
  SESSION_BADGE,
  billingType,
  currentType,
  listAmount,
  paymentStatus,
  sessionMinutes,
} from './types';
import type { SessionReportRow } from './types';

const HEADERS = [
  'Vehicle no.',
  'Driver',
  'Site',
  'Charger',
  'Gun',
  'Type',
  'Started',
  'Ended',
  'Duration',
  'Energy',
  'Amount',
  'Discount',
  'Final amount',
  'Billing',
  'Payment',
  'Status',
];

const cell: React.CSSProperties = { padding: '12px 16px', color: C.slate, whiteSpace: 'nowrap' };
const right: React.CSSProperties = {
  ...cell,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

/**
 * The sessions list in full: who charged, in which vehicle, where, for how
 * long, and what it cost before and after discount. Wider than the screen on
 * most displays, so it scrolls sideways inside its card.
 */
export function SessionsReportTable({
  sessions,
  isLoading,
}: {
  sessions: SessionReportRow[];
  isLoading?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {HEADERS.map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    textAlign: ['Amount', 'Discount', 'Final amount', 'Energy'].includes(h)
                      ? 'right'
                      : 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.slate,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
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
              const list = listAmount(s);
              const discount = Number(s.amount_discount ?? 0);
              const billing = billingType(s);
              const type = currentType(s.connector_type);
              return (
                <tr
                  key={s.id}
                  style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ ...cell, fontWeight: 700, color: C.ink, fontFamily: 'monospace' }}>
                    {s.vehicle_plate ?? '—'}
                  </td>
                  <td style={cell}>
                    {s.driver_user_id ? (
                      <>
                        <div style={{ color: C.ink, fontWeight: 600 }}>
                          {s.driver_name ?? s.driver_email ?? 'App driver'}
                        </div>
                        {s.driver_name && s.driver_email && (
                          <div style={{ fontSize: 11 }}>{s.driver_email}</div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {s.id_tag ?? '—'}
                      </span>
                    )}
                  </td>
                  <td style={cell}>
                    {s.location_name ?? '—'}
                    {s.parking_lot && <div style={{ fontSize: 11 }}>Lot {s.parking_lot}</div>}
                  </td>
                  <td style={{ ...cell, fontWeight: 600, color: C.ink }}>
                    {s.charge_point_identity}
                  </td>
                  <td style={cell}>{s.ocpp_connector_id ? gunLetter(s.ocpp_connector_id) : '—'}</td>
                  <td style={cell}>
                    {type ?? '—'}
                    {s.max_kw != null && (
                      <span style={{ fontSize: 11 }}> · {Number(s.max_kw)} kW</span>
                    )}
                  </td>
                  <td style={cell}>{formatDateTime(s.started_at)}</td>
                  <td style={cell}>{s.ended_at ? formatDateTime(s.ended_at) : '—'}</td>
                  <td style={cell}>
                    {s.status === 'orphaned' && !s.meter_start_wh
                      ? '—'
                      : formatDuration(sessionMinutes(s) * 60)}
                  </td>
                  <td style={{ ...right, fontWeight: 600, color: C.green }}>
                    {formatKwh(s.energy_wh)}
                  </td>
                  <td style={right}>{list !== null ? formatRM(list, 2) : '—'}</td>
                  <td
                    style={{ ...right, color: discount > 0 ? C.green : C.slate }}
                    title={
                      s.discount_bps
                        ? `${s.discount_bps / 100}% off energy · ${s.driver_group_name ?? 'whitelist'}`
                        : undefined
                    }
                  >
                    {discount > 0 ? `−${formatRM(discount, 2)}` : '—'}
                  </td>
                  <td
                    style={{ ...right, fontWeight: 700, color: C.ink }}
                    title={
                      s.amount_gross === null
                        ? s.ended_at
                          ? 'Not priced — no tariff applied'
                          : 'Priced when the session ends'
                        : s.amount_tax
                          ? `incl. ${formatRM(Number(s.amount_tax), 2)} tax`
                          : undefined
                    }
                  >
                    {s.amount_gross !== null ? formatRM(Number(s.amount_gross), 2) : '—'}
                  </td>
                  <td style={cell}>
                    <span style={{ color: C.ink, fontWeight: 600 }}>{billing}</span>
                    {(s.billing_account_name || s.driver_group_name) && (
                      <div style={{ fontSize: 11 }}>
                        {billing === 'Corporate' ? s.billing_account_name : s.driver_group_name}
                      </div>
                    )}
                  </td>
                  <td
                    style={cell}
                    title={
                      paymentStatus(s) === 'Pending'
                        ? 'Card payments are not live yet — nothing has been collected.'
                        : undefined
                    }
                  >
                    {paymentStatus(s)}
                  </td>
                  <td style={cell}>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isLoading && sessions.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
          No sessions found.
        </div>
      )}
    </div>
  );
}
