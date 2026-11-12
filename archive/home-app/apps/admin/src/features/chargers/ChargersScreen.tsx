import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { formatRelative } from '@/shared/lib/format';
import { card, emptyState, rowStyle, table, td, th } from '@/shared/lib/styles';
import { useChargers } from './hooks';
import { LifecycleBadge, StateBadge } from './badges';
import { RegisterChargerModal } from './RegisterChargerModal';
import { LIFECYCLE_FILTERS, isFaulted, isOffline } from './types';
import type { ChargerRow, LifecycleFilter } from './types';

const COLUMNS = ['Charger', 'Model', 'Lifecycle', 'Owner', 'Dealer', 'Last seen', 'Site'];

export function ChargersScreen() {
  const { isStaffSupport, isDealer } = useAuth();
  const { data: chargers = [], isLoading } = useChargers();
  const navigate = useNavigate();
  // Filters live in the URL so a view can be linked to ("all faulted
  // chargers", "this owner's chargers"). The register modal is transient.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const owner = params.get('owner');
  const dealer = params.get('dealer');
  const lifecycleParam = params.get('lifecycle') ?? '';
  const filter: LifecycleFilter =
    LIFECYCLE_FILTERS.find((f) => f.toLowerCase() === lifecycleParam) ?? 'All';
  const [showRegister, setShowRegister] = useState(false);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return chargers.filter((c) => {
      if (filter !== 'All' && c.lifecycle !== filter.toLowerCase()) return false;
      if (owner && c.owner_user_id !== owner) return false;
      if (dealer && c.dealer_id !== dealer) return false;
      if (needle) {
        const hay = [
          c.serial,
          c.name,
          c.owner_name,
          c.owner_email,
          c.dealer_name,
          c.site_label,
          c.city,
        ].map((s) => (s ?? '').toLowerCase());
        if (!hay.some((h) => h.includes(needle))) return false;
      }
      return true;
    });
  }, [chargers, filter, owner, dealer, q]);

  const pagination = usePagination(filtered);
  const { setPage } = pagination;
  useEffect(() => {
    setPage(1);
  }, [filter, owner, dealer, q, setPage]);

  const stats = useMemo(() => {
    const live = chargers.filter((c) => c.lifecycle !== 'decommissioned');
    return {
      total: live.length,
      claimed: live.filter((c) => c.lifecycle === 'claimed').length,
      awaiting: live.filter((c) => c.lifecycle === 'registered').length,
      faulted: live.filter(isFaulted).length,
      offline: live.filter(isOffline).length,
    };
  }, [chargers]);

  const ownerName = owner
    ? (chargers.find((c) => c.owner_user_id === owner)?.owner_name ?? null)
    : null;
  const dealerName = dealer
    ? (chargers.find((c) => c.dealer_id === dealer)?.dealer_name ?? null)
    : null;
  const canRegister = isStaffSupport || isDealer;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Chargers" value={stats.total} sub="Excluding decommissioned" accent />
        <KPICard label="Claimed" value={stats.claimed} sub="Owned by a homeowner" />
        <KPICard
          label="Awaiting commissioning"
          value={stats.awaiting}
          sub="Registered, not yet installed"
        />
        <KPICard
          label="Faulted or offline"
          value={stats.faulted + stats.offline}
          sub={`${stats.faulted} faulted · ${stats.offline} offline`}
        />
      </div>

      <Toolbar
        filters={[...LIFECYCLE_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('lifecycle', f === 'All' ? null : f.toLowerCase())}
        search={q}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search serial, name, owner, dealer or site…"
        primaryLabel={canRegister ? '+ Register charger' : undefined}
        onPrimary={canRegister ? () => setShowRegister(true) : undefined}
        extra={
          <>
            {owner && (
              <FilterChip
                label={`Owner · ${ownerName ?? 'unknown'}`}
                onClear={() => setParam('owner', null)}
              />
            )}
            {dealer && (
              <FilterChip
                label={`Dealer · ${dealerName ?? 'unknown'}`}
                onClear={() => setParam('dealer', null)}
              />
            )}
          </>
        }
      />

      <div style={card}>
        <table style={table}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {COLUMNS.map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((c) => (
              <ChargerTableRow key={c.id} c={c} onClick={() => navigate(`/chargers/${c.id}`)} />
            ))}
          </tbody>
        </table>
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && filtered.length === 0 && <div style={emptyState}>No chargers found.</div>}
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

      {showRegister && <RegisterChargerModal onClose={() => setShowRegister(false)} />}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      title="Clear filter"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 99,
        border: `1px solid ${C.green}`,
        background: C.honeydew,
        color: C.green,
        fontFamily: 'Figtree',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label} <span aria-hidden>×</span>
    </button>
  );
}

function ChargerTableRow({ c, onClick }: { c: ChargerRow; onClick: () => void }) {
  const site = [c.site_label, c.city].filter(Boolean).join(' · ');
  return (
    <tr
      style={{ ...rowStyle, cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={td}>
        <div style={{ fontWeight: 600, color: C.ink }}>{c.name}</div>
        <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.serial}</div>
      </td>
      <td style={td}>
        <div style={{ color: C.ink }}>{c.model_name ?? '—'}</div>
        <div style={{ fontSize: 11 }}>
          {[c.model_brand, c.model_code].filter(Boolean).join(' ')}
        </div>
      </td>
      <td style={td}>
        <LifecycleBadge lifecycle={c.lifecycle} />
      </td>
      <td style={td}>{c.owner_name ?? c.owner_email ?? '—'}</td>
      <td style={td}>{c.dealer_name ?? '—'}</td>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <StateBadge row={c} />
          <span>{formatRelative(c.last_seen_at)}</span>
        </div>
      </td>
      <td style={td}>{site || '—'}</td>
    </tr>
  );
}
