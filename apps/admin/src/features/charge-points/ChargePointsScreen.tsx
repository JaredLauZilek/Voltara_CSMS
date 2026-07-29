import { useMemo, useState } from 'react';
import { Badge, C, KPICard, Toolbar } from '@voltara/ui';
import { SITE_TYPE_LABELS, formatDateTime, type SiteType } from '@voltara/shared';
import { useChargePoints } from './hooks';
import { ConnectorTile } from './ConnectorTile';
import { AddChargerModal } from './AddChargerModal';
import {
  displayStatus,
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chargePoints.filter((cp) => {
      if (q) {
        const hit =
          cp.name.toLowerCase().includes(q) ||
          cp.ocpp_identity.toLowerCase().includes(q) ||
          (cp.location_name ?? '').toLowerCase().includes(q) ||
          (cp.vendor_reported ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter === 'All') return true;
      if (statusFilter === 'Pending') return cp.lifecycle === 'pending';
      if (statusFilter === 'Offline') return cp.connection_state !== 'online';
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

  const stats = useMemo(() => {
    let connectors = 0;
    let available = 0;
    let charging = 0;
    let attention = 0;
    for (const cp of chargePoints) {
      for (const c of cp.connectors) {
        connectors += 1;
        const s = displayStatus(cp, c);
        if (s === 'Available') available += 1;
        else if (s === 'Charging') charging += 1;
        else if (s === 'Faulted' || s === 'Offline') attention += 1;
      }
    }
    return { connectors, available, charging, attention };
  }, [chargePoints]);

  const onlineCount = chargePoints.filter((cp) => cp.connection_state === 'online').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Chargers Online"
          value={`${onlineCount}/${chargePoints.length}`}
          sub={`${stats.connectors} connectors`}
          accent
        />
        <KPICard label="Available" value={stats.available} sub="Ready for a driver" />
        <KPICard label="In Use" value={stats.charging} sub="Delivering energy" />
        <KPICard label="Needs Attention" value={stats.attention} sub="Faulted or offline" />
      </div>

      <Toolbar
        filters={[...STATUS_FILTERS]}
        filter={statusFilter}
        onFilterChange={(f) => setStatusFilter(f as StatusFilter)}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by charger, ID, site or vendor…"
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
        <SiteCard key={group.key} group={group} />
      ))}

      {showAdd && <AddChargerModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function SiteCard({ group }: { group: SiteGroup }) {
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
        else if (s === 'Charging') inUse += 1;
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
                />
              ))
            : [<PendingTile key={cp.id} cp={cp} />],
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
            <strong style={{ color: C.ink, fontWeight: 600 }}>{cp.name}</strong>
            {' · '}
            {cp.lifecycle === 'pending'
              ? 'never connected'
              : cp.connection_state === 'online'
                ? `online${cp.vendor_reported ? ` · ${cp.vendor_reported}` : ''}`
                : `last seen ${cp.last_seen_at ? formatDateTime(cp.last_seen_at) : 'never'}`}
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

/** A charger registered but never yet seen — no connectors reported. */
function PendingTile({ cp }: { cp: ChargePointWithConnectors }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        minWidth: 84,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 700, color: C.slate }}>{cp.ocpp_identity}</span>
      <span
        style={{
          width: 40,
          height: 52,
          borderRadius: 8,
          background: C.divider,
          border: `1.5px dashed ${C.slate}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          color: C.slate,
        }}
      >
        ⚡
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.slate }}>Awaiting</span>
    </div>
  );
}
