import { useMemo, useState } from 'react';
import { C } from '@voltara/ui';
import { billing } from '@voltara/shared';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: 4,
};

/**
 * "What would this session cost?" — runs the SAME engine the gateway uses on
 * a synthetic session, so the operator sees exactly what a driver would be
 * charged, tax lines and all.
 */
export function PricePreview({
  elements,
  taxRateBps,
  taxIncluded,
  minPriceSen,
  maxPriceSen,
}: {
  elements: billing.TariffElement[];
  taxRateBps: number;
  taxIncluded: boolean;
  minPriceSen: number | null;
  maxPriceSen: number | null;
}) {
  const [kwh, setKwh] = useState('18');
  const [minutes, setMinutes] = useState('60');
  const [idleMinutes, setIdleMinutes] = useState('0');
  const [startTime, setStartTime] = useState('15:30');

  const result = useMemo(() => {
    if (elements.length === 0) return null;
    try {
      const snapshot = billing.tariffSnapshotSchema.parse({
        tariff_id: '00000000-0000-4000-8000-000000000000',
        tariff_version_id: '00000000-0000-4000-8000-000000000000',
        version: 1,
        name: 'preview',
        elements,
        min_price_sen: minPriceSen,
        max_price_sen: maxPriceSen,
        tax_included: taxIncluded,
        tax_rate_bps: taxRateBps,
      });
      const [h, m] = startTime.split(':').map(Number);
      const start = new Date();
      start.setHours(h || 0, m || 0, 0, 0);
      const chargeEnd = new Date(start.getTime() + Math.max(0, Number(minutes) || 0) * 60_000);
      const end = new Date(chargeEnd.getTime() + Math.max(0, Number(idleMinutes) || 0) * 60_000);
      const periods = billing.periodsFromSession({
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        chargingEndedAt: end > chargeEnd ? chargeEnd.toISOString() : null,
        totalEnergyWh: Math.max(0, Number(kwh) || 0) * 1000,
      });
      return { cost: billing.priceSession(periods, snapshot), error: null as string | null };
    } catch (err) {
      return { cost: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [
    elements,
    taxRateBps,
    taxIncluded,
    minPriceSen,
    maxPriceSen,
    kwh,
    minutes,
    idleMinutes,
    startTime,
  ]);

  return (
    <div
      style={{
        background: C.seasalt,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Price preview
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div>
          <label style={labelStyle}>Energy (kWh)</label>
          <input
            value={kwh}
            onChange={(e) => setKwh(e.target.value)}
            style={inputStyle}
            inputMode="decimal"
          />
        </div>
        <div>
          <label style={labelStyle}>Charging (min)</label>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            style={inputStyle}
            inputMode="numeric"
          />
        </div>
        <div>
          <label style={labelStyle}>Idle after (min)</label>
          <input
            value={idleMinutes}
            onChange={(e) => setIdleMinutes(e.target.value)}
            style={inputStyle}
            inputMode="numeric"
          />
        </div>
        <div>
          <label style={labelStyle}>Starts at</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      {result?.error && <div style={{ fontSize: 12, color: C.error }}>{result.error}</div>}
      {result?.cost && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          {result.cost.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: C.ink }}>
              <span>{l.label}</span>
              <span style={{ fontFamily: 'monospace' }}>{billing.formatSen(l.amountInclSen)}</span>
            </div>
          ))}
          {result.cost.taxSen > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: C.slate,
                fontSize: 12,
              }}
            >
              <span>of which tax ({(result.cost.taxRateBps / 100).toFixed(0)}%)</span>
              <span style={{ fontFamily: 'monospace' }}>
                {billing.formatSen(result.cost.taxSen)}
              </span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              color: C.green,
              borderTop: `1px solid ${C.border}`,
              paddingTop: 6,
              marginTop: 2,
            }}
          >
            <span>Driver pays</span>
            <span style={{ fontFamily: 'monospace', fontSize: 15 }}>
              {billing.formatSen(result.cost.totalSen)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
