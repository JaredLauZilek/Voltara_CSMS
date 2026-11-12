import { useEffect, useMemo, useState } from 'react';
import { Badge, C, KPICard, Pagination, STATUS_COLORS, Toolbar, usePagination } from '@voltara/ui';
import { useChargers } from '@/features/chargers';
import { formatRelative } from '@/shared/lib/format';
import { card, emptyState, rowStyle, table, td, th } from '@/shared/lib/styles';
import { useProfiles, useTickets } from './hooks';
import { TicketModal } from './TicketModal';
import { TICKET_FILTERS, TICKET_STATUS_PILL, isTicketStatus, ticketLabel } from './types';
import type { TicketFilter } from './types';

const COLUMNS = ['Subject', 'Charger', 'Requester', 'Status', 'Assigned', 'Updated'];

export function SupportScreen() {
  const { data: tickets = [], isLoading } = useTickets();
  const { data: chargers = [] } = useChargers();
  const [filter, setFilter] = useState<TicketFilter>('All');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const userIds = useMemo(
    () => tickets.flatMap((t) => [t.user_id, t.assigned_to]).filter((id): id is string => !!id),
    [tickets],
  );
  const { data: profiles = [] } = useProfiles(userIds);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const chargerById = useMemo(() => new Map(chargers.map((c) => [c.id, c])), [chargers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter !== 'All' && ticketLabel(t.status) !== filter) return false;
      if (!q) return true;
      const charger = t.charger_id ? chargerById.get(t.charger_id) : undefined;
      const requester = profileById.get(t.user_id);
      const hay = [
        t.subject,
        t.body,
        charger?.serial,
        charger?.name,
        requester?.full_name,
        requester?.email,
      ];
      return hay.some((h) => (h ?? '').toLowerCase().includes(q));
    });
  }, [tickets, filter, search, chargerById, profileById]);

  const pagination = usePagination(filtered);
  const { setPage } = pagination;
  useEffect(() => {
    setPage(1);
  }, [filter, search, setPage]);

  const open = tickets.filter((t) => t.status === 'open').length;
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
  const unassigned = tickets.filter(
    (t) => (t.status === 'open' || t.status === 'in_progress') && !t.assigned_to,
  ).length;

  // Always pass the live row to the modal, never the one captured at click time.
  const ticket = openId ? (tickets.find((t) => t.id === openId) ?? null) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Open" value={open} sub="Waiting for a first response" accent />
        <KPICard label="In progress" value={inProgress} sub="Being worked" />
        <KPICard label="Unassigned" value={unassigned} sub="Open or in progress, nobody on it" />
        <KPICard label="All tickets" value={tickets.length} sub="Including resolved and closed" />
      </div>

      <Toolbar
        filters={[...TICKET_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setFilter(f as TicketFilter)}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search subject, serial or requester…"
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
            {pagination.pageItems.map((t) => {
              const charger = t.charger_id ? chargerById.get(t.charger_id) : undefined;
              const requester = profileById.get(t.user_id);
              const assignee = t.assigned_to ? profileById.get(t.assigned_to) : undefined;
              return (
                <tr
                  key={t.id}
                  style={{ ...rowStyle, cursor: 'pointer' }}
                  onClick={() => setOpenId(t.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{t.subject}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                    {charger?.serial ?? '—'}
                  </td>
                  <td style={td}>{requester?.full_name || requester?.email || '—'}</td>
                  <td style={td}>
                    <Badge
                      status={ticketLabel(t.status)}
                      override={
                        isTicketStatus(t.status)
                          ? STATUS_COLORS[TICKET_STATUS_PILL[t.status]]
                          : undefined
                      }
                    />
                  </td>
                  <td style={td}>
                    {t.assigned_to ? assignee?.full_name || assignee?.email || 'Assigned' : '—'}
                  </td>
                  <td style={td}>{formatRelative(t.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && filtered.length === 0 && <div style={emptyState}>No tickets found.</div>}
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

      {ticket && (
        <TicketModal
          key={ticket.id}
          ticket={ticket}
          charger={ticket.charger_id ? chargerById.get(ticket.charger_id) : undefined}
          requester={profileById.get(ticket.user_id)}
          assignee={ticket.assigned_to ? profileById.get(ticket.assigned_to) : undefined}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
