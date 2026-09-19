import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { formatDate, formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useCreateIdTag, useDeleteIdTag, useIdTags, useUpdateIdTag } from './hooks';
import { IdTagModal } from './IdTagModal';
import { KIND_LABELS, STATUS_LABELS } from './types';
import type { IdTag, IdTagInsert } from './types';

const FILTERS = ['All', 'Active', 'Blocked', 'Expired'] as const;

/**
 * RFID / virtual credentials. Shareable state (filter, search, open record)
 * lives in the URL, not useState (CLAUDE.md §4.4).
 */
export function IdTagsScreen() {
  const { tenantId, tenantRole } = useAuth();
  const { data: tags = [], isLoading } = useIdTags();
  const createMut = useCreateIdTag();
  const updateMut = useUpdateIdTag();
  const deleteMut = useDeleteIdTag();
  const [params, setParams] = useSearchParams();

  const filter = params.get('status') ?? 'All';
  const search = params.get('q') ?? '';
  const modalParam = params.get('tag'); // 'new' | id
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    createMut.reset();
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalParam]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tags.filter((t) => {
      if (q && !(t.tag.toLowerCase().includes(q) || (t.label ?? '').toLowerCase().includes(q)))
        return false;
      if (filter !== 'All' && STATUS_LABELS[t.status] !== filter) return false;
      return true;
    });
  }, [tags, search, filter]);

  const pagination = usePagination(filtered, 15);
  const counts = useMemo(
    () => ({
      active: tags.filter((t) => t.status === 'active').length,
      blocked: tags.filter((t) => t.status === 'blocked').length,
      expired: tags.filter((t) => t.status === 'expired').length,
    }),
    [tags],
  );

  const modalRecord =
    modalParam && modalParam !== 'new' ? (tags.find((t) => t.id === modalParam) ?? null) : null;

  const handleSave = (row: Omit<IdTagInsert, 'tenant_id'>) => {
    if (modalParam === 'new') {
      createMut.mutate({ ...row, tenant_id: tenantId }, { onSuccess: () => setParam('tag', null) });
    } else if (modalRecord) {
      updateMut.mutate(
        { id: modalRecord.id, patch: row },
        { onSuccess: () => setParam('tag', null) },
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="ID Tags" value={tags.length} sub="All credentials" accent />
        <KPICard label="Active" value={counts.active} sub="Can start a session" />
        <KPICard label="Blocked" value={counts.blocked} sub="Refused at the charger" />
        <KPICard label="Expired" value={counts.expired} sub="Past their expiry" />
      </div>

      <Toolbar
        filters={[...FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('status', f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search tag or label…"
        primaryLabel={canEdit ? '+ Add ID Tag' : undefined}
        onPrimary={canEdit ? () => setParam('tag', 'new') : undefined}
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
              {['Tag', 'Label', 'Kind', 'Status', 'Expires', 'Added'].map((h) => (
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
            {pagination.pageItems.map((t) => (
              <Row
                key={t.id}
                t={t}
                onClick={() => canEdit && setParam('tag', t.id)}
                clickable={canEdit}
              />
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No ID tags found.
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

      {(modalParam === 'new' || modalRecord) && (
        <IdTagModal
          idTag={modalRecord}
          onClose={() => setParam('tag', null)}
          onSave={handleSave}
          onDelete={(id) => deleteMut.mutate(id, { onSuccess: () => setParam('tag', null) })}
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

function Row({ t, onClick, clickable }: { t: IdTag; onClick: () => void; clickable: boolean }) {
  const expiredByDate = t.expires_at && new Date(t.expires_at) < new Date();
  return (
    <tr
      style={{ borderBottom: `1px solid ${C.divider}`, cursor: clickable ? 'pointer' : 'default' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td
        style={{
          padding: '13px 16px',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 600,
          color: C.ink,
        }}
      >
        {t.tag}
      </td>
      <td style={{ padding: '13px 16px', color: C.ink }}>{t.label ?? '—'}</td>
      <td style={{ padding: '13px 16px', color: C.slate }}>{KIND_LABELS[t.kind] ?? t.kind}</td>
      <td style={{ padding: '13px 16px' }}>
        <Badge
          status={
            expiredByDate && t.status === 'active'
              ? 'Expired'
              : (STATUS_LABELS[t.status] ?? t.status)
          }
        />
      </td>
      <td style={{ padding: '13px 16px', color: C.slate }}>
        {t.expires_at ? formatDateTime(t.expires_at) : '—'}
      </td>
      <td style={{ padding: '13px 16px', color: C.slate }}>{formatDate(t.created_at)}</td>
    </tr>
  );
}
