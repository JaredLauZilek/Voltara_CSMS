import { useState } from 'react';
import { C, STATUS_COLORS, useViewport } from '@voltara/ui';
import { CONNECTOR_STATUS_INFO, STATUS_GROUPS, type StatusFilter } from './types';

type Status = keyof typeof CONNECTOR_STATUS_INFO;

const GAP = 12;

/**
 * Connector count per status, across the whole network, at a glance.
 *
 * Every status is always on the board — including the empty ones — so it
 * doubles as a map of what each OCPP status means (the ⓘ on each tile
 * explains it). Two rows of equal tiles: groups share one grid of equal
 * columns; on narrow screens each group wraps on its own. Clicking a tile
 * filters the list below to it.
 */
export function StatusBoard({
  counts,
  chargerCount,
  onlineCount,
  selected,
  onSelect,
}: {
  counts: Record<string, number>;
  chargerCount: number;
  onlineCount: number;
  selected: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}) {
  const { width } = useViewport();
  const connectorCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const groups = STATUS_GROUPS.map((group) => ({
    label: group.label,
    row: group.row,
    statuses: group.statuses.filter(
      (s) => !group.hideWhenEmpty?.includes(s) || (counts[s] ?? 0) > 0,
    ),
  }));
  const rowLength = (row: number) =>
    groups.filter((g) => g.row === row).reduce((n, g) => n + g.statuses.length, 0);
  const columns = Math.max(rowLength(1), rowLength(2));
  // Two rows need roughly 140px per tile (plus the sidebar) to stay legible.
  const twoRows = width >= columns * 140 + 300;

  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Gun status</span>
        <span style={{ fontSize: 13, color: C.slate }}>
          {connectorCount} guns · {onlineCount}/{chargerCount} chargers online
        </span>
      </div>

      <div
        style={
          twoRows
            ? {
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `16px ${GAP}px`,
              }
            : { display: 'flex', flexDirection: 'column', gap: 16 }
        }
      >
        {groups.map((group) => (
          <div
            key={group.label}
            style={{
              gridColumn: twoRows ? `span ${group.statuses.length}` : undefined,
              gridRow: twoRows ? group.row : undefined,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.slate,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {group.label}
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: twoRows
                  ? `repeat(${group.statuses.length}, minmax(0, 1fr))`
                  : 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: GAP,
              }}
            >
              {group.statuses.map((s) => (
                <StatusTile
                  key={s}
                  status={s}
                  count={counts[s] ?? 0}
                  active={selected === s}
                  onClick={() => onSelect(selected === s ? 'All' : s)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusTile({
  status,
  count,
  active,
  onClick,
}: {
  status: Status;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const info = CONNECTOR_STATUS_INFO[status];
  const palette = STATUS_COLORS[status] ?? STATUS_COLORS.Unknown!;
  const empty = count === 0;
  const tone = empty ? C.slate : palette.color;

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        onClick={onClick}
        title={active ? 'Click to clear the filter' : 'Click to filter the list'}
        style={{
          width: '100%',
          height: 96,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '12px 14px',
          borderRadius: 12,
          border: `1.5px solid ${active ? palette.color : 'transparent'}`,
          background: empty ? C.seasalt : palette.bg,
          cursor: 'pointer',
          fontFamily: 'Figtree',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            maxWidth: 'calc(100% - 26px)',
            fontSize: 11,
            fontWeight: 700,
            color: tone,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {info.label}
        </span>
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: tone,
            opacity: empty ? 0.5 : 1,
          }}
        >
          {count}
        </span>
      </button>
      <InfoButton info={info} tone={tone} />
    </div>
  );
}

/** The ⓘ in the tile's corner: what the status means, on hover or tap. */
function InfoButton({
  info,
  tone,
}: {
  info: (typeof CONNECTOR_STATUS_INFO)[Status];
  tone: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: 'absolute', top: 8, right: 8 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-label={`What ${info.label} means`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        style={{
          width: 22,
          height: 22,
          borderRadius: 99,
          border: `1px solid ${tone}`,
          background: C.white,
          color: tone,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
          opacity: 0.75,
        }}
      >
        <span
          aria-hidden
          style={{ fontFamily: 'Figtree', fontSize: 13, fontWeight: 800, lineHeight: 1 }}
        >
          i
        </span>
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 28,
            right: 0,
            zIndex: 10,
            width: 220,
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{info.hint}.</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.slate }}>
            {info.ocpp ? `OCPP status · ${info.ocpp}` : 'CSMS status · not part of OCPP'}
          </span>
        </span>
      )}
    </span>
  );
}
