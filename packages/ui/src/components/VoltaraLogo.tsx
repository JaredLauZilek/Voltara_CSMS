import { C } from '../tokens';

interface Props {
  height?: number;
  dark?: boolean;
}

export function VoltaraLogo({ height = 32, dark = false }: Props) {
  const fill = dark ? C.white : C.green;
  return (
    <svg
      height={height}
      viewBox="0 0 220 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <g>
        <rect width="40" height="40" rx="8" fill={C.green} y="6" />
        <polygon points="24,8 14,26 21,26 16,46 30,24 23,24" fill={C.yellow} />
      </g>
      <text
        x="52"
        y="37"
        fontFamily="Figtree, sans-serif"
        fontWeight="700"
        fontSize="28"
        letterSpacing="-0.03em"
        fill={fill}
      >
        voltara
      </text>
    </svg>
  );
}
