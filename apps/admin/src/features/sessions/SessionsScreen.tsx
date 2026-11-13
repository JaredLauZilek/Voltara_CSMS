import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import {
  displayCurrencySymbol,
  formatDateTime,
  formatKwh,
  formatRM,
  gunLetter,
} from '@voltara/shared';
import { useChargePoints } from '@/features/charge-points';
import { useLocations } from '@/features/locations';
import { downloadText, toCsv, type CsvColumn } from '@/shared/lib/csv';
import { SESSION_REPORT_LIMIT } from './api';
import { useSessionReport } from './hooks';
import { SessionsReportTable } from './SessionsReportTable';
import {
  OPEN_STATUSES,
  SESSION_FILTERS,
  SESSION_STATUS_LABELS,
  billingType,
  currentType,
  listAmount,
  paymentStatus,
  sessionMinutes,
} from './types';
import type { SessionReportRow, SessionStatus } from './types';

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  maxWidth: 200,
};

const money = (v: number | null) => (v === null ? '' : v.toFixed(2));

/** The CSV mirrors the table, one fact per column, numbers left unformatted. */
function csvColumns(): CsvColumn<SessionReportRow>[] {
  const cur = displayCurrencySymbol();
  return [
    { header: 'Vehicle no.', value: (s) => s.vehicle_plate },
    { header: 'Driver', value: (s) => s.driver_name },
    { header: 'Driver email', value: (s) => s.driver_email },
    { header: 'Driver phone', value: (s) => s.driver_phone },
    { header: 'ID tag', value: (s) => s.id_tag },
    { header: 'Site', value: (s) => s.location_name },
    { header: 'Car park lot', value: (s) => s.parking_lot },
    { header: 'Charger ID', value: (s) => s.charge_point_identity },
    { header: 'Gun', value: (s) => (s.ocpp_connector_id ? gunLetter(s.ocpp_connector_id) : '') },
    { header: 'Connector ID', value: (s) => s.ocpp_connector_id },
    { header: 'Charger type', value: (s) => currentType(s.connector_type) },
    { header: 'Connector', value: (s) => s.connector_type },
    { header: 'Start time', value: (s) => formatDateTime(s.started_at) },
    { header: 'End time', value: (s) => (s.ended_at ? formatDateTime(s.ended_at) : '') },
    { header: 'Duration (min)', value: (s) => Math.round(sessionMinutes(s)) },
    {
      header: 'Energy supplied (kWh)',
      value: (s) => (s.energy_wh === null ? '' : (Number(s.energy_wh) / 1000).toFixed(3)),
    },
    { header: `Amount (${cur})`, value: (s) => money(listAmount(s)) },
    {
      header: `Discount (${cur})`,
      value: (s) => (s.amount_gross === null ? '' : Number(s.amount_discount ?? 0).toFixed(2)),
    },
    {
      header: `Final amount (${cur})`,
      value: (s) => money(s.amount_gross === null ? null : Number(s.amount_gross)),
    },
    {
      header: `Tax included (${cur})`,
      value: (s) => money(s.amount_tax === null ? null : Number(s.amount_tax)),
    },
    { header: 'Billing type', value: billingType },
    { header: 'Company', value: (s) => s.billing_account_name },
    { header: 'Whitelist', value: (s) => s.driver_group_name },
    { header: 'Payment status', value: paymentStatus },
    { header: 'Session status', value: (s) => SESSION_STATUS_LABELS[s.status as SessionStatus] },
    { header: 'Transaction', value: (s) => s.ocpp_transaction_id },
  ];
}

/** Every session, filterable; filters live in the URL so a view can be shared. */
export function SessionsScreen() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? 'All';
  const locationId = params.get('site');
  const chargePointId = params.get('cp');
  const from = params.get('from');
  const to = params.get('to');
  const search = params.get('q') ?? '';

  const { data: locations = [] } = useLocations();
  const { data: chargePoints = [] } = useChargePoints();
  const { data: sessions = [], isLoading } = useSessionReport({
    locationId,
    chargePointId,
    from,
    to,
  });

  const setParam = (key: string, value: string | null, alsoClear?: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    if (alsoClear) next.delete(alsoClear);
    setParams(next, { replace: true });
  };

  const siteChargers = locationId
    ? chargePoints.filter((cp) => cp.location_id === locationId)
    : chargePoints;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter === 'Active' && !OPEN_STATUSES.includes(s.status)) return false;
      if (
        filter !== 'All' &&
        filter !== 'Active' &&
        SESSION_STATUS_LABELS[s.status as SessionStatus] !== filter
      )
        return false;
      if (!q) return true;
      return [
        s.vehicle_plate,
        s.driver_email,
        s.driver_name,
        s.driver_phone,
        s.id_tag,
        s.charge_point_identity,
        s.billing_account_name,
        String(s.ocpp_transaction_id),
      ].some((v) => (v ?? '').toLowerCase().replace(/\s+/g, '').includes(q.replace(/\s+/g, '')));
    });
  }, [sessions, filter, search]);

  const pagination = usePagination(filtered, 20);
  const totalWh = filtered.reduce((sum, s) => sum + Number(s.energy_wh ?? 0), 0);
  const revenue = filtered.reduce((sum, s) => sum + Number(s.amount_gross ?? 0), 0);
  const discounts = filtered.reduce((sum, s) => sum + Number(s.amount_discount ?? 0), 0);
  const active = sessions.filter((s) => OPEN_STATUSES.includes(s.status)).length;

  const download = () => {
    const stamp = [from ?? 'all', to ?? new Date().toISOString().slice(0, 10)].join('_to_');
    downloadText(`sessions_${stamp}.csv`, toCsv(filtered, csvColumns()));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Sessions" value={filtered.length} sub="Matching this view" accent />
        <KPICard label="Energy" value={formatKwh(totalWh, 1)} sub="Delivered in this view" />
        <KPICard
          label="Final amount"
          value={formatRM(revenue, 2)}
          sub={discounts > 0 ? `After ${formatRM(discounts, 2)} of discounts` : 'After discounts'}
        />
        <KPICard label="Charging Now" value={active} sub="Open sessions" />
      </div>

      <Toolbar
        filters={[...SESSION_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('status', f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Vehicle no., driver email, tag or charger…"
        extra={
          <>
            <select
              value={locationId ?? ''}
              onChange={(e) => setParam('site', e.target.value || null, 'cp')}
              style={inputStyle}
              aria-label="Site"
            >
              <option value="">All sites</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={chargePointId ?? ''}
              onChange={(e) => setParam('cp', e.target.value || null)}
              style={inputStyle}
              aria-label="Charger"
            >
              <option value="">All chargers</option>
              {siteChargers.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.ocpp_identity}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from ?? ''}
              max={to ?? undefined}
              onChange={(e) => setParam('from', e.target.value || null)}
              style={inputStyle}
              title="From"
              aria-label="From date"
            />
            <span style={{ color: C.slate, fontSize: 12 }}>to</span>
            <input
              type="date"
              value={to ?? ''}
              min={from ?? undefined}
              onChange={(e) => setParam('to', e.target.value || null)}
              style={inputStyle}
              title="To"
              aria-label="To date"
            />
            <button
              onClick={download}
              disabled={filtered.length === 0}
              title="Download this view as a CSV file"
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: `1px solid ${C.green}`,
                background: C.white,
                color: C.green,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 700,
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              ↓ Download CSV
            </button>
          </>
        }
      />

      {sessions.length >= SESSION_REPORT_LIMIT && (
        <div style={{ fontSize: 12, color: C.warning }}>
          Showing the newest {SESSION_REPORT_LIMIT.toLocaleString()} sessions. Narrow the dates,
          site or charger to see and download the rest.
        </div>
      )}

      <div>
        <SessionsReportTable sessions={pagination.pageItems} isLoading={isLoading} />
        <div
          style={{
            background: C.white,
            borderRadius: '0 0 16px 16px',
            marginTop: -16,
            paddingTop: 16,
            border: `1px solid ${C.border}`,
            borderTop: 'none',
          }}
        >
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
    </div>
  );
}
