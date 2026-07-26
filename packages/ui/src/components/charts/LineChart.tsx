import { C } from '../../tokens';

interface Props {
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
}

export function LineChart({ data, labels, color = C.green, height = 160 }: Props) {
  const max = Math.max(...data) * 1.1 || 1;
  const W = 520;
  const H = height;
  const pts = data.map((v, i) => {
    const x = 48 + (i / (data.length - 1)) * (W - 60);
    const y = H - 24 - (v / max) * (H - 48);
    return { x, y, v };
  });
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area =
    `M ${pts[0].x},${H - 24} ` +
    pts.map((p) => `L ${p.x},${p.y}`).join(' ') +
    ` L ${pts[pts.length - 1].x},${H - 24} Z`;
  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => H - 24 - f * (H - 48));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {gridLines.map((gy, i) => (
        <line key={i} x1="48" x2={W - 12} y1={gy} y2={gy} stroke={C.honeydew} strokeWidth="1" />
      ))}
      <defs>
        <linearGradient id="areafill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.13" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areafill)" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="white" stroke={color} strokeWidth="2" />
      ))}
      {labels.map((l, i) => {
        const x = 48 + (i / (data.length - 1)) * (W - 60);
        return (
          <text
            key={i}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fontFamily="Figtree"
            fill={C.slate}
          >
            {l}
          </text>
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
          {Math.round((max * f) / 1000)}k
        </text>
      ))}
    </svg>
  );
}
