// Formatting helpers shared by admin, driver app, and PDFs/receipts.
// Ported from the accounting dashboard (en-GB dates, RM currency, middot separators).

export function formatRM(value: number, fractionDigits = 0): string {
  return `RM ${value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function formatRMShort(value: number): string {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(1)}k`;
  return formatRM(value);
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${formatDate(d)} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO month key like '2026-05'. */
export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Short month label like 'May' for chart axes. */
export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
};

/** '7.2 kWh' / '43.1 kWh' from watt-hours. */
export function formatKwh(wh: number | null | undefined, fractionDigits = 1): string {
  if (wh == null) return '—';
  return `${(wh / 1000).toFixed(fractionDigits)} kWh`;
}

/** '7.4 kW' from watts. */
export function formatKw(w: number | null | undefined, fractionDigits = 1): string {
  if (w == null) return '—';
  return `${(w / 1000).toFixed(fractionDigits)} kW`;
}

/** '1h 24m' / '12m' / '45s' from a duration in seconds. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}
