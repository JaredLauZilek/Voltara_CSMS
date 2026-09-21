import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, C } from '@voltara/ui';
import { billing, formatDate, formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { downloadText, toCsv } from '@/shared/lib/csv';
import { useDocument, useIssueDocument, useVoidDocument } from './hooks';
import { DOC_STATUS_BADGE, KIND_LABELS, linesOf, partyOf } from './types';

/**
 * The document itself, laid out for A4. "Print / Save as PDF" uses the
 * browser's print path; the print stylesheet hides the app shell so the sheet
 * is exactly what a JMB or driver receives.
 */
export function DocumentScreen() {
  const { id = '' } = useParams();
  const { tenantRole } = useAuth();
  const { data: doc, isLoading } = useDocument(id);
  const issue = useIssueDocument();
  const voidMut = useVoidDocument();
  const [confirmVoid, setConfirmVoid] = useState(false);
  if (isLoading) return null;
  if (!doc)
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        Document not found.{' '}
        <Link to="/documents" style={{ color: C.green, fontWeight: 600 }}>
          Back
        </Link>
      </div>
    );

  const lines = linesOf(doc);
  const seller = partyOf(doc.seller);
  const buyer = partyOf(doc.buyer);
  const isSettlement = doc.kind === 'settlement';
  const canAct = tenantRole === 'owner' || tenantRole === 'admin';
  const error = issue.error ?? voidMut.error;

  const exportCsv = () =>
    downloadText(
      `${doc.number}.csv`,
      toCsv(lines, [
        { header: 'Date', value: (l) => (l.date ? formatDateTime(l.date) : '') },
        { header: 'Description', value: (l) => l.description },
        {
          header: 'Quantity',
          value: (l) =>
            l.quantity != null
              ? l.unit === 'Wh'
                ? (l.quantity / 1000).toFixed(3)
                : l.quantity
              : '',
        },
        { header: 'Unit', value: (l) => (l.unit === 'Wh' ? 'kWh' : (l.unit ?? '')) },
        {
          header: 'Excl. tax (RM)',
          value: (l) => ((l.amount_excl_sen ?? l.amount_sen ?? 0) / 100).toFixed(2),
        },
        { header: 'Tax (RM)', value: (l) => ((l.tax_sen ?? 0) / 100).toFixed(2) },
        {
          header: 'Total (RM)',
          value: (l) => ((l.amount_incl_sen ?? l.amount_sen ?? 0) / 100).toFixed(2),
        },
      ]),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`@media print { aside, [data-voltara-header], .voltara-doc-actions { display: none !important; } [data-voltara-main] { padding: 0 !important; overflow: visible !important; } .voltara-sheet { border: none !important; box-shadow: none !important; } body { background: white !important; } }`}</style>

      <div
        className="voltara-doc-actions"
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
      >
        <Link
          to="/documents"
          style={{ fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: 'none' }}
        >
          ‹ Documents
        </Link>
        <Badge status={DOC_STATUS_BADGE[doc.status]} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} style={secondary}>
            Export lines (CSV)
          </button>
          <button onClick={() => window.print()} style={secondary}>
            Print / Save as PDF
          </button>
          {canAct && doc.status === 'draft' && (
            <button
              onClick={() => issue.mutate(doc.id)}
              disabled={issue.isPending}
              style={{ ...secondary, background: C.green, color: C.white, border: 'none' }}
            >
              {issue.isPending ? 'Issuing…' : 'Issue'}
            </button>
          )}
          {canAct &&
            doc.status !== 'void' &&
            (confirmVoid ? (
              <span
                style={{
                  display: 'inline-flex',
                  gap: 6,
                  alignItems: 'center',
                  fontSize: 12,
                  color: C.error,
                  fontWeight: 600,
                }}
              >
                Void this document?
                <button
                  onClick={() => voidMut.mutate(doc.id, { onSuccess: () => setConfirmVoid(false) })}
                  style={{ ...secondary, background: C.error, color: C.white, border: 'none' }}
                >
                  Confirm
                </button>
                <button onClick={() => setConfirmVoid(false)} style={secondary}>
                  Cancel
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmVoid(true)} style={{ ...secondary, color: C.error }}>
                Void…
              </button>
            ))}
        </span>
      </div>
      {error && (
        <div
          className="voltara-doc-actions"
          style={{
            fontSize: 12,
            color: C.error,
            fontWeight: 600,
            padding: '10px 12px',
            background: C.errorBg,
            borderRadius: 8,
          }}
        >
          {(error as Error).message}
        </div>
      )}

      <div
        className="voltara-sheet"
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          padding: '40px 48px',
          maxWidth: 820,
          width: '100%',
          alignSelf: 'center',
          boxSizing: 'border-box',
          position: 'relative',
          fontFamily: 'Figtree',
        }}
      >
        {doc.status === 'void' && (
          <div
            style={{
              position: 'absolute',
              top: 24,
              right: 32,
              fontSize: 40,
              fontWeight: 800,
              color: C.errorBgSoft,
              letterSpacing: '0.1em',
              transform: 'rotate(-12deg)',
            }}
          >
            VOID
          </div>
        )}
        {doc.status === 'draft' && (
          <div
            style={{
              position: 'absolute',
              top: 24,
              right: 32,
              fontSize: 28,
              fontWeight: 800,
              color: C.border,
              letterSpacing: '0.1em',
              transform: 'rotate(-12deg)',
            }}
          >
            DRAFT
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 24,
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{ fontSize: 22, fontWeight: 800, color: C.green, letterSpacing: '-0.03em' }}
            >
              {seller.trading_name ?? seller.name}
            </div>
            <Party p={seller} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.slate,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {KIND_LABELS[doc.kind]}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: C.ink,
                fontFamily: 'monospace',
                marginTop: 4,
              }}
            >
              {doc.number}
            </div>
            <div style={{ fontSize: 12, color: C.slate, marginTop: 6, lineHeight: 1.6 }}>
              {doc.issued_at ? (
                <>
                  Issued {formatDate(doc.issued_at)}
                  <br />
                </>
              ) : (
                <>
                  Created {formatDate(doc.created_at)}
                  <br />
                </>
              )}
              {doc.period_start && (
                <>
                  Period {formatDate(doc.period_start)} –{' '}
                  {formatDate(doc.period_end ?? doc.period_start)}
                  <br />
                </>
              )}
              {doc.due_at && doc.kind === 'invoice' && <>Due {formatDate(doc.due_at)}</>}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.slate,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}
            >
              {isSettlement
                ? 'Statement for'
                : doc.kind === 'receipt'
                  ? 'Received from'
                  : 'Bill to'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
              {buyer.legal_name ?? buyer.name ?? '—'}
            </div>
            <Party p={buyer} />
          </div>
          {doc.location_name && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.slate,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                }}
              >
                Site
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{doc.location_name}</div>
            </div>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 28 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.green}` }}>
              {(isSettlement
                ? ['Description', 'Amount']
                : ['Description', 'Qty', 'Excl. tax', 'Tax', 'Total']
              ).map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 6px',
                    textAlign: i === 0 ? 'left' : 'right',
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.slate,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: `1px solid ${C.divider}`,
                  color: l.kind === 'info' ? C.slate : C.ink,
                }}
              >
                <td style={{ padding: '9px 6px' }}>
                  {l.date ? (
                    <span style={{ color: C.slate, fontSize: 12, marginRight: 8 }}>
                      {formatDate(l.date)}
                    </span>
                  ) : null}
                  {l.description}
                </td>
                {isSettlement ? (
                  <td
                    style={{
                      padding: '9px 6px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontWeight: l.kind === 'info' ? 500 : 700,
                      color:
                        l.kind === 'info' ? C.slate : (l.amount_sen ?? 0) < 0 ? C.error : C.ink,
                    }}
                  >
                    {l.kind === 'info' ? '' : billing.formatSen(l.amount_sen ?? 0)}
                  </td>
                ) : (
                  <>
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: C.slate }}>
                      {l.quantity != null
                        ? l.unit === 'Wh'
                          ? `${(l.quantity / 1000).toFixed(3)} kWh`
                          : l.unit === 's'
                            ? `${Math.round(l.quantity / 60)} min`
                            : l.quantity
                        : ''}
                    </td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {billing.formatSen(l.amount_excl_sen ?? 0, false)}
                    </td>
                    <td
                      style={{
                        padding: '9px 6px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        color: C.slate,
                      }}
                    >
                      {billing.formatSen(l.tax_sen ?? 0, false)}
                    </td>
                    <td
                      style={{
                        padding: '9px 6px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}
                    >
                      {billing.formatSen(l.amount_incl_sen ?? 0, false)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ minWidth: 280, fontSize: 13 }}>
            {!isSettlement && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    color: C.slate,
                  }}
                >
                  <span>Subtotal (excl. tax)</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {billing.formatSen(Number(doc.subtotal_sen))}
                  </span>
                </div>
                {(
                  (doc.tax_summary as
                    { rate_bps: number; taxable_sen: number; tax_sen: number }[] | null) ?? []
                ).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                      color: C.slate,
                    }}
                  >
                    <span>
                      SST {t.rate_bps / 100}% on {billing.formatSen(Number(t.taxable_sen))}
                    </span>
                    <span style={{ fontFamily: 'monospace' }}>
                      {billing.formatSen(Number(t.tax_sen))}
                    </span>
                  </div>
                ))}
              </>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: `2px solid ${C.green}`,
                marginTop: 6,
                fontWeight: 800,
                color: C.green,
                fontSize: 16,
              }}
            >
              <span>
                {isSettlement
                  ? Number(doc.total_sen) < 0
                    ? 'Due from host'
                    : 'Due to host'
                  : doc.kind === 'receipt'
                    ? 'Paid'
                    : 'Total due'}
              </span>
              <span style={{ fontFamily: 'monospace' }}>
                {billing.formatSen(Math.abs(Number(doc.total_sen)))}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: `1px solid ${C.divider}`,
            fontSize: 11,
            color: C.slate,
            lineHeight: 1.6,
          }}
        >
          {seller.tax_identification_no || seller.sst_registration_no ? (
            <>
              Seller TIN {seller.tax_identification_no ?? '—'} · SST no.{' '}
              {seller.sst_registration_no ?? '—'} ·{' '}
            </>
          ) : null}
          {buyer.tax_identification_no ? <>Buyer TIN {buyer.tax_identification_no} · </> : null}
          e-Invoice: {doc.einvoice_status.replace('_', ' ')} · Document {doc.id}
        </div>
      </div>
    </div>
  );
}

function Party({ p }: { p: ReturnType<typeof partyOf> }) {
  const rows = [
    p.legal_name && p.trading_name && p.legal_name !== p.trading_name ? p.legal_name : null,
    p.address,
    p.business_registration_no ? `Reg. ${p.business_registration_no}` : null,
    p.email,
    p.phone,
  ].filter(Boolean);
  return (
    <div
      style={{
        fontSize: 12,
        color: C.slate,
        marginTop: 4,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
      }}
    >
      {rows.join('\n')}
    </div>
  );
}

const secondary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.white,
  color: C.green,
  fontFamily: 'Figtree',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};
