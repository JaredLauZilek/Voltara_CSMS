import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { formatDate } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { BillingAccountModal } from './BillingAccountModal';
import { useBillingAccounts } from './hooks';
import {
  ACCOUNT_FILTERS,
  ACCOUNT_KIND_LABELS,
  ACCOUNT_STATUS_BADGE,
  BILLING_MODEL_LABELS,
} from './types';

export function BillingAccountsScreen() {
  const { tenantRole } = useAuth();
  const { data: accounts = [], isLoading } = useBillingAccounts();
  const [params, setParams] = useSearchParams();
  const filter = params.get('kind') ?? 'All';
  const search = params.get('q') ?? '';
  const modal = params.get('account');
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v && v !== 'All') p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kind =
      filter === 'Individual'
        ? 'individual'
        : filter === 'Corporate'
          ? 'corporate'
          : filter === 'Site host'
            ? 'site_host'
            : null;
    return accounts.filter(
      (a) =>
        (!kind || a.kind === kind) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          (a.email ?? '').toLowerCase().includes(q) ||
          (a.legal_name ?? '').toLowerCase().includes(q)),
    );
  }, [accounts, filter, search]);
  const pagination = usePagination(filtered, 15);
  const record = modal && modal !== 'new' ? (accounts.find((a) => a.id === modal) ?? null) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Billing accounts" value={accounts.length} sub="Payers on record" accent />
        <KPICard
          label="Individuals"
          value={accounts.filter((a) => a.kind === 'individual').length}
          sub="Residents, drivers"
        />
        <KPICard
          label="Corporate"
          value={accounts.filter((a) => a.kind === 'corporate').length}
          sub="Pooled invoicing"
        />
        <KPICard
          label="Site hosts"
          value={accounts.filter((a) => a.kind === 'site_host').length}
          sub="JMBs and landlords"
        />
      </div>
      <Toolbar
        filters={[...ACCOUNT_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('kind', f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search accounts…"
        primaryLabel={canEdit ? '+ New Account' : undefined}
        onPrimary={canEdit ? () => setParam('account', 'new') : undefined}
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
              {['Account', 'Kind', 'Pays by', 'ID tags', 'Status', 'Added'].map((h) => (
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
            {pagination.pageItems.map((a) => (
              <tr
                key={a.id}
                style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
                onClick={() => setParam('account', a.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontWeight: 600, color: C.ink }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>
                    {a.email ?? a.location_name ?? a.legal_name ?? ''}
                  </div>
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>
                  {ACCOUNT_KIND_LABELS[a.kind]}
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>
                  {BILLING_MODEL_LABELS[a.billing_model] ?? a.billing_model}
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>{a.tag_count}</td>
                <td style={{ padding: '13px 16px' }}>
                  <Badge status={ACCOUNT_STATUS_BADGE[a.status] ?? a.status} />
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>{formatDate(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No billing accounts found.
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
      {(modal === 'new' || record) && (
        <BillingAccountModal
          key={modal}
          account={record}
          onClose={() => setParam('account', null)}
        />
      )}
    </div>
  );
}
