import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { C, KPICard } from '@voltara/ui';
import { CHARGER_LIFECYCLES } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { formatDateTime } from '@/shared/lib/format';
import { card, cardHeader, emptyState, linkStyle, sectionTitle } from '@/shared/lib/styles';
import {
  DAY_MS,
  LifecycleBadge,
  SeverityBadge,
  isChargingNow,
  isFaulted,
  seenWithin,
  useChargers,
} from '@/features/chargers';
import { useFleetOverview, useOpenTicketCount, useRecentEvents } from './hooks';
import type { FleetKpis } from './types';

export function OverviewScreen() {
  const { isStaff } = useAuth();
  // Staff get one round trip from fleet_overview(); dealers derive the same
  // numbers from the rows RLS lets them see (the RPC returns null for them).
  const { data: fleet } = useFleetOverview(isStaff);
  const { data: chargers = [] } = useChargers();
  const { data: openTickets = 0 } = useOpenTicketCount(!isStaff);
  const { data: events = [], isLoading: eventsLoading } = useRecentEvents();

  const kpi = useMemo<FleetKpis>(() => {
    if (fleet) return fleet;
    const live = chargers.filter((c) => c.lifecycle !== 'decommissioned');
    return {
      chargers_total: live.length,
      chargers_claimed: live.filter((c) => c.lifecycle === 'claimed').length,
      seen_24h: chargers.filter((c) => seenWithin(c, DAY_MS)).length,
      charging_now: chargers.filter(isChargingNow).length,
      faulted: chargers.filter(isFaulted).length,
      open_tickets: openTickets,
    };
  }, [fleet, chargers, openTickets]);

  const byLifecycle = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chargers) m.set(c.lifecycle, (m.get(c.lifecycle) ?? 0) + 1);
    return m;
  }, [chargers]);
  const chargerById = useMemo(() => new Map(chargers.map((c) => [c.id, c])), [chargers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Chargers onboarded"
          value={`${kpi.chargers_claimed} / ${kpi.chargers_total}`}
          sub="Claimed by an owner / registered"
          accent
        />
        <KPICard label="Seen in last 24 h" value={kpi.seen_24h} sub="Reported through the app" />
        <KPICard label="Charging now" value={kpi.charging_now} sub="Reported in the last 10 min" />
        <KPICard
          label="Needs attention"
          value={kpi.faulted + kpi.open_tickets}
          sub={`${kpi.faulted} faulted · ${kpi.open_tickets} open ticket${kpi.open_tickets === 1 ? '' : 's'}`}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <div style={card}>
          <div style={cardHeader}>
            <span style={sectionTitle}>Recent events</span>
            <Link to="/chargers" style={{ ...linkStyle, marginLeft: 'auto', fontSize: 12 }}>
              All chargers ›
            </Link>
          </div>
          {!eventsLoading && events.length === 0 ? (
            <div style={emptyState}>No events yet.</div>
          ) : (
            events.map((e) => {
              const c = chargerById.get(e.charger_id);
              return (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 24px',
                    borderBottom: `1px solid ${C.divider}`,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: C.slate, whiteSpace: 'nowrap', width: 130, flexShrink: 0 }}>
                    {formatDateTime(e.created_at)}
                  </span>
                  <Link
                    to={`/chargers/${e.charger_id}`}
                    style={{
                      color: C.ink,
                      fontWeight: 600,
                      textDecoration: 'none',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c?.serial ?? e.charger_id.slice(0, 8)}
                  </Link>
                  <span
                    style={{
                      color: C.slate,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.message ?? e.type}
                  </span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <SeverityBadge severity={e.severity} />
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div style={card}>
          <div style={cardHeader}>
            <span style={sectionTitle}>Fleet by lifecycle</span>
          </div>
          {CHARGER_LIFECYCLES.map((l) => (
            <Link
              key={l}
              to={`/chargers?lifecycle=${l}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 24px',
                borderBottom: `1px solid ${C.divider}`,
                textDecoration: 'none',
              }}
            >
              <LifecycleBadge lifecycle={l} />
              <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: C.green }}>
                {byLifecycle.get(l) ?? 0}
              </span>
              <span style={{ fontSize: 12, color: C.slate }}>›</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
