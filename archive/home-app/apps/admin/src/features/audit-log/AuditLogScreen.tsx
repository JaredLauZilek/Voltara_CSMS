import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { C, Pagination, Toolbar, usePagination } from '@voltara/ui';
import { formatDateTime } from '@/shared/lib/format';
import { card, emptyState, linkStyle, rowStyle, table, td, th } from '@/shared/lib/styles';
import { useAuditLog, useAuditPeople } from './hooks';
import { compactJson } from './types';
import type { AuditRow } from './types';

const COLUMNS = ['At', 'Actor', 'Action', 'Resource', 'Change'];
const PAGE_SIZE = 25;

export function AuditLogScreen() {
  const { data: rows = [], isLoading } = useAuditLog();
  const { data: people = [] } = useAuditPeople();
  const [search, setSearch] = useState('');

  const personById = useMemo(
    () => new Map(people.filter((p) => p.user_id).map((p) => [p.user_id as string, p])),
    [people],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.action.toLowerCase().includes(q));
  }, [rows, search]);

  const pagination = usePagination(filtered, PAGE_SIZE);
  const { setPage } = pagination;
  useEffect(() => {
    setPage(1);
  }, [search, setPage]);

  const actorLabel = (r: AuditRow): string => {
    if (r.actor_type === 'system') return 'System';
    if (!r.actor_user_id) return '—';
    const p = personById.get(r.actor_user_id);
    return p?.full_name || p?.email || r.actor_user_id.slice(0, 8);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by action, e.g. staff.invited…"
        extra={<span style={{ fontSize: 12, color: C.slate }}>Newest 200 entries</span>}
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
            {pagination.pageItems.map((r) => (
              <tr key={r.id} style={rowStyle}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDateTime(r.at)}</td>
                <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{actorLabel(r)}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: C.ink }}>
                  {r.action}
                </td>
                <td style={td}>
                  <ResourceCell type={r.resource_type} id={r.resource_id} />
                </td>
                <td style={{ ...td, maxWidth: 420 }}>
                  <ChangeCell before={r.before} after={r.after} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && filtered.length === 0 && <div style={emptyState}>No entries found.</div>}
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

function ResourceCell({ type, id }: { type: string | null; id: string | null }) {
  if (!type && !id) return <>—</>;
  const short = id ? id.slice(0, 8) : '';
  const isCharger = type === 'charger' || type === 'chargers';
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {type ?? ''}
      {id && (
        <>
          {' · '}
          {isCharger ? (
            <Link
              to={`/chargers/${id}`}
              style={{ ...linkStyle, fontFamily: 'monospace', fontSize: 12 }}
            >
              {short}
            </Link>
          ) : (
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{short}</span>
          )}
        </>
      )}
    </span>
  );
}

function ChangeCell({ before, after }: { before: unknown; after: unknown }) {
  const b = compactJson(before);
  const a = compactJson(after);
  if (!b && !a) return <>—</>;
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 11,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: C.slate,
        lineHeight: 1.5,
      }}
    >
      {b && `− ${b}`}
      {b && a && '\n'}
      {a && `+ ${a}`}
    </pre>
  );
}
