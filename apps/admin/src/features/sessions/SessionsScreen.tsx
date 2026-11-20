import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { formatKwh, formatRM } from '@voltara/shared';
import { useChargePoints } from '@/features/charge-points';
import { useLocations } from '@/features/locations';
import { SESSION_REPORT_LIMIT } from './api';
import { MAX_RANGE_DAYS, sanitiseRange, type DateRange } from './dateRange';
import { downloadSessionsCsv } from './sessionCsv';
import { SessionRangeBar } from './SessionRangeBar';
import { useSessionReport } from './hooks';
import { SessionsReportTable } from './SessionsReportTable';
import { OPEN_STATUSES, SESSION_FILTERS, SESSION_STATUS_LABELS } from './types';
import type { SessionStatus } from './types';

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

/** Every session, filterable; filters live in the URL so a view can be shared. */
export function SessionsScreen() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? 'All';
  const locationId = params.get('site');
  const chargePointId = params.get('cp');
  // Always a bounded window: the last 30 days unless the URL says otherwise,
  // never more than 45 days.
  const range = sanitiseRange(params.get('from'), params.get('to'));
  const { from, to } = range;
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

  const setRange = (next: DateRange) => {
    const p = new URLSearchParams(params);
    p.set('from', next.from);
    p.set('to', next.to);
    setParams(p, { replace: true });
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
            <SessionRangeBar
              range={range}
              onChange={setRange}
              onDownload={() => downloadSessionsCsv(filtered, range)}
              canDownload={filtered.length > 0}
            />
          </>
        }
      />

      {sessions.length >= SESSION_REPORT_LIMIT && (
        <div style={{ fontSize: 12, color: C.warning }}>
          Showing the newest {SESSION_REPORT_LIMIT.toLocaleString()} sessions in these dates. Narrow
          the dates, site or charger to see and download the rest.
        </div>
      )}

      <div style={{ fontSize: 12, color: C.slate, marginTop: -8 }}>
        Sessions are shown and downloaded up to {MAX_RANGE_DAYS} days at a time. For a longer
        period, download each stretch separately.
      </div>

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
