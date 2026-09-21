// The cost engine: (session facts, tariff snapshot) → itemised cost.
//
// Pure and dependency-free so the gateway (at StopTransaction), the admin
// app (price preview), and the receipt renderer all price from one place and
// can never disagree. Property- and golden-tested in engine.test.ts.
//
// Semantics follow OCPI 2.2.1 tariffs (ADR-0006):
//  - a session is a list of charging periods; each period is evaluated
//    against the elements in order, and the FIRST element whose restrictions
//    match supplies the price component for each dimension;
//  - FLAT is charged once, by the first element that offers it and matches;
//  - step_size rounds the consumed volume of each price component UP to the
//    next multiple (Wh for ENERGY, seconds for TIME / PARKING_TIME);
//  - min_price / max_price cap the subtotal.
// Our extension: restrictions.grace_period_s delays PARKING_TIME billing.

import { bps, exclFromIncl, roundSen, type Sen } from './money';
import type {
  DayOfWeek,
  PriceComponent,
  TariffDimension,
  TariffElement,
  TariffSnapshot,
} from './tariff';

/** One slice of a session as the gateway records it (≈ OCPI ChargingPeriod). */
export interface ChargingPeriod {
  /** ISO timestamps; end is exclusive. */
  start: string;
  end: string;
  /** Energy delivered during this period, in Wh. */
  energyWh: number;
  /** True while the EV drew power; false once it went idle (Finishing/SuspendedEV). */
  charging: boolean;
}

export interface CostLine {
  dimension: TariffDimension;
  /** Index of the tariff element that priced this line — for the receipt footer. */
  elementIndex: number;
  /** Consumed volume after step rounding: Wh, seconds, or 1 for FLAT. */
  volume: number;
  unit: 'Wh' | 's' | 'session';
  unitPriceSen: Sen;
  /** Human label, e.g. "Energy 18.400 kWh @ RM 1.20/kWh". */
  label: string;
  amountExclSen: Sen;
  taxSen: Sen;
  amountInclSen: Sen;
}

export interface CostBreakdown {
  currency: string;
  lines: CostLine[];
  totalEnergyWh: number;
  totalTimeS: number;
  totalParkingTimeS: number;
  totalEnergyCostSen: Sen;
  totalTimeCostSen: Sen;
  totalParkingCostSen: Sen;
  totalFixedCostSen: Sen;
  /** Sum of line amounts excluding tax, after caps. */
  subtotalSen: Sen;
  taxRateBps: number;
  taxSen: Sen;
  totalSen: Sen;
  /** Set when min_price or max_price changed the subtotal. */
  capApplied: 'min' | 'max' | null;
}

// ── Time helpers (no Intl dependency beyond what every runtime ships) ────────

interface LocalClock {
  minutesOfDay: number;
  dayOfWeek: DayOfWeek;
  isoDate: string;
}

const DOW = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

// Intl.DateTimeFormat construction dominates the engine's cost; one
// formatter per zone makes pricing a session tens of times cheaper.
const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = clockFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    clockFormatters.set(timeZone, f);
  }
  return f;
}

function localClock(at: Date, timeZone: string): LocalClock {
  const parts = formatterFor(timeZone).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekday = get('weekday');
  const dow = DOW[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)] ?? 'MONDAY';
  return {
    minutesOfDay: hour * 60 + minute,
    dayOfWeek: dow,
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** True when `minutes` falls inside [start, end), handling windows that cross midnight. */
function inWindow(minutes: number, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  const s = start ? toMinutes(start) : 0;
  const e = end ? toMinutes(end) : 24 * 60;
  if (s <= e) return minutes >= s && minutes < e;
  return minutes >= s || minutes < e; // e.g. 22:00–06:00
}

/**
 * Splits a period at every local time-of-day boundary any element restricts
 * on, so a session crossing 14:00 pays the peak rate only after 14:00.
 * Energy is apportioned linearly across the split — the best available
 * estimate without a meter sample at the boundary.
 */
function splitAtBoundaries(
  period: ChargingPeriod,
  boundaries: number[],
  timeZone: string,
): ChargingPeriod[] {
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  if (end <= start || boundaries.length === 0) return [period];

  const cuts: number[] = [];
  // Walk minute by minute would be wasteful; instead find each boundary's next
  // occurrence after `start` within the period by scanning at most 2 days of
  // candidates (sessions longer than that are split at each day's boundary).
  for (let dayOffset = -1; dayOffset <= Math.ceil((end - start) / 86_400_000) + 1; dayOffset += 1) {
    for (const b of boundaries) {
      // Build a candidate: the local date of (start + dayOffset days) at minute b.
      const probe = new Date(start + dayOffset * 86_400_000);
      const clock = localClock(probe, timeZone);
      const delta = (b - clock.minutesOfDay) * 60_000;
      const candidate = probe.getTime() + delta;
      if (candidate > start && candidate < end) cuts.push(candidate);
    }
  }
  const unique = [...new Set(cuts)].sort((a, b) => a - b);
  if (unique.length === 0) return [period];

  const total = end - start;
  const out: ChargingPeriod[] = [];
  let cursor = start;
  for (const cut of [...unique, end]) {
    if (cut <= cursor) continue;
    out.push({
      start: new Date(cursor).toISOString(),
      end: new Date(cut).toISOString(),
      energyWh: (period.energyWh * (cut - cursor)) / total,
      charging: period.charging,
    });
    cursor = cut;
  }
  return out;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

interface Running {
  cumulativeWh: number;
  cumulativeS: number;
  idleS: number;
}

function restrictionsMatch(
  el: TariffElement,
  at: Date,
  period: ChargingPeriod,
  running: Running,
  timeZone: string,
): boolean {
  const r = el.restrictions;
  if (!r) return true;
  const clock = localClock(at, timeZone);
  if (!inWindow(clock.minutesOfDay, r.start_time, r.end_time)) return false;
  if (r.start_date && clock.isoDate < r.start_date) return false;
  if (r.end_date && clock.isoDate >= r.end_date) return false;
  if (r.day_of_week && r.day_of_week.length > 0 && !r.day_of_week.includes(clock.dayOfWeek))
    return false;
  const kwh = running.cumulativeWh / 1000;
  if (r.min_kwh !== undefined && kwh < r.min_kwh) return false;
  if (r.max_kwh !== undefined && kwh >= r.max_kwh) return false;
  if (r.min_duration_s !== undefined && running.cumulativeS < r.min_duration_s) return false;
  if (r.max_duration_s !== undefined && running.cumulativeS >= r.max_duration_s) return false;
  const seconds = (new Date(period.end).getTime() - new Date(period.start).getTime()) / 1000;
  const powerKw = seconds > 0 ? period.energyWh / 1000 / (seconds / 3600) : 0;
  if (r.min_power_kw !== undefined && period.charging && powerKw < r.min_power_kw) return false;
  if (r.max_power_kw !== undefined && period.charging && powerKw >= r.max_power_kw) return false;
  return true;
}

function stepUp(volume: number, step: number): number {
  if (volume <= 0) return 0;
  return Math.ceil(volume / step) * step;
}

interface Bucket {
  component: PriceComponent;
  elementIndex: number;
  volume: number;
}

/** Prices a session. Periods must be in order and non-overlapping. */
export function priceSession(periods: ChargingPeriod[], tariff: TariffSnapshot): CostBreakdown {
  const timeZone = tariff.timezone ?? 'Asia/Kuala_Lumpur';
  const boundaries = [
    ...new Set(
      tariff.elements.flatMap((el) =>
        [el.restrictions?.start_time, el.restrictions?.end_time]
          .filter(Boolean)
          .map((t) => toMinutes(t!)),
      ),
    ),
  ];

  const running: Running = { cumulativeWh: 0, cumulativeS: 0, idleS: 0 };
  const buckets = new Map<string, Bucket>();
  let flatCharged: Bucket | null = null;
  let totalEnergyWh = 0;
  let totalTimeS = 0;
  let totalParkingS = 0;

  const bucketFor = (dim: TariffDimension, idx: number, component: PriceComponent) => {
    const key = `${dim}:${idx}`;
    let b = buckets.get(key);
    if (!b) {
      b = { component, elementIndex: idx, volume: 0 };
      buckets.set(key, b);
    }
    return b;
  };

  for (const raw of periods) {
    for (const p of splitAtBoundaries(raw, boundaries, timeZone)) {
      const at = new Date(p.start);
      const seconds = Math.max(0, (new Date(p.end).getTime() - at.getTime()) / 1000);
      totalEnergyWh += p.energyWh;
      if (p.charging) totalTimeS += seconds;
      else totalParkingS += seconds;

      const claimed = new Set<TariffDimension>();
      tariff.elements.forEach((el, idx) => {
        if (!restrictionsMatch(el, at, p, running, timeZone)) return;
        for (const c of el.price_components) {
          if (claimed.has(c.type)) continue;
          switch (c.type) {
            case 'FLAT':
              if (!flatCharged) flatCharged = { component: c, elementIndex: idx, volume: 1 };
              claimed.add('FLAT');
              break;
            case 'ENERGY':
              if (p.energyWh > 0) bucketFor('ENERGY', idx, c).volume += p.energyWh;
              claimed.add('ENERGY');
              break;
            case 'TIME':
              if (p.charging && seconds > 0) bucketFor('TIME', idx, c).volume += seconds;
              claimed.add('TIME');
              break;
            case 'PARKING_TIME': {
              if (!p.charging && seconds > 0) {
                const grace = el.restrictions?.grace_period_s ?? 0;
                // Only the idle time beyond the grace window is billable.
                const before = running.idleS;
                const after = before + seconds;
                const billable = Math.max(0, after - Math.max(before, grace));
                if (billable > 0) bucketFor('PARKING_TIME', idx, c).volume += billable;
              }
              claimed.add('PARKING_TIME');
              break;
            }
          }
        }
      });

      running.cumulativeWh += p.energyWh;
      running.cumulativeS += seconds;
      if (!p.charging) running.idleS += seconds;
    }
  }

  const rate = tariff.tax_rate_bps ?? 0;
  const lines: CostLine[] = [];
  const toLine = (b: Bucket): CostLine => {
    const c = b.component;
    let volume: number;
    let unit: CostLine['unit'];
    let gross: Sen;
    let label: string;
    switch (c.type) {
      case 'ENERGY': {
        volume = stepUp(b.volume, c.step_size);
        unit = 'Wh';
        gross = roundSen((volume / 1000) * c.price_sen);
        label = `Energy ${(volume / 1000).toFixed(3)} kWh @ ${fmt(c.price_sen)}/kWh`;
        break;
      }
      case 'TIME': {
        volume = stepUp(b.volume, c.step_size);
        unit = 's';
        gross = roundSen((volume / 3600) * c.price_sen);
        label = `Charging time ${fmtDuration(volume)} @ ${fmt(c.price_sen)}/h`;
        break;
      }
      case 'PARKING_TIME': {
        volume = stepUp(b.volume, c.step_size);
        unit = 's';
        gross = roundSen((volume / 3600) * c.price_sen);
        label = `Idle time ${fmtDuration(volume)} @ ${fmt(c.price_sen)}/h`;
        break;
      }
      default: {
        volume = 1;
        unit = 'session';
        gross = c.price_sen;
        label = `Session fee`;
      }
    }
    // Tariff prices are either inclusive or exclusive of tax; store both.
    const excl = tariff.tax_included ? exclFromIncl(gross, rate) : gross;
    const tax = tariff.tax_included ? gross - excl : bps(excl, rate);
    return {
      dimension: c.type,
      elementIndex: b.elementIndex,
      volume,
      unit,
      unitPriceSen: c.price_sen,
      label,
      amountExclSen: excl,
      taxSen: tax,
      amountInclSen: excl + tax,
    };
  };

  if (flatCharged) lines.push(toLine(flatCharged));
  for (const dim of ['ENERGY', 'TIME', 'PARKING_TIME'] as const) {
    for (const b of buckets.values())
      if (b.component.type === dim && b.volume > 0) lines.push(toLine(b));
  }

  let subtotal = lines.reduce((s, l) => s + l.amountExclSen, 0);
  let capApplied: CostBreakdown['capApplied'] = null;
  const capExcl = (sen: number | null | undefined) =>
    sen == null ? null : tariff.tax_included ? exclFromIncl(sen, rate) : sen;
  const minExcl = capExcl(tariff.min_price_sen);
  const maxExcl = capExcl(tariff.max_price_sen);
  if (minExcl !== null && subtotal < minExcl) {
    lines.push(adjustment('Minimum charge', minExcl - subtotal, rate));
    subtotal = minExcl;
    capApplied = 'min';
  } else if (maxExcl !== null && subtotal > maxExcl) {
    lines.push(adjustment('Price cap', maxExcl - subtotal, rate));
    subtotal = maxExcl;
    capApplied = 'max';
  }

  const tax = lines.reduce((s, l) => s + l.taxSen, 0);
  const sum = (dim: TariffDimension) =>
    lines.filter((l) => l.dimension === dim).reduce((s, l) => s + l.amountExclSen, 0);

  return {
    currency: tariff.currency ?? 'MYR',
    lines,
    totalEnergyWh: Math.round(totalEnergyWh),
    totalTimeS: Math.round(totalTimeS),
    totalParkingTimeS: Math.round(totalParkingS),
    totalEnergyCostSen: sum('ENERGY'),
    totalTimeCostSen: sum('TIME'),
    totalParkingCostSen: sum('PARKING_TIME'),
    totalFixedCostSen: sum('FLAT'),
    subtotalSen: subtotal,
    taxRateBps: rate,
    taxSen: tax,
    totalSen: subtotal + tax,
    capApplied,
  };
}

function adjustment(label: string, amountExcl: Sen, rate: number): CostLine {
  const tax = bps(amountExcl, rate);
  return {
    dimension: 'FLAT',
    elementIndex: -1,
    volume: 1,
    unit: 'session',
    unitPriceSen: amountExcl,
    label,
    amountExclSen: amountExcl,
    taxSen: tax,
    amountInclSen: amountExcl + tax,
  };
}

const fmt = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;
const fmtDuration = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/**
 * Builds charging periods from a session's status timeline and meter samples.
 * The gateway calls this at StopTransaction; the preview builds synthetic ones.
 *
 * With samples, each consecutive pair becomes one period; a pair that
 * straddles `chargingEndedAt` is split there (all of its energy goes to the
 * charging half — a meter register does not move while idle). Whatever the
 * samples do not cover up to `endedAt` is appended once. Without samples the
 * session is two periods at most: charging, then idle.
 */
export function periodsFromSession(input: {
  startedAt: string;
  endedAt: string;
  /** Moment charging stopped for good; null = charged until the end. */
  chargingEndedAt: string | null;
  totalEnergyWh: number;
  /** Optional cumulative register samples (Wh) for accurate ToU apportioning. */
  samples?: { at: string; energyWh: number }[];
}): ChargingPeriod[] {
  const startMs = new Date(input.startedAt).getTime();
  const endMs = new Date(input.endedAt).getTime();
  const chargeEndMs = Math.min(
    endMs,
    Math.max(startMs, input.chargingEndedAt ? new Date(input.chargingEndedAt).getTime() : endMs),
  );
  const iso = (ms: number) => new Date(ms).toISOString();
  const periods: ChargingPeriod[] = [];
  const push = (from: number, to: number, energyWh: number, charging: boolean) => {
    if (to > from) periods.push({ start: iso(from), end: iso(to), energyWh, charging });
  };

  const samples = (input.samples ?? [])
    .map((s) => ({ ms: new Date(s.at).getTime(), wh: s.energyWh }))
    .filter((s) => s.ms >= startMs && s.ms <= endMs)
    .sort((a, b) => a.ms - b.ms);

  if (samples.length > 1) {
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      const delta = Math.max(0, b.wh - a.wh);
      if (b.ms <= chargeEndMs) push(a.ms, b.ms, delta, true);
      else if (a.ms >= chargeEndMs) push(a.ms, b.ms, 0, false);
      else {
        push(a.ms, chargeEndMs, delta, true);
        push(chargeEndMs, b.ms, 0, false);
      }
    }
    const last = samples[samples.length - 1].ms;
    if (last < chargeEndMs) {
      push(last, chargeEndMs, 0, true);
      push(chargeEndMs, endMs, 0, false);
    } else {
      push(last, endMs, 0, false);
    }
    return periods;
  }

  push(startMs, chargeEndMs, input.totalEnergyWh, true);
  push(chargeEndMs, endMs, 0, false);
  return periods;
}
