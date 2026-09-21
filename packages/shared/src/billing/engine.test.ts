import { describe, expect, it } from 'vitest';
import { periodsFromSession, priceSession, type ChargingPeriod } from './engine';
import { bps, exclFromIncl, formatSen, parseSen, roundSen } from './money';
import { buildElements, describeElements, detectPreset } from './presets';
import { TARIFF_PRESETS, tariffSnapshotSchema, type TariffElement } from './tariff';

const snapshot = (
  elements: TariffElement[],
  extra: Partial<Parameters<typeof tariffSnapshotSchema.parse>[0]> = {},
) =>
  tariffSnapshotSchema.parse({
    tariff_id: '11111111-1111-4111-8111-111111111111',
    tariff_version_id: '22222222-2222-4222-8222-222222222222',
    version: 1,
    name: 'test',
    elements,
    tax_included: false,
    tax_rate_bps: 0,
    ...extra,
  });

/** A session in KL local time: '2026-09-21T14:00' → ISO UTC. */
const kl = (local: string) => new Date(`${local}:00+08:00`).toISOString();

const charge = (from: string, to: string, wh: number): ChargingPeriod => ({
  start: kl(from),
  end: kl(to),
  energyWh: wh,
  charging: true,
});
const idle = (from: string, to: string): ChargingPeriod => ({
  start: kl(from),
  end: kl(to),
  energyWh: 0,
  charging: false,
});

describe('money', () => {
  it('rounds half-up in sen and formats RM', () => {
    expect(roundSen(12.5)).toBe(13);
    expect(roundSen(12.4)).toBe(12);
    expect(roundSen(-12.5)).toBe(-13);
    expect(bps(12345, 800)).toBe(988); // 8% of RM 123.45 = RM 9.876 → 9.88
    expect(exclFromIncl(10800, 800)).toBe(10000);
    expect(formatSen(123456)).toBe('RM 1,234.56');
    expect(formatSen(-5)).toBe('-RM 0.05');
    expect(parseSen('RM 1.20')).toBe(120);
    expect(parseSen('abc')).toBeNull();
  });
});

describe('golden cases (sen-exact)', () => {
  it('per-kWh: 18.4 kWh at RM 1.20/kWh = RM 22.08', () => {
    const cost = priceSession(
      [charge('2026-09-21T10:00', '2026-09-21T11:30', 18_400)],
      snapshot(TARIFF_PRESETS.perKwh(120)),
    );
    expect(cost.totalEnergyCostSen).toBe(2208);
    expect(cost.totalSen).toBe(2208);
    expect(cost.lines).toHaveLength(1);
    expect(cost.lines[0].label).toBe('Energy 18.400 kWh @ RM 1.20/kWh');
  });

  it('per-kWh + idle after 15 min grace: 40 min idle at RM 1/min bills 25 min', () => {
    const cost = priceSession(
      [
        charge('2026-09-21T10:00', '2026-09-21T11:00', 7_000),
        idle('2026-09-21T11:00', '2026-09-21T11:40'),
      ],
      snapshot(TARIFF_PRESETS.perKwhWithIdle(120, 100, 15)),
    );
    expect(cost.totalEnergyCostSen).toBe(840);
    expect(cost.totalParkingTimeS).toBe(2400);
    expect(cost.totalParkingCostSen).toBe(2500);
    expect(cost.totalSen).toBe(3340);
  });

  it('idle shorter than the grace period costs nothing', () => {
    const cost = priceSession(
      [
        charge('2026-09-21T10:00', '2026-09-21T11:00', 7_000),
        idle('2026-09-21T11:00', '2026-09-21T11:10'),
      ],
      snapshot(TARIFF_PRESETS.perKwhWithIdle(120, 100, 15)),
    );
    expect(cost.totalParkingCostSen).toBe(0);
    expect(cost.lines.map((l) => l.dimension)).toEqual(['ENERGY']);
  });

  it('per-minute with 60 s steps rounds a partial minute up', () => {
    // 12 min 10 s → 13 minutes at RM 0.50/min = RM 6.50
    const p: ChargingPeriod = {
      start: kl('2026-09-21T10:00'),
      end: new Date(new Date(kl('2026-09-21T10:12')).getTime() + 10_000).toISOString(),
      energyWh: 1_000,
      charging: true,
    };
    const cost = priceSession([p], snapshot(TARIFF_PRESETS.perMinute(50)));
    expect(cost.lines[0].volume).toBe(13 * 60);
    expect(cost.totalTimeCostSen).toBe(650);
  });

  it('session fee + per-kWh charges the fee exactly once across many periods', () => {
    const cost = priceSession(
      [
        charge('2026-09-21T10:00', '2026-09-21T10:30', 3_000),
        charge('2026-09-21T10:30', '2026-09-21T11:00', 3_000),
      ],
      snapshot(TARIFF_PRESETS.sessionFeePlusKwh(200, 100)),
    );
    expect(cost.totalFixedCostSen).toBe(200);
    expect(cost.totalEnergyCostSen).toBe(600);
    expect(cost.totalSen).toBe(800);
  });

  it('peak/off-peak: a session crossing 14:00 pays peak only after 14:00', () => {
    // 13:00–15:00, 20 kWh spread evenly: 10 kWh off-peak @ RM 1.00, 10 kWh peak @ RM 2.00
    const cost = priceSession(
      [charge('2026-09-21T13:00', '2026-09-21T15:00', 20_000)],
      snapshot(TARIFF_PRESETS.peakOffPeak(200, 100, '14:00', '22:00')),
    );
    expect(cost.totalEnergyCostSen).toBe(1000 + 2000);
    expect(cost.lines.map((l) => [l.elementIndex, l.volume]).sort()).toEqual([
      [0, 10_000],
      [1, 10_000],
    ]);
  });

  it('a peak window crossing midnight (22:00–06:00) matches at 23:30', () => {
    const cost = priceSession(
      [charge('2026-09-21T23:00', '2026-09-22T00:00', 5_000)],
      snapshot(TARIFF_PRESETS.peakOffPeak(200, 100, '22:00', '06:00')),
    );
    expect(cost.totalEnergyCostSen).toBe(1000);
  });

  it('day-of-week restriction: weekend rate on a Sunday, not a Monday', () => {
    const elements: TariffElement[] = [
      {
        price_components: [{ type: 'ENERGY', price_sen: 80, step_size: 1 }],
        restrictions: { day_of_week: ['SATURDAY', 'SUNDAY'] },
      },
      { price_components: [{ type: 'ENERGY', price_sen: 120, step_size: 1 }] },
    ];
    // 2026-09-20 is a Sunday, 2026-09-21 a Monday.
    expect(
      priceSession([charge('2026-09-20T10:00', '2026-09-20T11:00', 10_000)], snapshot(elements))
        .totalSen,
    ).toBe(800);
    expect(
      priceSession([charge('2026-09-21T10:00', '2026-09-21T11:00', 10_000)], snapshot(elements))
        .totalSen,
    ).toBe(1200);
  });

  it('kWh tiers: first 10 kWh at RM 1.00, the rest at RM 0.80', () => {
    const elements: TariffElement[] = [
      {
        price_components: [{ type: 'ENERGY', price_sen: 100, step_size: 1 }],
        restrictions: { max_kwh: 10 },
      },
      { price_components: [{ type: 'ENERGY', price_sen: 80, step_size: 1 }] },
    ];
    // Ten 1-minute periods of 2 kWh: periods 1–5 (cumulative 0→10) at tier 1, 6–10 at tier 2.
    const periods: ChargingPeriod[] = Array.from({ length: 10 }, (_, i) => ({
      start: new Date(Date.UTC(2026, 8, 21, 2, i)).toISOString(),
      end: new Date(Date.UTC(2026, 8, 21, 2, i + 1)).toISOString(),
      energyWh: 2_000,
      charging: true,
    }));
    const cost = priceSession(periods, snapshot(elements));
    expect(cost.totalEnergyCostSen).toBe(10 * 100 + 10 * 80);
  });

  it('tax-exclusive tariff at 8%: RM 22.08 + RM 1.77 = RM 23.85', () => {
    const cost = priceSession(
      [charge('2026-09-21T10:00', '2026-09-21T11:00', 18_400)],
      snapshot(TARIFF_PRESETS.perKwh(120), { tax_rate_bps: 800 }),
    );
    expect(cost.subtotalSen).toBe(2208);
    expect(cost.taxSen).toBe(177); // 176.64 → 177
    expect(cost.totalSen).toBe(2385);
  });

  it('tax-inclusive tariff at 8%: the driver pays the advertised RM 1.20/kWh, tax is carved out', () => {
    const cost = priceSession(
      [charge('2026-09-21T10:00', '2026-09-21T11:00', 10_000)],
      snapshot(TARIFF_PRESETS.perKwh(120), { tax_rate_bps: 800, tax_included: true }),
    );
    expect(cost.totalSen).toBe(1200);
    expect(cost.subtotalSen).toBe(1111); // 1200 / 1.08 = 1111.11
    expect(cost.taxSen).toBe(89);
  });

  it('min and max price caps add an adjustment line', () => {
    const tiny = priceSession(
      [charge('2026-09-21T10:00', '2026-09-21T10:05', 300)],
      snapshot(TARIFF_PRESETS.perKwh(120), { min_price_sen: 300 }),
    );
    expect(tiny.totalSen).toBe(300);
    expect(tiny.capApplied).toBe('min');
    const huge = priceSession(
      [charge('2026-09-21T10:00', '2026-09-21T20:00', 90_000)],
      snapshot(TARIFF_PRESETS.perKwh(120), { max_price_sen: 5000 }),
    );
    expect(huge.totalSen).toBe(5000);
    expect(huge.capApplied).toBe('max');
  });

  it('a free tariff yields a RM 0 record, not an error', () => {
    const cost = priceSession(
      [charge('2026-09-21T10:00', '2026-09-21T11:00', 5_000)],
      snapshot(TARIFF_PRESETS.free()),
    );
    expect(cost.totalSen).toBe(0);
    expect(cost.totalEnergyWh).toBe(5000);
  });
});

describe('invariants (randomised)', () => {
  // Deterministic PRNG so a failure is reproducible.
  let seed = 20260921;
  const rand = () => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const randomPeriods = (): ChargingPeriod[] => {
    const n = 1 + Math.floor(rand() * 6);
    let t = Date.UTC(2026, 8, 21, Math.floor(rand() * 24), 0);
    const out: ChargingPeriod[] = [];
    for (let i = 0; i < n; i += 1) {
      const seconds = 60 + Math.floor(rand() * 7200);
      const charging = i < n - 1 || rand() > 0.5;
      out.push({
        start: new Date(t).toISOString(),
        end: new Date(t + seconds * 1000).toISOString(),
        energyWh: charging ? Math.floor(rand() * 20_000) : 0,
        charging,
      });
      t += seconds * 1000;
    }
    return out;
  };
  const tariffs = [
    TARIFF_PRESETS.perKwh(120),
    TARIFF_PRESETS.perKwhWithIdle(120, 100, 15),
    TARIFF_PRESETS.perMinute(50),
    TARIFF_PRESETS.peakOffPeak(200, 100, '14:00', '22:00'),
    TARIFF_PRESETS.sessionFeePlusKwh(200, 100),
  ];

  // 400 priced sessions; generous budget so a CPU-starved CI runner (the full
  // turbo matrix on two cores) never turns a slow run into a false failure.
  it(
    'lines always sum to the totals, amounts are integers, tax ≥ 0, and pricing is monotonic in energy',
    { timeout: 60_000 },
    () => {
      for (let i = 0; i < 400; i += 1) {
        const periods = randomPeriods();
        const elements = tariffs[i % tariffs.length];
        const rate = [0, 600, 800][i % 3];
        const inclusive = i % 2 === 0;
        const cost = priceSession(
          periods,
          snapshot(elements, { tax_rate_bps: rate, tax_included: inclusive }),
        );

        expect(cost.lines.reduce((s, l) => s + l.amountExclSen, 0)).toBe(cost.subtotalSen);
        expect(cost.lines.reduce((s, l) => s + l.taxSen, 0)).toBe(cost.taxSen);
        expect(cost.subtotalSen + cost.taxSen).toBe(cost.totalSen);
        for (const l of cost.lines) {
          expect(Number.isInteger(l.amountExclSen)).toBe(true);
          expect(l.amountInclSen).toBe(l.amountExclSen + l.taxSen);
          expect(l.taxSen).toBeGreaterThanOrEqual(0);
        }
        if (rate === 0) expect(cost.taxSen).toBe(0);

        // More energy in the same periods can never cost less.
        const more = priceSession(
          periods.map((p) => ({ ...p, energyWh: p.energyWh * 2 })),
          snapshot(elements, { tax_rate_bps: rate, tax_included: inclusive }),
        );
        expect(more.totalSen).toBeGreaterThanOrEqual(cost.totalSen);
      }
    },
  );

  it('is independent of how a period is sliced (no ToU boundaries)', () => {
    for (let i = 0; i < 100; i += 1) {
      const whole = charge('2026-09-21T10:00', '2026-09-21T12:00', Math.floor(rand() * 30_000));
      const halves = [
        charge('2026-09-21T10:00', '2026-09-21T11:00', whole.energyWh / 2),
        charge('2026-09-21T11:00', '2026-09-21T12:00', whole.energyWh / 2),
      ];
      const t = snapshot(TARIFF_PRESETS.sessionFeePlusKwh(200, 120), { tax_rate_bps: 800 });
      expect(priceSession(halves, t).totalSen).toBe(priceSession([whole], t).totalSen);
    }
  });
});

describe('periodsFromSession', () => {
  it('never double-counts idle when the samples already reach the stop time', () => {
    // Samples every 5 min up to the moment charging ended, plus the stop reading
    // 20 min later — exactly what the gateway assembles at StopTransaction.
    const periods = periodsFromSession({
      startedAt: kl('2026-09-21T10:00'),
      endedAt: kl('2026-09-21T10:30'),
      chargingEndedAt: kl('2026-09-21T10:10'),
      totalEnergyWh: 2000,
      samples: [
        { at: kl('2026-09-21T10:00'), energyWh: 1000 },
        { at: kl('2026-09-21T10:05'), energyWh: 2000 },
        { at: kl('2026-09-21T10:10'), energyWh: 3000 },
        { at: kl('2026-09-21T10:30'), energyWh: 3000 },
      ],
    });
    const idle = periods.filter((p) => !p.charging);
    expect(idle).toHaveLength(1);
    expect((new Date(idle[0].end).getTime() - new Date(idle[0].start).getTime()) / 1000).toBe(1200);
    expect(periods.filter((p) => p.charging).reduce((s, p) => s + p.energyWh, 0)).toBe(2000);
  });

  it('splits a sample interval that straddles the charging end and keeps its energy on the charging side', () => {
    const periods = periodsFromSession({
      startedAt: kl('2026-09-21T10:00'),
      endedAt: kl('2026-09-21T10:20'),
      chargingEndedAt: kl('2026-09-21T10:07'),
      totalEnergyWh: 1000,
      samples: [
        { at: kl('2026-09-21T10:00'), energyWh: 0 },
        { at: kl('2026-09-21T10:10'), energyWh: 1000 },
        { at: kl('2026-09-21T10:20'), energyWh: 1000 },
      ],
    });
    expect(periods.map((p) => [p.charging, p.energyWh])).toEqual([
      [true, 1000],
      [false, 0],
      [false, 0],
    ]);
    expect(
      periods
        .filter((p) => !p.charging)
        .reduce((s, p) => s + (new Date(p.end).getTime() - new Date(p.start).getTime()) / 1000, 0),
    ).toBe(13 * 60);
  });

  it('splits charging from idle at chargingEndedAt', () => {
    const periods = periodsFromSession({
      startedAt: kl('2026-09-21T10:00'),
      endedAt: kl('2026-09-21T11:30'),
      chargingEndedAt: kl('2026-09-21T11:00'),
      totalEnergyWh: 7_000,
    });
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ charging: true, energyWh: 7_000 });
    expect(periods[1]).toMatchObject({ charging: false, energyWh: 0 });
  });

  it('uses meter samples for per-interval energy when available', () => {
    const periods = periodsFromSession({
      startedAt: kl('2026-09-21T10:00'),
      endedAt: kl('2026-09-21T10:03'),
      chargingEndedAt: null,
      totalEnergyWh: 300,
      samples: [
        { at: kl('2026-09-21T10:00'), energyWh: 1000 },
        { at: kl('2026-09-21T10:01'), energyWh: 1100 },
        { at: kl('2026-09-21T10:02'), energyWh: 1250 },
        { at: kl('2026-09-21T10:03'), energyWh: 1300 },
      ],
    });
    expect(periods.map((p) => p.energyWh)).toEqual([100, 150, 50]);
  });
});

describe('presets round-trip', () => {
  it('recognises every preset it builds, and describes it for drivers', () => {
    const cases = [
      ['per_kwh', { senPerKwh: 120 }, 'RM 1.20/kWh'],
      [
        'per_kwh_idle',
        { senPerKwh: 120, idleSenPerMinute: 100, graceMinutes: 15 },
        'RM 1.20/kWh · idle RM 1.00/min after 15 min',
      ],
      ['per_minute', { senPerMinute: 50 }, 'RM 0.50/min'],
      [
        'peak_off_peak',
        { peakSenPerKwh: 200, offPeakSenPerKwh: 100, peakStart: '14:00', peakEnd: '22:00' },
        'RM 2.00/kWh 14:00–22:00 · RM 1.00/kWh otherwise',
      ],
      [
        'session_fee_kwh',
        { sessionFeeSen: 200, senPerKwh: 100 },
        'RM 2.00 per session + RM 1.00/kWh',
      ],
      ['free', {}, 'Free'],
    ] as const;
    for (const [kind, params, text] of cases) {
      const elements = buildElements(kind, params);
      const detected = detectPreset(elements);
      expect(detected.kind).toBe(kind);
      expect(detected.params).toEqual(params);
      expect(describeElements(elements)).toBe(text);
    }
  });

  it('treats anything else as custom but still describes it', () => {
    const elements: TariffElement[] = [
      {
        price_components: [{ type: 'ENERGY', price_sen: 100, step_size: 1 }],
        restrictions: { max_kwh: 10 },
      },
      { price_components: [{ type: 'ENERGY', price_sen: 80, step_size: 1 }] },
    ];
    expect(detectPreset(elements).kind).toBe('custom');
    expect(describeElements(elements)).toContain('RM 1.00/kWh');
  });
});
