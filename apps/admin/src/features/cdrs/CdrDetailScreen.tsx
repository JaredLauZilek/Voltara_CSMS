import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, C } from '@voltara/ui';
import { billing, formatDateTime, formatDuration, formatKwh } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useCdr, useCreateReceipt } from './hooks';
import { UNBILLABLE_LABELS, linesOf, periodsOf, snapshotOf } from './types';

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

/** One priced session, reproducible from itself: the frozen tariff, the periods, the lines. */
export function CdrDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { tenantRole } = useAuth();
  const { data: cdr, isLoading } = useCdr(id);
  const receipt = useCreateReceipt();
  if (isLoading) return null;
  if (!cdr)
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        Record not found.{' '}
        <Link to="/cdrs" style={{ color: C.green, fontWeight: 600 }}>
          Back
        </Link>
      </div>
    );
  const lines = linesOf(cdr);
  const periods = periodsOf(cdr);
  const snapshot = snapshotOf(cdr);
  const canOperate = tenantRole !== 'viewer';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link
        to="/cdrs"
        style={{ fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: 'none' }}
      >
        ‹ Charging records
      </Link>

      <div
        style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}
            >
              {cdr.billable ? billing.formatSen(Number(cdr.total_sen)) : 'Unbillable'}
            </span>
            {cdr.billable ? (
              <Badge status="Billable" override={{ bg: C.honeydew, color: C.green }} />
            ) : (
              <Badge
                status={UNBILLABLE_LABELS[cdr.unbillable_reason ?? ''] ?? 'Unbillable'}
                override={{ bg: C.warningBg, color: C.warning }}
              />
            )}
            {cdr.document_number && (
              <Link to={`/documents/${cdr.invoice_document_id}`} style={{ textDecoration: 'none' }}>
                <Badge status={cdr.document_number} override={{ bg: C.infoBg, color: C.info }} />
              </Link>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
            {cdr.charge_point_id ? (
              <Link
                to={`/charge-points/${cdr.charge_point_id}`}
                style={{ color: C.green, fontWeight: 600, textDecoration: 'none' }}
              >
                {cdr.charge_point_name ?? cdr.ocpp_identity}
              </Link>
            ) : (
              cdr.ocpp_identity
            )}
            {cdr.ocpp_connector_id ? ` · connector ${cdr.ocpp_connector_id}` : ''} ·{' '}
            {cdr.location_name ?? 'no site'} · {formatDateTime(cdr.start_at)} →{' '}
            {formatDateTime(cdr.end_at)}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {cdr.charging_session_id && (
            <Link
              to={`/sessions/${cdr.charging_session_id}`}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.green,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Session
            </Link>
          )}
          {canOperate && cdr.billable && (
            <button
              onClick={() =>
                receipt.mutate(cdr.id, { onSuccess: (docId) => navigate(`/documents/${docId}`) })
              }
              disabled={receipt.isPending}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: 'none',
                background: C.green,
                color: C.white,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 700,
                cursor: receipt.isPending ? 'wait' : 'pointer',
              }}
            >
              {receipt.isPending ? 'Creating…' : 'Receipt'}
            </button>
          )}
        </div>
      </div>
      {receipt.error && (
        <div
          style={{
            fontSize: 12,
            color: C.error,
            fontWeight: 600,
            padding: '10px 12px',
            background: C.errorBg,
            borderRadius: 8,
          }}
        >
          {(receipt.error as Error).message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Stat label="Energy" value={formatKwh(Number(cdr.total_energy_wh), 3)} />
        <Stat label="Charging" value={formatDuration(cdr.total_time_s)} />
        <Stat
          label="Idle"
          value={cdr.total_parking_time_s ? formatDuration(cdr.total_parking_time_s) : '—'}
        />
        <Stat
          label="Payer"
          value={cdr.account_name ?? 'Ad-hoc'}
          sub={cdr.group_name ?? cdr.id_tag ?? undefined}
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, alignItems: 'start' }}
      >
        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
            <span style={sectionTitle}>Charges</span>
          </div>
          {lines.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 13 }}>
              No charges — {UNBILLABLE_LABELS[cdr.unbillable_reason ?? ''] ?? 'unbillable'}.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td style={{ padding: '10px 24px', color: C.ink }}>{l.label}</td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        color: C.ink,
                      }}
                    >
                      {billing.formatSen(l.amountInclSen)}
                    </td>
                  </tr>
                ))}
                {Number(cdr.tax_sen) > 0 && (
                  <tr style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td style={{ padding: '10px 24px', color: C.slate }}>
                      of which {snapshot?.tax_code ?? 'tax'} {cdr.tax_rate_bps / 100}%
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        color: C.slate,
                      }}
                    >
                      {billing.formatSen(Number(cdr.tax_sen))}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '12px 24px', fontWeight: 700, color: C.green }}>Total</td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: C.green,
                      fontSize: 15,
                    }}
                  >
                    {billing.formatSen(Number(cdr.total_sen))}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div style={card}>
          <span style={sectionTitle}>Tariff applied</span>
          {snapshot ? (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <Link
                  to={`/tariffs/${snapshot.tariff_id}`}
                  style={{ color: C.green, fontWeight: 700, textDecoration: 'none' }}
                >
                  {snapshot.name}
                </Link>{' '}
                <span style={{ color: C.slate }}>v{snapshot.version}</span>
              </div>
              <div style={{ color: C.ink }}>
                {snapshot.display_text ?? billing.describeElements(snapshot.elements)}
              </div>
              <div style={{ color: C.slate, fontSize: 12 }}>
                {snapshot.tax_included ? 'tax-inclusive prices' : 'tax added on top'} ·{' '}
                {snapshot.tax_code} {snapshot.tax_rate_bps / 100}%
              </div>
              {snapshot.resolved_by && (
                <div style={{ color: C.slate, fontSize: 12 }}>
                  matched: {snapshot.resolved_by.scope_type} · {snapshot.resolved_by.audience}
                </div>
              )}
              <div style={{ color: C.slate, fontSize: 11 }}>
                Frozen at session start — later tariff edits never touch this record.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.slate }}>
              No tariff applied when the session started.
            </div>
          )}
        </div>
      </div>

      {periods.length > 0 && (
        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
            <span style={sectionTitle}>Charging periods · {periods.length}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.seasalt }}>
                {['From', 'To', 'State', 'Energy'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 24px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.slate,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.divider}` }}>
                  <td style={{ padding: '8px 24px', color: C.slate }}>{formatDateTime(p.start)}</td>
                  <td style={{ padding: '8px 24px', color: C.slate }}>{formatDateTime(p.end)}</td>
                  <td style={{ padding: '8px 24px' }}>
                    <Badge status={p.charging ? 'Charging' : 'Finishing'} />
                  </td>
                  <td style={{ padding: '8px 24px', color: C.ink }}>{formatKwh(p.energyWh, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        padding: '16px 20px',
        border: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: C.green,
          letterSpacing: '-0.03em',
          marginTop: 8,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
