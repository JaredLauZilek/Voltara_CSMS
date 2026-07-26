import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../tokens';

export interface SelectOption {
  value: string;
  label: string;
  meta?: string; // secondary label shown dimmer (e.g. customer type, supplier category)
  group?: string; // group header label (e.g. "Products" / "Services")
}

interface Props {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  nullable?: boolean; // show a "clear" option at the top
  nullLabel?: string; // label for the null option
  disabled?: boolean;
  style?: React.CSSProperties;
  // When true, render meta on a second line below the label instead of
  // crammed onto the right edge. Bumps row height to fit it. Use for options
  // with long meta strings (e.g. customer addresses) that ellipsize too hard
  // in the default single-line layout.
  metaBelow?: boolean;
}

const ITEM_H_DEFAULT = 40;
const ITEM_H_STACKED = 60;
const MAX_H = 320;
const SEARCH_H = 52;
const BUFFER = 4;

type FlatEntry =
  | { kind: 'null'; label: string }
  | { kind: 'group'; label: string }
  | { kind: 'option'; value: string; label: string; meta?: string };

function buildEntries(
  options: SelectOption[],
  query: string,
  nullable: boolean,
  nullLabel: string,
): FlatEntry[] {
  const q = query.toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || (o.meta?.toLowerCase().includes(q) ?? false),
      )
    : options;

  const ungrouped: SelectOption[] = [];
  const groups = new Map<string, SelectOption[]>();
  for (const o of filtered) {
    if (o.group) {
      const arr = groups.get(o.group) ?? [];
      arr.push(o);
      groups.set(o.group, arr);
    } else {
      ungrouped.push(o);
    }
  }

  const result: FlatEntry[] = [];
  if (nullable) result.push({ kind: 'null', label: nullLabel });
  for (const o of ungrouped)
    result.push({ kind: 'option', value: o.value, label: o.label, meta: o.meta });
  for (const [g, items] of groups) {
    result.push({ kind: 'group', label: g });
    for (const o of items)
      result.push({ kind: 'option', value: o.value, label: o.label, meta: o.meta });
  }
  return result;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const i = lower.indexOf(ql);
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <strong style={{ color: C.green, fontWeight: 700 }}>{text.slice(i, i + ql.length)}</strong>
      {text.slice(i + ql.length)}
    </>
  );
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  nullable = false,
  nullLabel = '— None —',
  disabled = false,
  style,
  metaBelow = false,
}: Props) {
  const ITEM_H = metaBelow ? ITEM_H_STACKED : ITEM_H_DEFAULT;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [hovered, setHovered] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const portalAttr = useRef(`ss-${Math.random().toString(36).slice(2, 9)}`).current;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const entries = useMemo(
    () => buildEntries(options, query, nullable, nullLabel),
    [options, query, nullable, nullLabel],
  );

  const selectableIdx = useMemo(
    () => entries.reduce<number[]>((a, e, i) => (e.kind !== 'group' ? [...a, i] : a), []),
    [entries],
  );

  const openDrop = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const dropH = Math.min(entries.length * ITEM_H, MAX_H) + SEARCH_H;
    const below = window.innerHeight - r.bottom - 6;
    const above = r.top - 6;
    const flip = below < dropH && above > below;
    setPos({ top: flip ? r.top - dropH - 2 : r.bottom + 2, left: r.left, width: r.width });
    setOpen(true);
    setQuery('');
    setScrollTop(0);
    setHovered(-1);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  // Close on outside click or page scroll
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const portal = document.querySelector(`[data-ss="${portalAttr}"]`);
      if (triggerRef.current?.contains(e.target as Node) || portal?.contains(e.target as Node))
        return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      const portal = document.querySelector(`[data-ss="${portalAttr}"]`);
      if (portal?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, portalAttr]);

  const select = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const scrollToIdx = (idx: number) => {
    const el = listRef.current;
    if (!el) return;
    const top = idx * ITEM_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ITEM_H > el.scrollTop + el.clientHeight)
      el.scrollTop = top + ITEM_H - el.clientHeight;
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = selectableIdx.find((i) => i > hovered) ?? selectableIdx[0] ?? -1;
      setHovered(next);
      scrollToIdx(next);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev =
        [...selectableIdx].reverse().find((i) => i < hovered) ??
        selectableIdx[selectableIdx.length - 1] ??
        -1;
      setHovered(prev);
      scrollToIdx(prev);
    }
    if (e.key === 'Enter' && hovered >= 0) {
      const en = entries[hovered];
      if (en.kind === 'null') select(null);
      else if (en.kind === 'option') select(en.value);
    }
  };

  // Virtual list slice
  const totalH = entries.length * ITEM_H;
  const viewH = Math.min(totalH, MAX_H) || 48;
  const start = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
  const end = Math.min(entries.length, start + Math.ceil(MAX_H / ITEM_H) + BUFFER * 2);

  const triggerSt: React.CSSProperties = {
    width: '100%',
    padding: '9px 32px 9px 12px',
    borderRadius: 10,
    border: `1px solid ${open ? C.green : C.border}`,
    fontFamily: 'Figtree',
    fontSize: 13,
    outline: 'none',
    background: disabled ? C.seasalt : C.white,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textAlign: 'left',
    color: selected || (nullable && value === null) ? '#1a1a1a' : C.slate,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    transition: 'border-color 120ms',
    ...style,
  };

  const displayLabel = (() => {
    if (nullable && value === null) return nullLabel;
    if (selected) return selected.label;
    return null;
  })();

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDrop())}
        style={triggerSt}
      >
        {displayLabel ? (
          <span>
            {displayLabel}
            {selected?.meta && (
              <span style={{ color: C.slate, marginLeft: 6, fontSize: 11, fontWeight: 500 }}>
                ({selected.meta})
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: C.slate, fontStyle: 'normal' }}>{placeholder}</span>
        )}
      </button>
      {/* Chevron */}
      <span
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          pointerEvents: 'none',
          color: C.slate,
          fontSize: 10,
          transition: 'transform 150ms',
          lineHeight: 1,
        }}
      >
        ▼
      </span>

      {open &&
        createPortal(
          <div
            data-ss={portalAttr}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 99999,
              background: C.white,
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              boxShadow: '0 8px 32px rgba(0,0,0,.14)',
              overflow: 'hidden',
            }}
          >
            {/* Search bar */}
            <div
              style={{
                padding: '8px 10px',
                borderBottom: `1px solid ${C.divider}`,
                background: C.white,
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 10,
                    color: C.slate,
                    pointerEvents: 'none',
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ⌕
                </span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setScrollTop(0);
                    setHovered(-1);
                    if (listRef.current) listRef.current.scrollTop = 0;
                  }}
                  onKeyDown={handleKey}
                  placeholder="Search…"
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 30px',
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    fontFamily: 'Figtree',
                    fontSize: 13,
                    outline: 'none',
                    background: C.seasalt,
                    color: '#1a1a1a',
                  }}
                />
              </div>
            </div>

            {/* Virtual list */}
            <div
              ref={listRef}
              style={{ height: viewH, overflowY: 'auto' }}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              {entries.length === 0 ? (
                <div
                  style={{
                    padding: '12px 14px',
                    color: C.slate,
                    fontSize: 13,
                    fontStyle: 'italic',
                  }}
                >
                  No results
                </div>
              ) : (
                <div style={{ height: totalH, position: 'relative' }}>
                  {entries.slice(start, end).map((en, i) => {
                    const abs = start + i;
                    const top = abs * ITEM_H;

                    if (en.kind === 'group') {
                      return (
                        <div
                          key={`g-${abs}-${en.label}`}
                          style={{
                            position: 'absolute',
                            top,
                            left: 0,
                            right: 0,
                            height: ITEM_H,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 14px',
                            fontSize: 10,
                            fontWeight: 700,
                            color: C.slate,
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            background: C.seasalt,
                            borderBottom: `1px solid ${C.divider}`,
                          }}
                        >
                          {en.label}
                        </div>
                      );
                    }

                    const isNull = en.kind === 'null';
                    const isSel = isNull
                      ? value === null
                      : en.kind === 'option' && en.value === value;
                    const isHov = abs === hovered;
                    const meta = en.kind === 'option' ? en.meta : undefined;

                    return (
                      <div
                        key={isNull ? '__null__' : `o-${(en as { value: string }).value}`}
                        onClick={() =>
                          isNull ? select(null) : select((en as { value: string }).value)
                        }
                        onMouseEnter={() => setHovered(abs)}
                        style={{
                          position: 'absolute',
                          top,
                          left: 0,
                          right: 0,
                          height: ITEM_H,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: metaBelow ? '6px 14px' : '0 14px',
                          cursor: 'pointer',
                          background: isSel ? C.honeydew : isHov ? C.seasalt : 'transparent',
                          borderBottom: `1px solid ${C.divider}`,
                        }}
                      >
                        {metaBelow && meta && !isNull ? (
                          // Stacked layout: label on top, meta below — used when meta
                          // strings are long (e.g. customer addresses).
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: isSel ? 700 : 600,
                                color: isSel ? C.green : '#1a1a1a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Highlight text={en.label} q={query} />
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: C.slate,
                                lineHeight: 1.35,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              <Highlight text={meta} q={query} />
                            </span>
                          </div>
                        ) : (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: isSel ? 700 : 500,
                              color: isSel ? C.green : isNull ? C.slate : '#1a1a1a',
                              fontStyle: isNull ? 'italic' : 'normal',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <Highlight text={en.label} q={query} />
                          </span>
                        )}
                        {!metaBelow && meta && (
                          <span
                            style={{
                              fontSize: 11,
                              color: C.slate,
                              flexShrink: 0,
                              marginLeft: 8,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Highlight text={meta} q={query} />
                          </span>
                        )}
                        {isSel && !isNull && (
                          <span
                            style={{
                              color: C.green,
                              fontSize: 12,
                              marginLeft: 8,
                              flexShrink: 0,
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
