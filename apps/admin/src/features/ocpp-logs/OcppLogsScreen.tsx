import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { C, Toolbar } from '@voltara/ui';
import { formatDateTime } from '@voltara/shared';
import { useChargePoints } from '@/features/charge-points';
import { useOcppLog } from './hooks';
import { COMMON_ACTIONS, DIRECTION_FILTERS } from './types';
import type { OcppMessage } from './types';

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
};

/**
 * Every OCPP frame across the tenant, newest first. This is the record that
 * settles arguments with vendors — filter it, expand a frame, and the payload
 * is exactly what crossed the wire (minus redacted credentials).
 */
export function OcppLogsScreen() {
  const [params, setParams] = useSearchParams();
  const chargePointId = params.get('cp');
  const action = params.get('action');
  const dir = params.get('dir') ?? 'All';
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: chargePoints = [] } = useChargePoints();
  const cpName = useMemo(() => new Map(chargePoints.map((cp) => [cp.id, cp])), [chargePoints]);

  const filters = {
    chargePointId,
    action,
    direction:
      dir === 'From charger' ? ('in' as const) : dir === 'To charger' ? ('out' as const) : null,
    errorsOnly: dir === 'Errors',
  };
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useOcppLog(filters);
  const rows = data?.pages.flat() ?? [];

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Toolbar
        filters={[...DIRECTION_FILTERS]}
        filter={dir}
        onFilterChange={(f) => setParam('dir', f)}
        extra={
          <>
            <select
              value={chargePointId ?? ''}
              onChange={(e) => setParam('cp', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">All chargers</option>
              {chargePoints.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name} · {cp.ocpp_identity}
                </option>
              ))}
            </select>
            <select
              value={action ?? ''}
              onChange={(e) => setParam('action', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">All actions</option>
              {COMMON_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '170px 200px 70px 1fr',
            gap: 12,
            padding: '12px 24px',
            background: C.seasalt,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11,
            fontWeight: 700,
            color: C.slate,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          <span>Time</span>
          <span>Charger</span>
          <span>Dir</span>
          <span>Message</span>
        </div>
        {rows.map((f) => (
          <FrameRow
            key={f.id}
            frame={f}
            charger={cpName.get(f.charge_point_id)}
            open={expanded.has(f.id)}
            onToggle={() => toggle(f.id)}
          />
        ))}
        {!isLoading && rows.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No frames match.
          </div>
        )}
        {hasNextPage && (
          <div style={{ padding: 14, textAlign: 'center', borderTop: `1px solid ${C.divider}` }}>
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.green,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 700,
                cursor: isFetchingNextPage ? 'wait' : 'pointer',
              }}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load older frames'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FrameRow({
  frame,
  charger,
  open,
  onToggle,
}: {
  frame: OcppMessage;
  charger?: { id: string; name: string; ocpp_identity: string };
  open: boolean;
  onToggle: () => void;
}) {
  const isError = frame.message_type === 4;
  return (
    <div style={{ borderBottom: `1px solid ${C.divider}` }}>
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '170px 200px 70px 1fr',
          gap: 12,
          padding: '9px 24px',
          fontSize: 12,
          cursor: 'pointer',
          alignItems: 'center',
        }}
      >
        <span style={{ color: C.slate, whiteSpace: 'nowrap' }}>
          {formatDateTime(frame.recorded_at)}
        </span>
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {charger ? (
            <Link
              to={`/charge-points/${charger.id}`}
              style={{ color: C.green, fontWeight: 600, textDecoration: 'none' }}
            >
              {charger.name}
            </Link>
          ) : (
            <span style={{ color: C.slate }}>—</span>
          )}
        </span>
        <span style={{ fontWeight: 700, color: frame.direction === 'in' ? C.info : C.green }}>
          {frame.direction === 'in' ? '→ in' : '← out'}
        </span>
        <span style={{ display: 'flex', gap: 12, minWidth: 0, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: isError ? C.error : C.ink, whiteSpace: 'nowrap' }}>
            {frame.action ?? (isError ? 'Error' : frame.message_type === 3 ? 'Result' : '—')}
            {isError && frame.error_code ? ` · ${frame.error_code}` : ''}
          </span>
          {!open && (
            <span
              style={{
                color: C.slate,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
                fontSize: 11,
              }}
            >
              {JSON.stringify(frame.payload ?? {})}
            </span>
          )}
        </span>
      </div>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: '4px 24px 14px 24px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: C.ink,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: C.seasalt,
          }}
        >
          {frame.ocpp_message_id
            ? `# ${frame.ocpp_message_id}${frame.error_description ? ` · ${frame.error_description}` : ''}\n`
            : ''}
          {JSON.stringify(frame.payload ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}
