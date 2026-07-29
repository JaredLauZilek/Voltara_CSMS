import { ocpp16 } from '@voltara/shared';
import type { MeterValueRow } from '../db/writers.js';

export interface ParsedSample {
  sampledAt: Date;
  measurand: string;
  phase: string | null;
  location: string | null;
  unit: string | null;
  value: number;
  context: string | null;
  format: string | null;
}

/**
 * Units are normalised to base SI at ingest (kWh→Wh, kW→W, kvarh→varh …).
 *
 * Chargers disagree about units for the same measurand — the same model can
 * report Wh on one firmware and kWh on the next. Normalising once here means
 * every consumer (rollups, charts, the Phase 3 cost engine) can assume Wh and
 * W without carrying a unit column through every calculation.
 */
const UNIT_SCALE: Record<string, { factor: number; unit: string }> = {
  kwh: { factor: 1000, unit: 'Wh' },
  kw: { factor: 1000, unit: 'W' },
  kvarh: { factor: 1000, unit: 'varh' },
  kvar: { factor: 1000, unit: 'var' },
  kva: { factor: 1000, unit: 'VA' },
};

function normalizeUnit(
  value: number,
  unit: string | undefined,
): { value: number; unit: string | null } {
  if (!unit) return { value, unit: null };
  const scale = UNIT_SCALE[unit.toLowerCase()];
  return scale ? { value: value * scale.factor, unit: scale.unit } : { value, unit };
}

/**
 * Timestamps are parsed leniently: a charger with a dead RTC or a stale NTP
 * sync still produces billable energy, so an unparseable timestamp falls back
 * to the receive time rather than discarding the sample.
 */
export function parseTimestamp(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw.trim());
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export interface ParseOptions {
  /** Quirk: meter reports kWh but omits the unit (see quirks/index.ts). */
  assumeKwhWhenUnitMissing?: boolean;
}

/** Flattens OCPP meterValue[] → sampledValue[] into one row per reading. */
export function parseMeterValues(
  meterValues: ocpp16.MeterValue[],
  receivedAt: Date,
  options: ParseOptions = {},
): ParsedSample[] {
  const out: ParsedSample[] = [];

  for (const mv of meterValues) {
    const sampledAt = parseTimestamp(mv.timestamp, receivedAt);

    for (const sv of mv.sampledValue ?? []) {
      // SignedData carries a cryptographic blob (Eichrecht), not a number.
      // It is preserved in the raw frame log; it has no place in a numeric
      // telemetry column.
      if (sv.format === 'SignedData') continue;

      const raw = typeof sv.value === 'number' ? sv.value : Number.parseFloat(String(sv.value));
      if (!Number.isFinite(raw)) continue;

      const measurand = sv.measurand ?? ocpp16.DEFAULT_MEASURAND;
      const effectiveUnit =
        sv.unit ??
        (options.assumeKwhWhenUnitMissing && measurand === ocpp16.DEFAULT_MEASURAND
          ? 'kWh'
          : undefined);

      const { value, unit } = normalizeUnit(raw, effectiveUnit);

      out.push({
        sampledAt,
        measurand,
        phase: sv.phase ?? null,
        location: sv.location ?? null,
        unit,
        value,
        context: sv.context ?? null,
        format: sv.format ?? null,
      });
    }
  }

  return out;
}

export function toMeterValueRows(
  samples: ParsedSample[],
  ctx: {
    tenantId: string;
    chargePointId: string;
    chargingSessionId: string | null;
    ocppConnectorId: number;
  },
): MeterValueRow[] {
  return samples.map((s) => ({
    tenant_id: ctx.tenantId,
    charge_point_id: ctx.chargePointId,
    charging_session_id: ctx.chargingSessionId,
    ocpp_connector_id: ctx.ocppConnectorId,
    sampled_at: s.sampledAt,
    measurand: s.measurand,
    phase: s.phase,
    location: s.location,
    unit: s.unit,
    value: s.value,
    context: s.context,
    format: s.format,
  }));
}

/** Picks out the values worth pushing to a live session screen. */
export function summariseForBroadcast(samples: ParsedSample[]): {
  powerW: number | null;
  energyWh: number | null;
  socPercent: number | null;
} {
  let powerW: number | null = null;
  let energyWh: number | null = null;
  let socPercent: number | null = null;

  for (const s of samples) {
    // Per-phase readings are components of the total, not the total itself.
    if (s.phase) continue;
    if (s.measurand === 'Power.Active.Import') powerW = s.value;
    else if (s.measurand === ocpp16.DEFAULT_MEASURAND) energyWh = s.value;
    else if (s.measurand === 'SoC') socPercent = s.value;
  }

  return { powerW, energyWh, socPercent };
}
