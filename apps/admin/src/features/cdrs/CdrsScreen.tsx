import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { billing, formatDateTime, formatDuration, formatKwh } from '@voltara/shared';
import { useBillingAccounts } from '@/features/billing-accounts';
import { useChargePoints } from '@/features/charge-points';
import { useLocations } from '@/features/locations';
import { downloadText, monthRange, toCsv } from '@/shared/lib/csv';
import { useCdrs } from './hooks';
import { CDR_FILTERS, UNBILLABLE_LABELS } from './types';
import type { CdrWithNames } from './types';

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
};

/** Every priced session. This list IS the billing export a JMB asks for. */
export function CdrsScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = monthRange(0);
  const from = params.get('from') ?? month.from;
  const to = params.get('to') ?? month.to;
  const state = params.get('state') ?? 'All';
  const filters = {
    from,
    to,
    locationId: params.get('site'),
    chargePointId: params.get('cp'),
    accountId: params.get('account'),
    state:
      state === 'Billable'
        ? 'billable'
        : state === 'Unbillable'
          ? 'unbillable'
          : state === 'Uninvoiced'
            ? 'uninvoiced'
            : null,
  };
  const { data: cdrs = [], isLoading } = useCdrs(filters);
  const { data: locations = [] } = useLocations();
  const { data: chargePoints = [] } = useChargePoints();
  const { data: accounts = [] } = useBillingAccounts();
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v && v !== 'All') p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const totals = useMemo(
    () => ({
      energyWh: cdrs.reduce((s, c) => s + Number(c.total_energy_wh), 0),
      totalSen: cdrs.filter((c) => c.billable).reduce((s, c) => s + Number(c.total_sen), 0),
      taxSen: cdrs.filter((c) => c.billable).reduce((s, c) => s + Number(c.tax_sen), 0),
      uninvoiced: cdrs.filter((c) => c.billable && !c.invoice_document_id).length,
      unbillable: cdrs.filter((c) => !c.billable).length,
    }),
    [cdrs],
  );
  const pagination = usePagination(cdrs, 25);

  const exportCsv = () =>
    downloadText(
      `charging-records-${from}-to-${to}.csv`,
      toCsv(cdrs, [
        { header: 'Started', value: (c) => formatDateTime(c.start_at) },
        { header: 'Ended', value: (c) => formatDateTime(c.end_at) },
        { header: 'Site', value: (c) => c.location_name },
        { header: 'Charger', value: (c) => c.charge_point_name ?? c.ocpp_identity },
        { header: 'Connector', value: (c) => c.ocpp_connector_id },
        { header: 'ID tag', value: (c) => c.id_tag },
        { header: 'Billing account', value: (c) => c.account_name ?? 'ad-hoc' },
        { header: 'Driver group', value: (c) => c.group_name },
        { header: 'Energy (kWh)', value: (c) => (Number(c.total_energy_wh) / 1000).toFixed(3) },
        { header: 'Charging (min)', value: (c) => Math.round(c.total_time_s / 60) },
        { header: 'Idle (min)', value: (c) => Math.round(c.total_parking_time_s / 60) },
        {
          header: 'Energy cost (RM)',
          value: (c) => (Number(c.total_energy_cost_sen) / 100).toFixed(2),
        },
        {
          header: 'Time cost (RM)',
          value: (c) => (Number(c.total_time_cost_sen) / 100).toFixed(2),
        },
        {
          header: 'Idle cost (RM)',
          value: (c) => (Number(c.total_parking_cost_sen) / 100).toFixed(2),
        },
        {
          header: 'Session fee (RM)',
          value: (c) => (Number(c.total_fixed_cost_sen) / 100).toFixed(2),
        },
        {
          header: 'Subtotal excl. tax (RM)',
          value: (c) => (Number(c.subtotal_sen) / 100).toFixed(2),
        },
        { header: 'Tax rate (%)', value: (c) => c.tax_rate_bps / 100 },
        { header: 'Tax (RM)', value: (c) => (Number(c.tax_sen) / 100).toFixed(2) },
        { header: 'Total (RM)', value: (c) => (Number(c.total_sen) / 100).toFixed(2) },
        {
          header: 'Billable',
          value: (c) =>
            c.billable ? 'yes' : (UNBILLABLE_LABELS[c.unbillable_reason ?? ''] ?? 'no'),
        },
        { header: 'Invoice', value: (c) => c.document_number },
        { header: 'Record ID', value: (c) => c.id },
      ]),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Revenue"
          value={billing.formatSen(totals.totalSen)}
          sub={`incl. ${billing.formatSen(totals.taxSen)} tax · ${cdrs.length} sessions`}
          accent
        />
        <KPICard
          label="Energy"
          value={formatKwh(totals.energyWh, 1)}
          sub="Delivered in this view"
        />
        <KPICard
          label="Uninvoiced"
          value={totals.uninvoiced}
          sub="Billable sessions not yet on an invoice"
        />
        <KPICard label="Unbillable" value={totals.unbillable} sub="No tariff or no start reading" />
      </div>

      <Toolbar
        filters={[...CDR_FILTERS]}
        filter={state}
        onFilterChange={(f) => setParam('state', f)}
        extra={
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setParam('from', e.target.value || null)}
              style={inputStyle}
            />
            <span style={{ color: C.slate, fontSize: 12 }}>to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setParam('to', e.target.value || null)}
              style={inputStyle}
            />
            <select
              value={params.get('site') ?? ''}
              onChange={(e) => setParam('site', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">All sites</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={params.get('cp') ?? ''}
              onChange={(e) => setParam('cp', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">All chargers</option>
              {chargePoints.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={params.get('account') ?? ''}
              onChange={(e) => setParam('account', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </>
        }
        primaryLabel="Export CSV"
        onPrimary={exportCsv}
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
              {['Started', 'Charger', 'Payer', 'Energy', 'Duration', 'Idle', 'Total', 'Status'].map(
                (h) => (
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
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((c) => (
              <Row key={c.id} c={c} onClick={() => navigate(`/cdrs/${c.id}`)} />
            ))}
          </tbody>
        </table>
        {!isLoading && cdrs.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No charging records in this period.
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
    </div>
  );
}

function Row({ c, onClick }: { c: CdrWithNames; onClick: () => void }) {
  return (
    <tr
      style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '12px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
        {formatDateTime(c.start_at)}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 600, color: C.ink }}>
          {c.charge_point_name ?? c.ocpp_identity ?? '—'}
        </div>
        <div style={{ fontSize: 12, color: C.slate }}>
          {c.location_name ?? ''}
          {c.ocpp_connector_id ? ` · connector ${c.ocpp_connector_id}` : ''}
        </div>
      </td>
      <td style={{ padding: '12px 16px', color: C.ink }}>
        {c.account_name ?? (
          <span style={{ color: C.slate }}>ad-hoc{c.id_tag ? ` · ${c.id_tag}` : ''}</span>
        )}
        {c.group_name && <div style={{ fontSize: 12, color: C.slate }}>{c.group_name}</div>}
      </td>
      <td style={{ padding: '12px 16px', color: C.ink }}>
        {formatKwh(Number(c.total_energy_wh), 2)}
      </td>
      <td style={{ padding: '12px 16px', color: C.slate }}>{formatDuration(c.total_time_s)}</td>
      <td style={{ padding: '12px 16px', color: c.total_parking_time_s > 0 ? C.warning : C.slate }}>
        {c.total_parking_time_s > 0 ? formatDuration(c.total_parking_time_s) : '—'}
      </td>
      <td
        style={{ padding: '12px 16px', fontWeight: 700, color: C.green, fontFamily: 'monospace' }}
      >
        {c.billable ? billing.formatSen(Number(c.total_sen)) : '—'}
      </td>
      <td style={{ padding: '12px 16px' }}>
        {!c.billable ? (
          <Badge status="Unbillable" override={{ bg: C.warningBg, color: C.warning }} />
        ) : c.document_number ? (
          <Badge status={c.document_number} override={{ bg: C.infoBg, color: C.info }} />
        ) : (
          <Badge status="Uninvoiced" override={{ bg: C.divider, color: C.slate }} />
        )}
      </td>
    </tr>
  );
}
