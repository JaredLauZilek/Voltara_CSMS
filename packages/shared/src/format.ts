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

/**
 * The letter a connector is known by on screen: OCPP connectorId 1 → 'A',
 * 2 → 'B' … 27 → 'AA'. The wire and the database keep the number; only
 * people see the letter (it should match the label on the unit).
 */
export function gunLetter(connectorId: number): string {
  let n = connectorId;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || '—';
}

/** 'Gun A' for connector 1; 'Charger' for connector 0, which OCPP uses for the whole unit. */
export function formatGun(connectorId: number | null | undefined): string {
  if (connectorId == null) return '—';
  return connectorId === 0 ? 'Charger' : `Gun ${gunLetter(connectorId)}`;
}
