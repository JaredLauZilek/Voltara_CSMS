import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Modal, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { billing, formatDate, formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useBillingAccounts } from '@/features/billing-accounts';
import { useLocations } from '@/features/locations';
import { monthRange } from '@/shared/lib/csv';
import { useDocuments, useRunInvoices, useRunSettlement } from './hooks';
import { DOC_FILTERS, DOC_STATUS_BADGE, KIND_LABELS } from './types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: 6,
};

export function DocumentsScreen() {
  const navigate = useNavigate();
  const { tenantRole } = useAuth();
  const { data: docs = [], isLoading } = useDocuments();
  const [params, setParams] = useSearchParams();
  const filter = params.get('kind') ?? 'All';
  const [modal, setModal] = useState<'invoices' | 'settlement' | null>(null);
  const canRun = tenantRole === 'owner' || tenantRole === 'admin';
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v && v !== 'All') p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const filtered = useMemo(
    () =>
      docs.filter((d) =>
        filter === 'Invoices'
          ? d.kind === 'invoice'
          : filter === 'Receipts'
            ? d.kind === 'receipt'
            : filter === 'Settlements'
              ? d.kind === 'settlement'
              : filter === 'Drafts'
                ? d.status === 'draft'
                : true,
      ),
    [docs, filter],
  );
  const pagination = usePagination(filtered, 20);
  const month = monthRange(0);
  const issuedThisMonth = docs.filter(
    (d) => d.status === 'issued' && d.issued_at && d.issued_at.slice(0, 10) >= month.from,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Invoiced this month"
          value={billing.formatSen(
            issuedThisMonth
              .filter((d) => d.kind === 'invoice')
              .reduce((s, d) => s + Number(d.total_sen), 0),
          )}
          sub={`${issuedThisMonth.filter((d) => d.kind === 'invoice').length} invoices issued`}
          accent
        />
        <KPICard
          label="Drafts"
          value={docs.filter((d) => d.status === 'draft').length}
          sub="Awaiting review"
        />
        <KPICard
          label="Receipts"
          value={docs.filter((d) => d.kind === 'receipt').length}
          sub="All time"
        />
        <KPICard
          label="Settlements"
          value={docs.filter((d) => d.kind === 'settlement').length}
          sub="Site host statements"
        />
      </div>

      <Toolbar
        filters={[...DOC_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('kind', f)}
        extra={
          canRun ? (
            <button
              onClick={() => setModal('settlement')}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.green,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Run settlement
            </button>
          ) : undefined
        }
        primaryLabel={canRun ? 'Run invoices' : undefined}
        onPrimary={canRun ? () => setModal('invoices') : undefined}
      />

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
              {['Number', 'Kind', 'To', 'Period', 'Total', 'Status', 'Created'].map((h) => (
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
            {pagination.pageItems.map((d) => (
              <tr
                key={d.id}
                style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
                onClick={() => navigate(`/documents/${d.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td
                  style={{
                    padding: '12px 16px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: C.green,
                  }}
                >
                  {d.number}
                </td>
                <td style={{ padding: '12px 16px', color: C.slate }}>{KIND_LABELS[d.kind]}</td>
                <td style={{ padding: '12px 16px', color: C.ink, fontWeight: 600 }}>
                  {d.account_name ?? (d.buyer as { name?: string })?.name ?? '—'}
                  {d.location_name && (
                    <div style={{ fontSize: 12, color: C.slate, fontWeight: 500 }}>
                      {d.location_name}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
                  {d.period_start
                    ? `${formatDate(d.period_start)} – ${formatDate(d.period_end ?? d.period_start)}`
                    : '—'}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: Number(d.total_sen) < 0 ? C.error : C.ink,
                  }}
                >
                  {billing.formatSen(Number(d.total_sen))}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge status={DOC_STATUS_BADGE[d.status]} />
                </td>
                <td style={{ padding: '12px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
                  {formatDateTime(d.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No documents yet.
          </div>
        )}
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          from={pagination.from}
          to={pagination.to}
          onPageChange={pagination.setPage}
        />
      </div>

      {modal === 'invoices' && (
        <RunInvoicesModal
          onClose={() => setModal(null)}
          onDone={(ids) => {
            setModal(null);
            if (ids.length === 1) navigate(`/documents/${ids[0]}`);
          }}
        />
      )}
      {modal === 'settlement' && (
        <RunSettlementModal
          onClose={() => setModal(null)}
          onDone={(id) => {
            setModal(null);
            navigate(`/documents/${id}`);
          }}
        />
      )}
    </div>
  );
}

function PeriodPicker({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  const last = monthRange(-1);
  const cur = monthRange(0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 6 }}>
        {[last, cur].map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              setFrom(m.from);
              setTo(m.to);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: `2px solid ${from === m.from && to === m.to ? C.green : C.border}`,
              background: from === m.from && to === m.to ? C.honeydew : C.white,
              color: from === m.from && to === m.to ? C.green : C.slate,
              fontFamily: 'Figtree',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div>
        <label style={labelStyle}>From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
      </div>
    </div>
  );
}

function RunInvoicesModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const { data: accounts = [] } = useBillingAccounts();
  const run = useRunInvoices();
  const last = monthRange(-1);
  const [accountId, setAccountId] = useState('all');
  const [from, setFrom] = useState(last.from);
  const [to, setTo] = useState(last.to);
  const [result, setResult] = useState<{ created: string[]; skipped: string[] } | null>(null);
  useEffect(() => {
    run.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  const eligible = accounts.filter((a) => a.status === 'active' && a.kind !== 'site_host');
  const targets = accountId === 'all' ? eligible.map((a) => a.id) : [accountId];
  const canRun = targets.length > 0 && from && to && !run.isPending;

  if (result) {
    return (
      <Modal title="Invoice run complete" onClose={() => onDone(result.created)} width={480}>
        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.7 }}>
          <strong>{result.created.length}</strong> draft invoice
          {result.created.length === 1 ? '' : 's'} created
          {result.skipped.length ? (
            <>
              , <strong>{result.skipped.length}</strong> account
              {result.skipped.length === 1 ? '' : 's'} had nothing to bill
            </>
          ) : null}
          .
          <div style={{ color: C.slate, fontSize: 12, marginTop: 6 }}>
            Review each draft, then Issue. Sessions on a draft are marked invoiced; voiding releases
            them.
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          <button
            onClick={() => onDone(result.created)}
            style={{
              marginLeft: 'auto',
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: C.green,
              color: C.white,
              fontFamily: 'Figtree',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Run invoices"
      subtitle="One draft per billing account with uninvoiced sessions in the period"
      onClose={onClose}
      width={520}
    >
      <div>
        <label style={labelStyle}>Billing account</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>
          <option value="all">All active accounts ({eligible.length})</option>
          {eligible.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {run.error && (
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
          {(run.error as Error).message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            padding: '10px 20px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.slate,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => run.mutate({ accountIds: targets, from, to }, { onSuccess: setResult })}
          disabled={!canRun}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: canRun ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: canRun ? 'pointer' : run.isPending ? 'wait' : 'not-allowed',
            opacity: canRun ? 1 : 0.6,
          }}
        >
          {run.isPending ? 'Running…' : 'Create drafts'}
        </button>
      </div>
    </Modal>
  );
}

function RunSettlementModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const { data: locations = [] } = useLocations();
  const run = useRunSettlement();
  const last = monthRange(-1);
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState(last.from);
  const [to, setTo] = useState(last.to);
  useEffect(() => {
    run.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  const canRun = Boolean(locationId) && !run.isPending;
  return (
    <Modal
      title="Run settlement statement"
      subtitle="Revenue share owed to the site host, from its agreement"
      onClose={onClose}
      width={520}
    >
      <div>
        <label style={labelStyle}>Site</label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Choose a site —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <PeriodPicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {run.error && (
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
          {(run.error as Error).message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            padding: '10px 20px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.slate,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => run.mutate({ locationId, from, to }, { onSuccess: onDone })}
          disabled={!canRun}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: canRun ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: canRun ? 'pointer' : run.isPending ? 'wait' : 'not-allowed',
            opacity: canRun ? 1 : 0.6,
          }}
        >
          {run.isPending ? 'Running…' : 'Create statement'}
        </button>
      </div>
    </Modal>
  );
}
