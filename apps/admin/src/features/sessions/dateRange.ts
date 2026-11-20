// The sessions report is read and downloaded a window at a time. The database
// refuses more than 45 days per request (admin_list_sessions); these helpers
// keep the date inputs inside that window so the operator never hits the refusal.

/** Most days one view or download may span, both ends included. */
export const MAX_RANGE_DAYS = 45;
/** What a screen opens on. */
const DEFAULT_RANGE_DAYS = 30;

const DAY_MS = 86_400_000;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(`${s}T00:00:00`);

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return iso(d);
}

export function todayLocal(): string {
  return iso(new Date());
}

export interface DateRange {
  from: string;
  to: string;
}

/** The last 30 days, ending today. */
export function defaultRange(): DateRange {
  const to = todayLocal();
  return { from: addDays(to, -(DEFAULT_RANGE_DAYS - 1)), to };
}

export function rangeDays(r: DateRange): number {
  return Math.round((parse(r.to).getTime() - parse(r.from).getTime()) / DAY_MS) + 1;
}

/**
 * Applies one edited end of the range and drags the other end along if the
 * span would pass 45 days (or the ends would cross).
 */
export function withEdit(range: DateRange, edited: 'from' | 'to', value: string): DateRange {
  if (!value) return range;
  let from = edited === 'from' ? value : range.from;
  let to = edited === 'to' ? value : range.to;
  if (edited === 'from') {
    if (to < from) to = from;
    if (rangeDays({ from, to }) > MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS - 1);
  } else {
    if (from > to) from = to;
    if (rangeDays({ from, to }) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  }
  return { from, to };
}

/** A range from the URL, repaired if someone typed something out of bounds. */
export function sanitiseRange(from: string | null, to: string | null): DateRange {
  const ok = (s: string | null): s is string =>
    !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());
  const fallback = defaultRange();
  if (!ok(from) && !ok(to)) return fallback;
  if (ok(from) && !ok(to)) return withEdit({ from, to: from }, 'to', addDays(from, 29));
  if (!ok(from) && ok(to)) return { from: addDays(to, -29), to };
  return withEdit({ from: from as string, to: from as string }, 'to', to as string);
}
