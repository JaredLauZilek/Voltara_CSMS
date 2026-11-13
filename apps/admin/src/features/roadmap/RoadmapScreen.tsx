import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { C, Toolbar } from '@voltara/ui';
import { formatDate } from '@voltara/shared';
import { useRoadmap, useSaveRoadmap } from './hooks';
import { RoadmapItemModal } from './RoadmapItemModal';
import {
  PRIORITY_LABELS,
  ROADMAP_AREAS,
  ROADMAP_PRIORITIES,
  ROADMAP_STATUSES,
  STATUS_META,
  type RoadmapArea,
  type RoadmapItem,
  type RoadmapStatus,
} from './types';

const DONE_SHOWN = 12;
const today = () => new Date().toISOString().slice(0, 10);

/** Moving into Done stamps the date; moving out clears it. */
function withStatus(item: RoadmapItem, status: RoadmapStatus): RoadmapItem {
  if (item.status === status) return item;
  return { ...item, status, doneAt: status === 'done' ? today() : null };
}

/**
 * The product roadmap as a Now / Next / Later / Done board. Dev-only, and
 * stored in docs/product-roadmap.json, so every edit here is a change to a
 * file in the repo (commit it like any other). Add with the box at the top of
 * a column, drag a card to another column or use its arrows, click a card to
 * edit. Area and search live in the URL.
 */
export function RoadmapScreen() {
  const { data, isLoading, error } = useRoadmap();
  const save = useSaveRoadmap();
  const [params, setParams] = useSearchParams();
  const area = (ROADMAP_AREAS as readonly string[]).includes(params.get('area') ?? '')
    ? (params.get('area') as RoadmapArea)
    : null;
  const search = params.get('q') ?? '';
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<RoadmapStatus | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const editingItem = items.find((i) => i.id === editing) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!area || i.area === area) &&
        (!q || i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q)),
    );
  }, [items, area, search]);

  const column = (status: RoadmapStatus) => {
    const list = visible.filter((i) => i.status === status);
    return status === 'done'
      ? [...list].sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
      : [...list].sort(
          (a, b) => ROADMAP_PRIORITIES.indexOf(a.priority) - ROADMAP_PRIORITIES.indexOf(b.priority),
        );
  };

  const move = (id: string, status: RoadmapStatus) =>
    save.mutate(items.map((i) => (i.id === id ? withStatus(i, status) : i)));
  const add = (status: RoadmapStatus, title: string) =>
    save.mutate([
      {
        id: crypto.randomUUID().slice(0, 8),
        title,
        notes: '',
        area: area ?? 'Platform',
        status,
        priority: 'medium',
        doneAt: status === 'done' ? today() : null,
      },
      ...items,
    ]);

  if (isLoading) return null;
  if (error || !data) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        The roadmap file could not be loaded. It is served by the dev server — restart `pnpm dev`.
      </div>
    );
  }

  const count = (s: RoadmapStatus) => items.filter((i) => i.status === s).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toolbar
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search the roadmap…"
        extra={
          <>
            <select
              value={area ?? ''}
              onChange={(e) => setParam('area', e.target.value || null)}
              style={{
                padding: '7px 12px',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                fontFamily: 'Figtree',
                fontSize: 13,
                background: C.white,
                color: C.ink,
              }}
            >
              <option value="">All areas</option>
              {ROADMAP_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: C.slate, marginLeft: 'auto' }}>
              {count('now')} now · {count('next')} next · {count('later')} later · {count('done')}{' '}
              done · saved in docs/product-roadmap.json
            </span>
          </>
        }
      />

      {save.error && (
        <div
          style={{
            fontSize: 12,
            color: C.error,
            fontWeight: 600,
            padding: '10px 12px',
            background: C.errorBg,
            borderRadius: 8,
          }}
        >
          {(save.error as Error).message}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {ROADMAP_STATUSES.map((status) => {
          const list = column(status);
          const shown = status === 'done' && !showAllDone ? list.slice(0, DONE_SHOWN) : list;
          const isTarget = dropTarget === status && dragging !== null;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(status);
              }}
              onDragLeave={() => setDropTarget((t) => (t === status ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, status);
                setDragging(null);
                setDropTarget(null);
              }}
              style={{
                background: isTarget ? C.honeydew : C.white,
                border: `1px solid ${isTarget ? C.green : C.border}`,
                borderRadius: 16,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 4px' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.green }}>
                  {STATUS_META[status].label}
                </span>
                <span style={{ fontSize: 12, color: C.slate }}>
                  {list.length} · {STATUS_META[status].hint}
                </span>
              </div>

              <AddBox onAdd={(title) => add(status, title)} />

              {shown.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  dragging={dragging === item.id}
                  onOpen={() => setEditing(item.id)}
                  onMove={(s) => move(item.id, s)}
                  onDragStart={() => setDragging(item.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                />
              ))}

              {list.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: C.slate, fontSize: 13 }}>
                  Nothing here.
                </div>
              )}
              {status === 'done' && list.length > DONE_SHOWN && (
                <button
                  onClick={() => setShowAllDone((v) => !v)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: C.green,
                    fontFamily: 'Figtree',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 6,
                  }}
                >
                  {showAllDone ? 'Show recent only' : `Show all ${list.length} ▾`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editingItem && (
        <RoadmapItemModal
          key={editingItem.id}
          item={editingItem}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            // Use the stage picked in the editor; stamp or clear the done date.
            save.mutate(
              items.map((i) =>
                i.id === next.id ? { ...next, doneAt: withStatus(i, next.status).doneAt } : i,
              ),
            );
            setEditing(null);
          }}
          onDelete={(id) => {
            save.mutate(items.filter((i) => i.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Type a title, press Enter: the fastest way to capture an item. */
function AddBox({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && title.trim()) {
          onAdd(title.trim());
          setTitle('');
        }
      }}
      placeholder="+ Add an item, press Enter"
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: 10,
        border: `1px dashed ${C.border}`,
        fontFamily: 'Figtree',
        fontSize: 13,
        outline: 'none',
        background: C.seasalt,
        boxSizing: 'border-box',
      }}
    />
  );
}

function Card({
  item,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  item: RoadmapItem;
  dragging: boolean;
  onOpen: () => void;
  onMove: (status: RoadmapStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const at = ROADMAP_STATUSES.indexOf(item.status);
  const prev = ROADMAP_STATUSES[at - 1];
  const next = ROADMAP_STATUSES[at + 1];
  const done = item.status === 'done';

  const arrow: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: C.white,
    color: C.slate,
    fontFamily: 'Figtree',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{
        background: C.seasalt,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: 'pointer',
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: done ? C.slate : C.ink,
          lineHeight: 1.4,
        }}
      >
        {done && <span style={{ color: C.green }}>✓ </span>}
        {item.title}
      </div>
      {item.notes && (
        <div
          style={{
            fontSize: 12,
            color: C.slate,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.notes}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.slate,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {item.area}
          {done && item.doneAt
            ? ` · ${formatDate(item.doneAt)}`
            : item.priority !== 'medium'
              ? ` · ${PRIORITY_LABELS[item.priority]}`
              : ''}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {prev && (
            <button
              title={`Move to ${STATUS_META[prev].label}`}
              onClick={(e) => {
                e.stopPropagation();
                onMove(prev);
              }}
              style={arrow}
            >
              ‹
            </button>
          )}
          {next && (
            <button
              title={`Move to ${STATUS_META[next].label}`}
              onClick={(e) => {
                e.stopPropagation();
                onMove(next);
              }}
              style={arrow}
            >
              ›
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
