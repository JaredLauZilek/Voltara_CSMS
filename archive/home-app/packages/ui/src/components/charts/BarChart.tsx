import { C } from '../../tokens';

interface Props {
  data: number[][];
  labels: string[];
  colors?: string[];
  height?: number;
}

export function BarChart({ data, labels, colors = [C.green, C.opal], height = 160 }: Props) {
  const allVals = data.flat();
  const max = Math.max(...allVals) * 1.1 || 1;
  const W = 520;
  const H = height;
  const barW = 16;
  const gap = 4;
  const groupW = data[0].length * (barW + gap);
  const groupGap = (W - 60 - groupW * labels.length) / (labels.length + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75, 1].map((f, i) => {
        const gy = H - 24 - f * (H - 48);
        return (
          <line key={i} x1="48" x2={W - 12} y1={gy} y2={gy} stroke={C.honeydew} strokeWidth="1" />
        );
      })}
      {labels.map((l, gi) => {
        const gx = 48 + groupGap + gi * (groupW + groupGap);
        return (
          <g key={gi}>
            {data[gi].map((v, bi) => {
              const bh = (v / max) * (H - 48);
              const bx = gx + bi * (barW + gap);
              const by = H - 24 - bh;
              return (
                <rect
                  key={bi}
                  x={bx}
                  y={by}
                  width={barW}
                  height={bh}
                  rx="3"
                  fill={colors[bi % colors.length]}
                />
              );
            })}
            <text
              x={gx + groupW / 2 - barW / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize="10"
              fontFamily="Figtree"
              fill={C.slate}
            >
              {l}
            </text>
          </g>
        );
      })}
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <text
          key={i}
          x="42"
          y={H - 24 - f * (H - 48) + 4}
          textAnchor="end"
          fontSize="10"
          fontFamily="Figtree"
          fill={C.slate}
        >
          {Math.round(max * f)}
        </text>
      ))}
    </svg>
  );
}
