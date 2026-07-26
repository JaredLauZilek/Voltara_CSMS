import { STATUS_COLORS, C } from '../tokens';

interface Props {
  status: string;
  override?: { bg: string; color: string };
}

export function Badge({ status, override }: Props) {
  const s = override ?? STATUS_COLORS[status] ?? { bg: C.divider, color: C.slate };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 99,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}

// Alias for clarity at call site (CLAUDE.md mentions "Badge / StatusPill").
export const StatusPill = Badge;
