import type { ReactNode } from 'react';
import { C } from '../tokens';

interface Props {
  filters?: string[];
  filter?: string;
  onFilterChange?: (f: string) => void;
  search?: string;
  onSearchChange?: (s: string) => void;
  searchPlaceholder?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  extra?: ReactNode;
}

export function Toolbar({
  filters,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  primaryLabel,
  onPrimary,
  extra,
}: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {filters && filters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => onFilterChange?.(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 99,
                  border: `1px solid ${active ? C.green : C.border}`,
                  background: active ? C.green : C.white,
                  color: active ? C.white : C.slate,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Figtree',
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      )}
      {onSearchChange && (
        <div style={{ position: 'relative', width: 220 }}>
          <input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%',
              padding: '8px 14px 8px 34px',
              borderRadius: 99,
              border: `1px solid ${C.border}`,
              fontFamily: 'Figtree',
              fontSize: 13,
              outline: 'none',
              background: C.white,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.slate,
              fontSize: 15,
            }}
          >
            ⌕
          </span>
        </div>
      )}
      {extra}
      {primaryLabel && onPrimary && (
        <button
          onClick={onPrimary}
          style={{
            marginLeft: 'auto',
            padding: '8px 18px',
            borderRadius: 10,
            border: 'none',
            background: C.green,
            color: C.white,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'Figtree',
            cursor: 'pointer',
          }}
        >
          {primaryLabel}
        </button>
      )}
    </div>
  );
}
