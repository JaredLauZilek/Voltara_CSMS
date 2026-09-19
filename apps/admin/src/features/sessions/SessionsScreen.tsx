import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { formatKwh } from '@voltara/shared';
import { useChargePoints } from '@/features/charge-points';
import { useSessions } from './hooks';
import { SessionsTable } from './SessionsTable';
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
};

/** Every session, filterable; filters live in the URL so a view can be shared. */
export function SessionsScreen() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? 'All';
  const chargePointId = params.get('cp');
  const from = params.get('from');
  const to = params.get('to');
  const search = params.get('q') ?? '';

  const { data: chargePoints = [] } = useChargePoints();
  const { data: sessions = [], isLoading } = useSessions({ chargePointId, from, to });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

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
      if (
        q &&
        !(
          (s.id_tag ?? '').toLowerCase().includes(q) ||
          String(s.ocpp_transaction_id).includes(q) ||
          (s.charge_point_name ?? '').toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [sessions, filter, search]);

  const pagination = usePagination(filtered, 20);
  const totalWh = filtered.reduce((sum, s) => sum + (s.energy_wh ?? 0), 0);
  const active = sessions.filter((s) => OPEN_STATUSES.includes(s.status)).length;
  const orphaned = sessions.filter((s) => s.status === 'orphaned').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Sessions" value={filtered.length} sub="Matching this view" accent />
        <KPICard label="Energy" value={formatKwh(totalWh, 1)} sub="Delivered in this view" />
        <KPICard label="Charging Now" value={active} sub="Open sessions" />
        <KPICard label="Orphaned" value={orphaned} sub="Stop seen without a start" />
      </div>

      <Toolbar
        filters={[...SESSION_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('status', f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Tag, transaction or charger…"
        extra={
          <>
            <select
              value={chargePointId ?? ''}
              onChange={(e) => setParam('cp', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">All chargers</option>
              {chargePoints.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from ?? ''}
              onChange={(e) => setParam('from', e.target.value || null)}
              style={inputStyle}
              title="From"
            />
            <span style={{ color: C.slate, fontSize: 12 }}>to</span>
            <input
              type="date"
              value={to ?? ''}
              onChange={(e) => setParam('to', e.target.value || null)}
              style={inputStyle}
              title="To"
            />
          </>
        }
      />

      <div>
        <SessionsTable sessions={pagination.pageItems} isLoading={isLoading} />
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
