// Operator-facing tariff shapes ↔ OCPI elements. The editor works in presets;
// the data always keeps the general OCPI structure (ADR-0006). `detectPreset`
// recognises elements a preset produced so an existing version opens in the
// same simple form it was written with; anything else opens as "custom".

import { formatSen } from './money';
import { TARIFF_PRESETS, type TariffElement } from './tariff';

export const PRESET_KINDS = [
  'per_kwh',
  'per_kwh_idle',
  'per_minute',
  'peak_off_peak',
  'session_fee_kwh',
  'free',
  'custom',
] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];

export const PRESET_LABELS: Record<PresetKind, string> = {
  per_kwh: 'Per kWh',
  per_kwh_idle: 'Per kWh + idle fee',
  per_minute: 'Per minute',
  peak_off_peak: 'Peak / off-peak',
  session_fee_kwh: 'Session fee + per kWh',
  free: 'Free',
  custom: 'Custom (OCPI)',
};

export interface PresetParams {
  senPerKwh?: number;
  idleSenPerMinute?: number;
  graceMinutes?: number;
  senPerMinute?: number;
  peakSenPerKwh?: number;
  offPeakSenPerKwh?: number;
  peakStart?: string;
  peakEnd?: string;
  sessionFeeSen?: number;
}

export function buildElements(kind: PresetKind, p: PresetParams): TariffElement[] {
  switch (kind) {
    case 'per_kwh':
      return TARIFF_PRESETS.perKwh(p.senPerKwh ?? 0);
    case 'per_kwh_idle':
      return TARIFF_PRESETS.perKwhWithIdle(
        p.senPerKwh ?? 0,
        p.idleSenPerMinute ?? 0,
        p.graceMinutes ?? 0,
      );
    case 'per_minute':
      return TARIFF_PRESETS.perMinute(p.senPerMinute ?? 0);
    case 'peak_off_peak':
      return TARIFF_PRESETS.peakOffPeak(
        p.peakSenPerKwh ?? 0,
        p.offPeakSenPerKwh ?? 0,
        p.peakStart ?? '14:00',
        p.peakEnd ?? '22:00',
      );
    case 'session_fee_kwh':
      return TARIFF_PRESETS.sessionFeePlusKwh(p.sessionFeeSen ?? 0, p.senPerKwh ?? 0);
    case 'free':
      return TARIFF_PRESETS.free();
    default:
      return [];
  }
}

const only = (el: TariffElement, types: string[]) =>
  el.price_components.length === types.length &&
  el.price_components.every((c, i) => c.type === types[i]);
const noRestrictions = (el: TariffElement) =>
  !el.restrictions || Object.keys(el.restrictions).length === 0;

/** Recognises preset-shaped elements; anything else is 'custom'. */
export function detectPreset(elements: TariffElement[]): {
  kind: PresetKind;
  params: PresetParams;
} {
  const [a, b] = elements;
  if (elements.length === 1 && a && noRestrictions(a)) {
    if (only(a, ['ENERGY']))
      return { kind: 'per_kwh', params: { senPerKwh: a.price_components[0].price_sen } };
    if (only(a, ['TIME']) && a.price_components[0].step_size === 60) {
      return { kind: 'per_minute', params: { senPerMinute: a.price_components[0].price_sen / 60 } };
    }
    if (only(a, ['FLAT']) && a.price_components[0].price_sen === 0)
      return { kind: 'free', params: {} };
    if (only(a, ['FLAT', 'ENERGY'])) {
      return {
        kind: 'session_fee_kwh',
        params: {
          sessionFeeSen: a.price_components[0].price_sen,
          senPerKwh: a.price_components[1].price_sen,
        },
      };
    }
  }
  if (elements.length === 2 && a && b) {
    if (
      only(a, ['ENERGY']) &&
      noRestrictions(a) &&
      only(b, ['PARKING_TIME']) &&
      b.price_components[0].step_size === 60 &&
      b.restrictions &&
      Object.keys(b.restrictions).every((k) => k === 'grace_period_s')
    ) {
      return {
        kind: 'per_kwh_idle',
        params: {
          senPerKwh: a.price_components[0].price_sen,
          idleSenPerMinute: b.price_components[0].price_sen / 60,
          graceMinutes: (b.restrictions.grace_period_s ?? 0) / 60,
        },
      };
    }
    if (
      only(a, ['ENERGY']) &&
      a.restrictions?.start_time &&
      a.restrictions?.end_time &&
      Object.keys(a.restrictions).every((k) => k === 'start_time' || k === 'end_time') &&
      only(b, ['ENERGY']) &&
      noRestrictions(b)
    ) {
      return {
        kind: 'peak_off_peak',
        params: {
          peakSenPerKwh: a.price_components[0].price_sen,
          offPeakSenPerKwh: b.price_components[0].price_sen,
          peakStart: a.restrictions.start_time,
          peakEnd: a.restrictions.end_time,
        },
      };
    }
  }
  return { kind: 'custom', params: {} };
}

/** "RM 1.20/kWh · idle RM 1.00/min after 15 min" — what the driver reads. */
export function describeElements(elements: TariffElement[]): string {
  const { kind, params: p } = detectPreset(elements);
  const rm = (sen: number) => formatSen(sen);
  switch (kind) {
    case 'per_kwh':
      return `${rm(p.senPerKwh!)}/kWh`;
    case 'per_kwh_idle':
      return `${rm(p.senPerKwh!)}/kWh · idle ${rm(p.idleSenPerMinute!)}/min${p.graceMinutes ? ` after ${p.graceMinutes} min` : ''}`;
    case 'per_minute':
      return `${rm(p.senPerMinute!)}/min`;
    case 'peak_off_peak':
      return `${rm(p.peakSenPerKwh!)}/kWh ${p.peakStart}–${p.peakEnd} · ${rm(p.offPeakSenPerKwh!)}/kWh otherwise`;
    case 'session_fee_kwh':
      return `${rm(p.sessionFeeSen!)} per session + ${rm(p.senPerKwh!)}/kWh`;
    case 'free':
      return 'Free';
    default: {
      const parts = elements.flatMap((el) =>
        el.price_components.map((c) => {
          const unit = c.type === 'ENERGY' ? '/kWh' : c.type === 'FLAT' ? ' per session' : '/h';
          const label = c.type === 'PARKING_TIME' ? 'idle ' : c.type === 'TIME' ? 'time ' : '';
          const when = el.restrictions?.start_time
            ? ` ${el.restrictions.start_time}–${el.restrictions.end_time ?? ''}`
            : '';
          return `${label}${rm(c.price_sen)}${unit}${when}`;
        }),
      );
      return parts.join(' · ');
    }
  }
}
