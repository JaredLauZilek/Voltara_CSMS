import { useState } from 'react';
import { C } from '../tokens';

export const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = items.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, items.length);
  return {
    page: safePage,
    setPage,
    pageItems,
    totalPages,
    totalItems: items.length,
    pageSize,
    from,
    to,
    reset: () => setPage(1),
  };
}

interface Props {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  from: number;
  to: number;
  onPageChange: (p: number) => void;
  /** When true, draws a top border to separate from a table container. */
  bordered?: boolean;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  from,
  to,
  onPageChange,
  bordered = true,
}: Props) {
  if (totalItems <= pageSize) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderTop: bordered ? `1px solid ${C.border}` : 'none',
      }}
    >
      <span style={{ fontSize: 13, color: C.slate }}>
        {from}–{to} of {totalItems}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${p === page ? C.green : C.border}`,
              background: p === page ? C.green : C.white,
              color: p === page ? C.white : C.slate,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Figtree',
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
