import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Pagination, STATUS_COLORS, Toolbar, usePagination } from '@voltara/ui';
import { formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useIssues } from './hooks';
import { IssueModal } from './IssueModal';
import { ISSUE_SEVERITY_LABELS, ISSUE_STATUS_LABELS, SEVERITY_BADGE } from './types';
import type { IssueSeverity, IssueStatus, IssueWithChargePoint } from './types';

const FILTERS = ['Open', 'In Progress', 'Resolved', 'Closed', 'All'] as const;

const STATUS_BADGE: Record<string, string> = {
  open: 'Faulted',
  in_progress: 'In Progress',
  resolved: 'Completed',
  closed: 'Inactive',
};

export function IssuesScreen() {
  const { tenantRole } = useAuth();
  const { data: issues = [], isLoading } = useIssues();
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? 'Open';
  const search = params.get('q') ?? '';
  const modalParam = params.get('issue');
  const canRaise = tenantRole !== 'viewer';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i) => {
      if (filter !== 'All' && ISSUE_STATUS_LABELS[i.status as IssueStatus] !== filter) return false;
      if (
        q &&
        !(
          i.title.toLowerCase().includes(q) ||
          (i.charge_point_name ?? '').toLowerCase().includes(q) ||
          (i.charge_point_identity ?? '').toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [issues, filter, search]);

  const pagination = usePagination(filtered, 15);
  const open = issues.filter((i) => i.status === 'open' || i.status === 'in_progress');
  const critical = open.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const resolvedThisWeek = issues.filter(
    (i) => i.resolved_at && Date.now() - new Date(i.resolved_at).getTime() < 7 * 86_400_000,
  ).length;

  const modalRecord =
    modalParam && modalParam !== 'new' ? (issues.find((i) => i.id === modalParam) ?? null) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Open Issues" value={open.length} sub="Open or in progress" accent />
        <KPICard label="High / Critical" value={critical} sub="Need attention now" />
        <KPICard label="Resolved · 7 days" value={resolvedThisWeek} sub="Closed out this week" />
        <KPICard label="All Time" value={issues.length} sub="Every issue raised" />
      </div>

      <Toolbar
        filters={[...FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('status', f === 'Open' ? null : f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search title or charger…"
        primaryLabel={canRaise ? '+ Report Issue' : undefined}
        onPrimary={canRaise ? () => setParam('issue', 'new') : undefined}
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
              {['Issue', 'Charger', 'Severity', 'Status', 'Opened', 'Updated'].map((h) => (
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
            {pagination.pageItems.map((i) => (
              <Row key={i.id} issue={i} onClick={() => setParam('issue', i.id)} />
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No issues found.
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
        <IssueModal key={modalParam} issue={modalRecord} onClose={() => setParam('issue', null)} />
      )}
    </div>
  );
}

function Row({ issue, onClick }: { issue: IssueWithChargePoint; onClick: () => void }) {
  return (
    <tr
      style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '13px 16px', fontWeight: 600, color: C.ink }}>
        {issue.title}
        {issue.ocpp_connector_id ? (
          <span style={{ color: C.slate, fontWeight: 500 }}>
            {' '}
            · connector {issue.ocpp_connector_id}
          </span>
        ) : null}
      </td>
      <td style={{ padding: '13px 16px', color: C.slate }} onClick={(e) => e.stopPropagation()}>
        {issue.charge_point_id ? (
          <Link
            to={`/charge-points/${issue.charge_point_id}`}
            style={{ color: C.green, fontWeight: 600, textDecoration: 'none' }}
          >
            {issue.charge_point_name ?? issue.charge_point_identity}
          </Link>
        ) : (
          '—'
        )}
      </td>
      <td style={{ padding: '13px 16px' }}>
        <Badge
          status={ISSUE_SEVERITY_LABELS[issue.severity as IssueSeverity]}
          override={STATUS_COLORS[SEVERITY_BADGE[issue.severity]]}
        />
      </td>
      <td style={{ padding: '13px 16px' }}>
        <Badge
          status={ISSUE_STATUS_LABELS[issue.status as IssueStatus]}
          override={STATUS_COLORS[STATUS_BADGE[issue.status]]}
        />
      </td>
      <td style={{ padding: '13px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
        {formatDateTime(issue.created_at)}
      </td>
      <td style={{ padding: '13px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
        {formatDateTime(issue.updated_at)}
      </td>
    </tr>
  );
}
