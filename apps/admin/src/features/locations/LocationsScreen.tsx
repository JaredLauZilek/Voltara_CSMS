import { useEffect, useState } from 'react';
import { Badge, C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { SITE_TYPE_LABELS, formatDate } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useCreateLocation, useDeleteLocation, useLocations, useUpdateLocation } from './hooks';
import { LocationModal } from './LocationModal';
import type { Location, LocationInsert, SiteType } from './types';

const FILTERS = ['All', 'Public', 'Condo', 'Workplace', 'Home', 'Fleet Depot'] as const;

export function LocationsScreen() {
  const { tenantId } = useAuth();
  const { data: locations = [], isLoading } = useLocations();
  const createMut = useCreateLocation();
  const updateMut = useUpdateLocation();
  const deleteMut = useDeleteLocation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [modal, setModal] = useState<Location | 'new' | null>(null);

  // Reset mutation state whenever the modal opens/closes so a previous
  // failure doesn't leak its error into the next session, and isPending
  // can't get visually stuck.
  useEffect(() => {
    createMut.reset();
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  const filtered = locations.filter((l) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hit =
        l.name.toLowerCase().includes(q) ||
        (l.city ?? '').toLowerCase().includes(q) ||
        (l.state ?? '').toLowerCase().includes(q) ||
        (l.jmb_name ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (typeFilter !== 'All' && SITE_TYPE_LABELS[l.site_type as SiteType] !== typeFilter)
      return false;
    return true;
  });

  const pagination = usePagination(filtered);
  const pageRows = pagination.pageItems;
  const resetPage = pagination.reset;

  const total = locations.length;
  const condoCount = locations.filter((l) => l.site_type === 'condo').length;
  const publicCount = locations.filter((l) => l.site_type === 'public').length;
  const otherCount = total - condoCount - publicCount;

  // Always pass the live-derived record to the modal — never the row captured
  // at click time (it goes stale after a background refetch). CLAUDE.md §11.
  const modalRecord =
    modal && modal !== 'new' ? (locations.find((l) => l.id === modal.id) ?? modal) : null;

  const handleSave = (row: Omit<LocationInsert, 'tenant_id'>) => {
    if (modal === 'new') {
      createMut.mutate({ ...row, tenant_id: tenantId }, { onSuccess: () => setModal(null) });
    } else if (modalRecord) {
      updateMut.mutate({ id: modalRecord.id, patch: row }, { onSuccess: () => setModal(null) });
    }
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate(id, { onSuccess: () => setModal(null) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Total Sites" value={total} sub="All site types" accent />
        <KPICard label="Condo Sites" value={condoCount} sub="Strata / JMB" />
        <KPICard label="Public Sites" value={publicCount} sub="Open to drivers" />
        <KPICard label="Other Sites" value={otherCount} sub="Workplace · home · depot" />
      </div>

      <Toolbar
        filters={[...FILTERS]}
        filter={typeFilter}
        onFilterChange={(f) => {
          setTypeFilter(f);
          resetPage();
        }}
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          resetPage();
        }}
        searchPlaceholder="Search by name, city, state or JMB…"
        primaryLabel="+ Add Location"
        onPrimary={() => setModal('new')}
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
              {['Location', 'Site Type', 'City', 'State', 'JMB / MC', 'Added'].map((h) => (
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
            {pageRows.map((l) => (
              <LocationRow key={l.id} l={l} onClick={() => setModal(l)} />
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No locations found.
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

      {(modal === 'new' || modalRecord) && (
        <LocationModal
          location={modal === 'new' ? null : modalRecord}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          isSaving={createMut.isPending || updateMut.isPending}
          saveError={
            createMut.error
              ? (createMut.error as Error).message
              : updateMut.error
                ? (updateMut.error as Error).message
                : null
          }
        />
      )}
    </div>
  );
}

function LocationRow({ l, onClick }: { l: Location; onClick: () => void }) {
  const typeLabel = SITE_TYPE_LABELS[l.site_type as SiteType] ?? l.site_type;
  return (
    <tr
      style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: C.honeydew,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: C.green,
              flexShrink: 0,
            }}
          >
            {l.name[0]}
          </div>
          <span style={{ fontWeight: 600, color: C.ink }}>{l.name}</span>
        </div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <Badge status={typeLabel} />
      </td>
      <td style={{ padding: '13px 16px', color: C.slate }}>{l.city ?? '—'}</td>
      <td style={{ padding: '13px 16px', color: C.slate }}>{l.state ?? '—'}</td>
      <td style={{ padding: '13px 16px', color: C.slate }}>{l.jmb_name ?? '—'}</td>
      <td style={{ padding: '13px 16px', color: C.slate }}>{formatDate(l.created_at)}</td>
    </tr>
  );
}
