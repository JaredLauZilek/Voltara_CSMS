import { C } from '../../tokens';

interface Segment {
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
}

export function Donut({ segments }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let cumulative = 0;
  const r = 38;
  const cx = 45;
  const cy = 45;
  const strokeW = 12;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="90" height="90">
      {segments.map((seg, i) => {
        const pct = total === 0 ? 0 : seg.value / total;
        const rotation = -90 + cumulative * 360;
        cumulative += pct;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeDasharray={`${circumference * pct} ${circumference * (1 - pct)}`}
            strokeDashoffset={0}
            transform={`rotate(${rotation} ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray .4s' }}
          />
        );
      })}
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Figtree"
        fill={C.green}
      >
        {total}
      </text>
    </svg>
  );
}
