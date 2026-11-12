import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { useChargers } from '@/features/chargers';
import { errorMessage } from '@/shared/lib/errors';
import { card, emptyState, rowStyle, table, td, th } from '@/shared/lib/styles';
import { useCreateDealer, useDealerMemberships, useDealers } from './hooks';
import { DealerModal } from './DealerModal';
import { DEALER_STATUS_LABELS } from './types';
import type { Dealer, DealerFormRow } from './types';

const COLUMNS = ['Dealer', 'Status', 'Members', 'Chargers', 'Contact'];

export function DealersScreen() {
  const { isStaffAdmin } = useAuth();
  const { data: dealers = [], isLoading } = useDealers();
  const { data: memberships = [] } = useDealerMemberships();
  const { data: chargers = [] } = useChargers();
  const createMut = useCreateDealer();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    createMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew]);

  const membersByDealer = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of memberships) if (p.dealer_id) m.set(p.dealer_id, (m.get(p.dealer_id) ?? 0) + 1);
    return m;
  }, [memberships]);
  const chargersByDealer = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chargers) if (c.dealer_id) m.set(c.dealer_id, (m.get(c.dealer_id) ?? 0) + 1);
    return m;
  }, [chargers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dealers;
    return dealers.filter((d) =>
      [d.name, d.code, d.email, d.phone].some((s) => (s ?? '').toLowerCase().includes(q)),
    );
  }, [dealers, search]);

  const pagination = usePagination(filtered);
  const { setPage } = pagination;
  useEffect(() => {
    setPage(1);
  }, [search, setPage]);

  const active = dealers.filter((d) => d.status === 'active').length;

  const handleCreate = (row: DealerFormRow) => {
    createMut.mutate(row, { onSuccess: () => setShowNew(false) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Dealers" value={dealers.length} sub={`${active} active`} accent />
        <KPICard
          label="First-party"
          value={dealers.filter((d) => d.is_first_party).length}
          sub="Voltara's own teams"
        />
        <KPICard label="Members" value={memberships.length} sub="Dealer admins and installers" />
        <KPICard
          label="Chargers via dealers"
          value={chargers.filter((c) => c.dealer_id).length}
          sub="Registered under a dealer"
        />
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, code or contact…"
        primaryLabel={isStaffAdmin ? '+ Add dealer' : undefined}
        onPrimary={isStaffAdmin ? () => setShowNew(true) : undefined}
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
            {pagination.pageItems.map((d) => (
              <DealerTableRow
                key={d.id}
                d={d}
                members={membersByDealer.get(d.id) ?? 0}
                chargers={chargersByDealer.get(d.id) ?? 0}
                onClick={() => navigate(`/dealers/${d.id}`)}
              />
            ))}
          </tbody>
        </table>
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && filtered.length === 0 && <div style={emptyState}>No dealers found.</div>}
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

      {showNew && (
        <DealerModal
          dealer={null}
          canEditRestricted
          onClose={() => setShowNew(false)}
          onSave={handleCreate}
          isSaving={createMut.isPending}
          saveError={errorMessage(createMut.error)}
        />
      )}
    </div>
  );
}

function DealerTableRow({
  d,
  members,
  chargers,
  onClick,
}: {
  d: Dealer;
  members: number;
  chargers: number;
  onClick: () => void;
}) {
  const contact = [d.phone, d.email].filter(Boolean).join(' · ');
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
            {d.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: C.ink }}>
              {d.name}
              {d.is_first_party && (
                <span style={{ color: C.slate, fontWeight: 500 }}> · first-party</span>
              )}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{d.code}</div>
          </div>
        </div>
      </td>
      <td style={td}>
        <Badge status={DEALER_STATUS_LABELS[d.status] ?? d.status} />
      </td>
      <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{members}</td>
      <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{chargers}</td>
      <td style={td}>{contact || '—'}</td>
    </tr>
  );
}
