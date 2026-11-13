import { useEffect, useState } from 'react';
import { C } from '@voltara/ui';
import { parseCoordinates } from '@voltara/shared';
import { searchPlaces, type PlaceResult } from './geocode';

/**
 * Find a place by name, or paste a Google Maps link / "lat, lng" pair. A
 * picked place hands back its address and pin; pasted coordinates only move
 * the pin. Results come as the operator types, debounced.
 */
export function PlaceSearch({
  onPick,
  onCoordinates,
}: {
  onPick: (place: PlaceResult) => void;
  onCoordinates: (lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const pasted = parseCoordinates(query);
  const looksLikeLink = /^https?:\/\//i.test(query.trim());

  useEffect(() => {
    const q = query.trim();
    setError(null);
    if (q.length < 3 || pasted || looksLikeLink) {
      setResults(null);
      setSearching(false);
      return;
    }
    const abort = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(q, abort.signal)
        .then((r) => setResults(r))
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
    // `pasted` is derived from `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const clear = () => {
    setQuery('');
    setResults(null);
  };

  const row: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '9px 12px',
    border: 'none',
    borderBottom: `1px solid ${C.divider}`,
    background: C.white,
    fontFamily: 'Figtree',
    cursor: 'pointer',
  };
  const note: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: C.slate };

  const showPanel = pasted || looksLikeLink || searching || error || results !== null;

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, or paste a Google Maps link or coordinates…"
          style={{
            width: '100%',
            padding: '9px 14px 9px 34px',
            borderRadius: 99,
            border: `1px solid ${C.border}`,
            fontFamily: 'Figtree',
            fontSize: 13,
            outline: 'none',
            background: C.white,
            boxSizing: 'border-box',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: C.slate,
          }}
        >
          ⌕
        </span>
      </div>

      {showPanel && (
        <div
          style={{
            marginTop: 6,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            overflow: 'hidden',
            background: C.white,
          }}
        >
          {pasted && (
            <button
              style={{ ...row, borderBottom: 'none' }}
              onClick={() => {
                onCoordinates(pasted.lat, pasted.lng);
                clear();
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>
                Use these coordinates
              </span>
              <span style={{ fontSize: 12, color: C.slate }}>
                {' '}
                · {pasted.lat}, {pasted.lng}
              </span>
            </button>
          )}
          {!pasted && looksLikeLink && (
            <div style={note}>
              No coordinates in that link. Short share links don't carry them — open the place in
              Google Maps, right-click the pin, copy the coordinates and paste them here.
            </div>
          )}
          {searching && !results && <div style={note}>Searching…</div>}
          {error && <div style={{ ...note, color: C.error }}>{error}</div>}
          {results?.length === 0 && !searching && (
            <div style={note}>
              No places found. Try the building or road name, or paste coordinates.
            </div>
          )}
          {results?.map((r) => (
            <button
              key={r.id}
              style={row}
              onClick={() => {
                onPick(r);
                clear();
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
              onMouseLeave={(e) => (e.currentTarget.style.background = C.white)}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{r.name}</div>
              {r.detail && <div style={{ fontSize: 12, color: C.slate }}>{r.detail}</div>}
            </button>
          ))}
          {results && results.length > 0 && (
            <div style={{ ...note, fontSize: 11 }}>Place data © OpenStreetMap contributors</div>
          )}
        </div>
      )}
    </div>
  );
}
