import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { formatRelative } from '@/shared/lib/format';
import { card, emptyState, rowStyle, table, td, th } from '@/shared/lib/styles';
import { useOwners } from './hooks';
import type { OwnerRow } from './types';

const COLUMNS = ['Owner', 'Chargers', 'Dealer', 'Last seen'];

export function OwnersScreen() {
  const { data: owners = [], isLoading } = useOwners();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.email ?? '').toLowerCase().includes(q) ||
        o.dealers.some((d) => d.toLowerCase().includes(q)),
    );
  }, [owners, search]);

  const pagination = usePagination(filtered);
  const { setPage } = pagination;
  useEffect(() => {
    setPage(1);
  }, [search, setPage]);

  const active = owners.filter((o) => o.seen_24h).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <KPICard
          label="Owners"
          value={owners.length}
          sub="People who have claimed a charger"
          accent
        />
        <KPICard label="Active in last 24 h" value={active} sub="At least one charger seen" />
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email or dealer…"
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
            {pagination.pageItems.map((o) => (
              <OwnerTableRow
                key={o.user_id}
                o={o}
                onClick={() => navigate(`/chargers?owner=${o.user_id}`)}
              />
            ))}
          </tbody>
        </table>
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && filtered.length === 0 && <div style={emptyState}>No owners found.</div>}
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

function OwnerTableRow({ o, onClick }: { o: OwnerRow; onClick: () => void }) {
  return (
    <tr
      style={{ ...rowStyle, cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: C.honeydew,
              color: C.green,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {o.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: C.ink }}>{o.name}</div>
            <div style={{ fontSize: 11 }}>{o.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{o.chargers}</td>
      <td style={td}>{o.dealers.length ? o.dealers.join(' · ') : '—'}</td>
      <td style={td}>{formatRelative(o.last_seen_at)}</td>
    </tr>
  );
}
