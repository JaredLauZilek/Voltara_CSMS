import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, C, ChargerIcon, Toolbar } from '@voltara/ui';
import { SITE_TYPE_LABELS, formatDateTime, type SiteType } from '@voltara/shared';
import { useChargePoints, useUptime } from './hooks';
import { ConnectorTile } from './ConnectorTile';
import { AddChargerModal } from './AddChargerModal';
import { StatusBoard } from './StatusBoard';
import {
  displayStatus,
  IN_SESSION_STATUSES,
  STATUS_FILTERS,
  type ChargePointWithConnectors,
  type StatusFilter,
} from './types';

interface SiteGroup {
  key: string;
  name: string;
  siteType: string | null;
  chargePoints: ChargePointWithConnectors[];
}

export function ChargePointsScreen() {
  const { data: chargePoints = [], isLoading } = useChargePoints();
  const { data: uptime = [] } = useUptime(30);
  // Filter and search live in the URL so a filtered view can be shared
  // ("all faulted chargers") — CLAUDE.md §4.4. The add modal is transient.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const rawFilter = params.get('status') ?? 'All';
  const statusFilter: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(rawFilter)
    ? (rawFilter as StatusFilter)
    : 'All';
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const [showAdd, setShowAdd] = useState(false);
  const uptimeFor = (id: string) =>
    uptime.find((u) => u.charge_point_id === id)?.uptime_pct ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chargePoints.filter((cp) => {
      if (q) {
        const hit =
          cp.ocpp_identity.toLowerCase().includes(q) ||
          (cp.registered_serial ?? '').toLowerCase().includes(q) ||
          cp.connectors.some((c) => (c.parking_lot ?? '').toLowerCase().includes(q)) ||
          (cp.location_name ?? '').toLowerCase().includes(q) ||
          (cp.vendor_reported ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Pending') return cp.lifecycle === 'pending';
      return cp.connectors.some((c) => displayStatus(cp, c) === statusFilter);
    });
  }, [chargePoints, search, statusFilter]);

  // Grouped by site, because that is how an operator thinks about a network:
  // "what is happening at Vantage Residences", not "charger 41 of 200".
  const groups = useMemo<SiteGroup[]>(() => {
    const map = new Map<string, SiteGroup>();
    for (const cp of filtered) {
      const key = cp.location_id ?? 'unassigned';
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: cp.location_name ?? 'Unassigned',
          siteType: cp.location_site_type,
          chargePoints: [],
        });
      }
      map.get(key)!.chargePoints.push(cp);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cp of chargePoints) {
      for (const c of cp.connectors) {
        const s = displayStatus(cp, c);
        counts[s] = (counts[s] ?? 0) + 1;
      }
    }
    return counts;
  }, [chargePoints]);

  const onlineCount = chargePoints.filter((cp) => cp.connection_state === 'online').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusBoard
        counts={statusCounts}
        chargerCount={chargePoints.length}
        onlineCount={onlineCount}
        selected={statusFilter}
        onSelect={(s) => setParam('status', s)}
      />

      <Toolbar
        filters={['All', 'Pending']}
        filter={statusFilter}
        onFilterChange={(f) => setParam('status', f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search by charger ID, serial, lot, site or vendor…"
        primaryLabel="+ Add Charger"
        onPrimary={() => setShowAdd(true)}
      />

      {!isLoading && chargePoints.length === 0 && (
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            border: `1px solid ${C.border}`,
            padding: 48,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: C.green, marginBottom: 6 }}>
            No chargers yet.
          </div>
          <div
            style={{
              fontSize: 13,
              color: C.slate,
              lineHeight: 1.6,
              maxWidth: 420,
              margin: '0 auto',
            }}
          >
            Add a charger to generate its connection credentials, then enter them on the unit. It
            appears here the moment it connects.
          </div>
        </div>
      )}

      {!isLoading && chargePoints.length > 0 && groups.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
          No chargers match this filter.
        </div>
      )}

      {groups.map((group) => (
        <SiteCard key={group.key} group={group} uptimeFor={uptimeFor} />
      ))}

      {showAdd && <AddChargerModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function SiteCard({
  group,
  uptimeFor,
}: {
  group: SiteGroup;
  uptimeFor: (id: string) => number | null;
}) {
  const navigate = useNavigate();
  const counts = useMemo(() => {
    let points = 0;
    let available = 0;
    let inUse = 0;
    let offline = 0;
    for (const cp of group.chargePoints) {
      for (const c of cp.connectors) {
        points += 1;
        const s = displayStatus(cp, c);
        if (s === 'Available') available += 1;
        else if ((IN_SESSION_STATUSES as readonly string[]).includes(s)) inUse += 1;
        else if (s === 'Offline') offline += 1;
      }
    }
    return { points, available, inUse, offline };
  }, [group]);

  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 24px',
          background: C.seasalt,
          borderBottom: `1px solid ${C.border}`,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{group.name}</span>
        {group.siteType && (
          <Badge status={SITE_TYPE_LABELS[group.siteType as SiteType] ?? group.siteType} />
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 18 }}>
          <Count label="Points" value={counts.points} />
          <Count label="Available" value={counts.available} tone={C.green} />
          <Count label="In Use" value={counts.inUse} tone={C.info} />
          <Count
            label="Offline"
            value={counts.offline}
            tone={counts.offline > 0 ? C.error : C.slate}
          />
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '20px 24px' }}>
        {group.chargePoints.flatMap((cp) =>
          cp.connectors.length > 0
            ? cp.connectors.map((connector) => (
                <ConnectorTile
                  key={connector.id}
                  identity={cp.ocpp_identity}
                  connector={connector}
                  status={displayStatus(cp, connector)}
                  onClick={() => navigate(`/charge-points/${cp.id}`)}
                />
              ))
            : [
                <button
                  key={cp.id}
                  onClick={() => navigate(`/charge-points/${cp.id}`)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  <PendingTile cp={cp} />
                </button>,
              ],
        )}
      </div>

      <div
        style={{
          borderTop: `1px solid ${C.divider}`,
          padding: '10px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        {group.chargePoints.map((cp) => (
          <span key={cp.id} style={{ fontSize: 11, color: C.slate }}>
            <Link
              to={`/charge-points/${cp.id}`}
              style={{ color: C.ink, fontWeight: 600, textDecoration: 'none' }}
            >
              {cp.ocpp_identity}
            </Link>
            {' · '}
            {cp.lifecycle === 'pending'
              ? 'never connected'
              : cp.connection_state === 'online'
                ? `online${cp.vendor_reported ? ` · ${cp.vendor_reported}` : ''}`
                : `last seen ${cp.last_seen_at ? formatDateTime(cp.last_seen_at) : 'never'}`}
            {uptimeFor(cp.id) !== null ? ` · ${uptimeFor(cp.id)!.toFixed(1)}% uptime` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function Count({ label, value, tone = C.slate }: { label: string; value: number; tone?: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.slate,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: tone }}>{value}</span>
    </span>
  );
}

/**
 * A charger registered but never yet seen — no connectors reported. Laid out
 * row for row like ConnectorTile (identity · icon · connector · status) so it
 * lines up with its neighbours; the connector number is unknown until it boots.
 */
function PendingTile({ cp }: { cp: ChargePointWithConnectors }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        minWidth: 84,
        fontFamily: 'Figtree',
      }}
    >
      <span
        title={cp.ocpp_identity}
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.slate,
          maxWidth: 96,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {cp.ocpp_identity}
      </span>
      <ChargerIcon color={C.slate} height={40} frame="dashed" />
      <span style={{ fontSize: 10, fontWeight: 600, color: C.slate }}>Gun --</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.slate }}>Awaiting</span>
    </div>
  );
}
