import { useEffect, useId, useRef, useState } from 'react';
import { C } from '../../tokens';

interface Props {
  data: number[];
  /** One label per point (e.g. 'HH:MM'); the chart shows as many as fit the width. */
  labels: string[];
  color?: string;
  /** Total height, x-axis labels included. */
  height?: number;
  /** Axis tick formatter. Defaults to the accounting-style thousands ("12k"). */
  formatValue?: (v: number) => string;
  /** Show a marker on every point — for sparse series only. */
  showPoints?: boolean;
  /** Distinct SVG gradient id when several charts share a page. Generated if omitted. */
  gradientId?: string;
  /**
   * The hovered point, when the caller owns it — so two charts over the same
   * time axis move their crosshairs together. Omit to let the chart track it.
   */
  activeIndex?: number | null;
  /** Hover/keyboard moves the crosshair; the caller shows the value in the card header. */
  onHover?: (index: number | null) => void;
  /** Accessible name, e.g. 'Power over the session'. */
  ariaLabel?: string;
}

const TOP = 10;
const BOTTOM = 26; // x-axis label band
const RIGHT = 14;
const MIN_LABEL_GAP = 64; // px between x-axis label centres

/** Clean ticks from 0: a 1/2/2.5/5 × 10ⁿ step giving about `count` intervals. */
function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const steps = Math.ceil(max / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

/** Label every k-th point, with k a round count so the labels land on even times. */
function labelStride(pointSpacing: number): number {
  const need = MIN_LABEL_GAP / Math.max(pointSpacing, 1e-6);
  for (const k of [1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 240, 480, 1440]) if (k >= need) return k;
  return Math.ceil(need);
}

/**
 * A single-series line over time, drawn at the container's real pixel width
 * (re-measured on resize) so text and strokes never stretch. Hover or arrow
 * keys move a crosshair that snaps to the nearest point; the value belongs in
 * the card header's readout (package rule 4), reported through `onHover`.
 */
export function LineChart({
  data,
  labels,
  color = C.green,
  height = 180,
  formatValue = (v) => `${Math.round(v / 1000)}k`,
  showPoints = false,
  gradientId,
  activeIndex,
  onHover,
  ariaLabel,
}: Props) {
  const autoId = useId();
  const fillId = gradientId ?? `line-${autoId.replace(/:/g, '')}`;
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ownActive, setOwnActive] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const active = activeIndex !== undefined ? activeIndex : ownActive;
  const setActive = (i: number | null) => {
    setOwnActive(i);
    onHover?.(i);
  };

  const n = data.length;
  const H = height;
  const ticks = niceTicks(Math.max(0, ...data));
  const top = ticks[ticks.length - 1] || 1;
  const tickText = ticks.map(formatValue);
  // Room for the widest tick label (Figtree 11px ≈ 6.5px a glyph) plus a gap.
  const left = Math.max(...tickText.map((t) => t.length)) * 6.5 + 14;
  const plotW = Math.max(0, width - left - RIGHT);
  const plotH = H - TOP - BOTTOM;
  const xAt = (i: number) => (n > 1 ? left + (i / (n - 1)) * plotW : left + plotW / 2);
  const yAt = (v: number) => TOP + plotH - (Math.max(0, v) / top) * plotH;

  const ready = width > 0 && n > 0;
  const pts = ready ? data.map((v, i) => ({ x: xAt(i), y: yAt(v) })) : [];
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const baseY = TOP + plotH;
  const area = pts.length
    ? `${line} L${pts[pts.length - 1]!.x.toFixed(1)},${baseY} L${pts[0]!.x.toFixed(1)},${baseY} Z`
    : '';
  const stride = labelStride(n > 1 ? plotW / (n - 1) : plotW);

  const indexAt = (clientX: number, svg: SVGSVGElement) => {
    const x = clientX - svg.getBoundingClientRect().left;
    if (n <= 1) return 0;
    return Math.min(n - 1, Math.max(0, Math.round(((x - left) / plotW) * (n - 1))));
  };

  return (
    <div ref={boxRef} style={{ width: '100%', height: H, position: 'relative' }}>
      {ready && (
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          style={{ display: 'block', outline: 'none', touchAction: 'pan-y' }}
          tabIndex={0}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={(e) => setActive(indexAt(e.clientX, e.currentTarget))}
          onPointerDown={(e) => setActive(indexAt(e.clientX, e.currentTarget))}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const step = e.key === 'ArrowRight' ? 1 : -1;
              setActive(Math.min(n - 1, Math.max(0, (active ?? (step > 0 ? -1 : n)) + step)));
            } else if (e.key === 'Escape') {
              setActive(null);
            }
          }}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.13" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={left}
                x2={width - RIGHT}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke={i === 0 ? C.border : C.divider}
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
              <text
                x={left - 10}
                y={yAt(t) + 4}
                textAnchor="end"
                fontSize="11"
                fontFamily="Figtree"
                fill={C.slate}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {tickText[i]}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${fillId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {showPoints &&
            pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="4"
                fill={color}
                stroke={C.white}
                strokeWidth="2"
              />
            ))}

          {labels.map((l, i) => {
            if (!l || i % stride !== 0) return null;
            const x = xAt(i);
            // Keep the last labels inside the box rather than clipping them.
            const anchor = x + l.length * 3.3 > width ? 'end' : 'middle';
            return (
              <text
                key={i}
                x={anchor === 'end' ? width - 2 : x}
                y={H - 7}
                textAnchor={anchor}
                fontSize="11"
                fontFamily="Figtree"
                fill={C.slate}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {l}
              </text>
            );
          })}

          {active !== null && pts[active] && (
            <g pointerEvents="none">
              <line
                x1={pts[active].x}
                x2={pts[active].x}
                y1={TOP}
                y2={baseY}
                stroke={C.slate}
                strokeOpacity="0.45"
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
              <circle
                cx={pts[active].x}
                cy={pts[active].y}
                r="5"
                fill={color}
                stroke={C.white}
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
