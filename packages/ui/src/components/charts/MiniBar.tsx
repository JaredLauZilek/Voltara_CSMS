import { C } from '../../tokens';

interface Props {
  data: number[];
  color?: string;
}

export function MiniBar({ data, color = C.green }: Props) {
  const max = Math.max(...data);
  return (
    <svg width="120" height="40" style={{ display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * 36;
        return (
          <rect
            key={i}
            x={i * 14}
            y={40 - bh}
            width="10"
            height={bh}
            rx="2"
            fill={color}
            opacity={0.7 + 0.3 * (i / data.length)}
          />
        );
      })}
    </svg>
  );
}
