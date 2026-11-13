import { useState } from 'react';
import { C, STATUS_COLORS } from '@voltara/ui';
import { CONNECTOR_STATUS_INFO, STATUS_GROUPS, type StatusFilter } from './types';

type Status = keyof typeof CONNECTOR_STATUS_INFO;

const TILE = 88;
const TILE_GAP = 8;

/**
 * Gun count per status, across the whole network, at a glance.
 *
 * Every status is always on the board — including the empty ones — so it
 * doubles as a map of what each OCPP status means (the ⓘ on each tile
 * explains it). One row of small square tiles, grouped in lifecycle order;
 * the row wraps on narrow screens. Clicking a tile filters the list below.
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
  const connectorCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const groups = STATUS_GROUPS.map((group) => ({
    label: group.label,
    statuses: group.statuses.filter(
      (s) => !group.hideWhenEmpty?.includes(s) || (counts[s] ?? 0) > 0,
    ),
  }));

  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.green }}>Gun status</span>
        <span style={{ fontSize: 13, color: C.slate }}>
          {connectorCount} guns · {onlineCount}/{chargerCount} chargers online
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px' }}>
        {groups.map((group, g) => (
          <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.slate,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              {group.label}
            </span>
            <div style={{ display: 'flex', gap: TILE_GAP }}>
              {group.statuses.map((s) => (
                <StatusTile
                  key={s}
                  status={s}
                  count={counts[s] ?? 0}
                  active={selected === s}
                  // Popovers open towards the middle of the board.
                  popoverSide={g < groups.length / 2 ? 'left' : 'right'}
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
  popoverSide,
  onClick,
}: {
  status: Status;
  count: number;
  active: boolean;
  popoverSide: 'left' | 'right';
  onClick: () => void;
}) {
  const info = CONNECTOR_STATUS_INFO[status];
  const palette = STATUS_COLORS[status] ?? STATUS_COLORS.Unknown!;
  const empty = count === 0;
  const tone = empty ? C.slate : palette.color;

  return (
    <div style={{ position: 'relative', width: TILE, height: TILE, flexShrink: 0 }}>
      <button
        onClick={onClick}
        title={active ? 'Click to clear the filter' : 'Click to filter the list'}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          padding: '14px 4px 6px',
          borderRadius: 12,
          border: `1.5px solid ${active ? palette.color : 'transparent'}`,
          background: empty ? C.seasalt : palette.bg,
          cursor: 'pointer',
          fontFamily: 'Figtree',
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: tone,
            opacity: empty ? 0.5 : 1,
          }}
        >
          {count}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: tone,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          {info.label}
        </span>
      </button>
      <InfoButton info={info} tone={tone} side={popoverSide} />
    </div>
  );
}

/** The ⓘ in the tile's corner: what the status means, on hover or tap. */
function InfoButton({
  info,
  tone,
  side,
}: {
  info: (typeof CONNECTOR_STATUS_INFO)[Status];
  tone: string;
  side: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: 'absolute', top: 5, right: 5 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-label={`What ${info.label} means`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        style={{
          width: 16,
          height: 16,
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
          style={{ fontFamily: 'Figtree', fontSize: 10, fontWeight: 800, lineHeight: 1 }}
        >
          i
        </span>
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 22,
            ...(side === 'left' ? { left: -60 } : { right: 0 }),
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
