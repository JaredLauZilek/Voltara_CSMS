// OCPI 2.2.1-shaped tariff model (ADR-0006), validated with zod. Prices are
// integer sen per OCPI unit: ENERGY per kWh, TIME and PARKING_TIME per hour,
// FLAT once. step_size follows OCPI: Wh for ENERGY, seconds for the time
// dimensions, ignored for FLAT.

import { z } from 'zod';

export const TARIFF_DIMENSIONS = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT'] as const;
export type TariffDimension = (typeof TARIFF_DIMENSIONS)[number];

export const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const priceComponentSchema = z.object({
  type: z.enum(TARIFF_DIMENSIONS),
  /** Sen per unit (kWh · hour · once). */
  price_sen: z.number().int().nonnegative(),
  /** OCPI step_size: Wh for ENERGY, seconds for TIME/PARKING_TIME. */
  step_size: z.number().int().positive().default(1),
});
export type PriceComponent = z.infer<typeof priceComponentSchema>;

export const tariffRestrictionsSchema = z
  .object({
    start_time: hhmm.optional(),
    end_time: hhmm.optional(),
    start_date: isoDate.optional(),
    end_date: isoDate.optional(),
    min_kwh: z.number().nonnegative().optional(),
    max_kwh: z.number().positive().optional(),
    min_power_kw: z.number().nonnegative().optional(),
    max_power_kw: z.number().positive().optional(),
    min_duration_s: z.number().int().nonnegative().optional(),
    max_duration_s: z.number().int().positive().optional(),
    day_of_week: z.array(z.enum(DAYS_OF_WEEK)).optional(),
    /**
     * Idle grace: PARKING_TIME components in this element only start counting
     * after this many seconds of idling. Our extension (OCPI expresses grace
     * via min_duration on a separate element; this is the operator-facing
     * shape and the engine expands it).
     */
    grace_period_s: z.number().int().nonnegative().optional(),
  })
  .strict();
export type TariffRestrictions = z.infer<typeof tariffRestrictionsSchema>;

export const tariffElementSchema = z.object({
  price_components: z.array(priceComponentSchema).min(1),
  restrictions: tariffRestrictionsSchema.optional(),
});
export type TariffElement = z.infer<typeof tariffElementSchema>;

/** The frozen shape a session snapshot and a CDR carry. */
export const tariffSnapshotSchema = z.object({
  tariff_id: z.string().uuid(),
  tariff_version_id: z.string().uuid(),
  version: z.number().int().positive(),
  name: z.string(),
  display_text: z.string().nullable().optional(),
  currency: z.string().length(3).default('MYR'),
  elements: z.array(tariffElementSchema).min(1),
  min_price_sen: z.number().int().nonnegative().nullable().optional(),
  max_price_sen: z.number().int().nonnegative().nullable().optional(),
  tax_included: z.boolean().default(true),
  tax_rate_bps: z.number().int().min(0).max(10_000).default(0),
  tax_code: z.string().default('SST'),
  /** IANA zone the time-of-day restrictions are expressed in. */
  timezone: z.string().default('Asia/Kuala_Lumpur'),
  /** Why this tariff applied — kept for audit and the receipt footer. */
  resolved_by: z
    .object({
      assignment_id: z.string().uuid().nullable().optional(),
      scope_type: z.string().nullable().optional(),
      audience: z.string().nullable().optional(),
      driver_group_id: z.string().uuid().nullable().optional(),
    })
    .optional(),
});
export type TariffSnapshot = z.infer<typeof tariffSnapshotSchema>;

export function parseTariffElements(input: unknown): TariffElement[] {
  return z.array(tariffElementSchema).min(1).parse(input);
}

/**
 * Operator-facing presets. The editor starts from one of these and the data
 * keeps the general OCPI shape underneath.
 */
export const TARIFF_PRESETS = {
  perKwh: (senPerKwh: number): TariffElement[] => [
    { price_components: [{ type: 'ENERGY', price_sen: senPerKwh, step_size: 1 }] },
  ],
  perKwhWithIdle: (
    senPerKwh: number,
    idleSenPerMinute: number,
    graceMinutes: number,
  ): TariffElement[] => [
    { price_components: [{ type: 'ENERGY', price_sen: senPerKwh, step_size: 1 }] },
    {
      price_components: [{ type: 'PARKING_TIME', price_sen: idleSenPerMinute * 60, step_size: 60 }],
      restrictions: { grace_period_s: graceMinutes * 60 },
    },
  ],
  perMinute: (senPerMinute: number): TariffElement[] => [
    { price_components: [{ type: 'TIME', price_sen: senPerMinute * 60, step_size: 60 }] },
  ],
  peakOffPeak: (
    peakSenPerKwh: number,
    offPeakSenPerKwh: number,
    peakStart: string,
    peakEnd: string,
  ): TariffElement[] => [
    {
      price_components: [{ type: 'ENERGY', price_sen: peakSenPerKwh, step_size: 1 }],
      restrictions: { start_time: peakStart, end_time: peakEnd },
    },
    { price_components: [{ type: 'ENERGY', price_sen: offPeakSenPerKwh, step_size: 1 }] },
  ],
  sessionFeePlusKwh: (sessionFeeSen: number, senPerKwh: number): TariffElement[] => [
    {
      price_components: [
        { type: 'FLAT', price_sen: sessionFeeSen, step_size: 1 },
        { type: 'ENERGY', price_sen: senPerKwh, step_size: 1 },
      ],
    },
  ],
  free: (): TariffElement[] => [
    { price_components: [{ type: 'FLAT', price_sen: 0, step_size: 1 }] },
  ],
} as const;
