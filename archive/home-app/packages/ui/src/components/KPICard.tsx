import type { ReactNode } from 'react';
import { C } from '../tokens';

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: string;
  trendUp?: boolean;
  chart?: ReactNode;
  accent?: boolean;
}

export function KPICard({ label, value, sub, trend, trendUp, chart, accent = false }: Props) {
  return (
    <div
      style={{
        background: accent ? C.green : C.white,
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        border: `1px solid ${accent ? C.green : C.border}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: accent ? 'rgba(255,255,255,0.7)' : C.slate,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: accent ? C.yellow : C.green,
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: accent ? 'rgba(255,255,255,0.6)' : C.slate }}>{sub}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {trend && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: trendUp ? (accent ? C.yellow : '#22a14b') : '#e05252',
              background: trendUp ? (accent ? 'rgba(254,204,62,0.15)' : C.honeydew) : '#fdeaea',
              padding: '2px 8px',
              borderRadius: 99,
            }}
          >
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
        {chart && <div style={{ opacity: 0.8 }}>{chart}</div>}
      </div>
    </div>
  );
}
