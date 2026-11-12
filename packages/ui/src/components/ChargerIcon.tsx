import { C } from '../tokens';

interface Props {
  /** Outline and bolt colour — a STATUS_COLORS `.color` for a connector. */
  color?: string;
  /** Height in px; the unit is drawn at 3:4. */
  height?: number;
  /** solid = a connector · dashed = registered, never seen · none = the bolt alone. */
  frame?: 'solid' | 'dashed' | 'none';
}

/**
 * A charger, drawn: a rounded unit outline with a bolt, both in one colour.
 *
 * Hand-drawn SVG rather than the ⚡ glyph, which every platform renders as a
 * yellow colour emoji regardless of the text colour — so it could never carry
 * a connector's status (root CLAUDE.md §3, Icons).
 */
export function ChargerIcon({ color = C.green, height = 40, frame = 'solid' }: Props) {
  const bolt = (
    <path
      d="M13.6 6.5 7.4 17.2h4.3l-1.2 8.3 6.2-10.7h-4.3z"
      fill={color}
      stroke={color}
      strokeWidth="1"
      strokeLinejoin="round"
    />
  );
  return (
    <svg
      width={(height * 3) / 4}
      height={height}
      viewBox="0 0 24 32"
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      {frame !== 'none' && (
        <rect
          x="1.25"
          y="1.25"
          width="21.5"
          height="29.5"
          rx="5"
          fill={C.white}
          stroke={color}
          strokeWidth="2"
          strokeDasharray={frame === 'dashed' ? '3 2.5' : undefined}
        />
      )}
      {bolt}
    </svg>
  );
}
