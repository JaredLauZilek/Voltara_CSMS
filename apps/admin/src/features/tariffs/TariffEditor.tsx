import { useEffect, useMemo, useState } from 'react';
import { C } from '@voltara/ui';
import { billing } from '@voltara/shared';
import { PricePreview } from './PricePreview';
import type { NewVersionInput, TariffVersion, TaxProfile } from './types';
import { elementsOf } from './types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: 6,
};

/** RM text ⇄ sen, tolerant of partial typing. */
function useMoney(initialSen: number | null | undefined) {
  const [text, setText] = useState(initialSen == null ? '' : (initialSen / 100).toFixed(2));
  const sen = billing.parseSen(text);
  return { text, setText, sen: sen ?? null };
}

export interface TariffEditorValue extends NewVersionInput {
  valid: boolean;
}

/**
 * Works in presets (what an operator thinks in) and keeps OCPI elements
 * underneath (what the engine prices). "Custom" exposes the elements as JSON
 * for shapes the presets do not cover — kWh tiers, weekday rates, caps by
 * power — validated against the shared schema before it can be saved.
 */
export function TariffEditor({
  initial,
  taxProfiles,
  onChange,
}: {
  initial: TariffVersion | null;
  taxProfiles: TaxProfile[];
  onChange: (value: TariffEditorValue) => void;
}) {
  const detected = useMemo(() => billing.detectPreset(elementsOf(initial)), [initial]);
  const [kind, setKind] = useState<billing.PresetKind>(initial ? detected.kind : 'per_kwh');
  const perKwh = useMoney(detected.params.senPerKwh ?? 120);
  const idlePerMin = useMoney(detected.params.idleSenPerMinute ?? 100);
  const [grace, setGrace] = useState(String(detected.params.graceMinutes ?? 15));
  const perMin = useMoney(detected.params.senPerMinute ?? 50);
  const peak = useMoney(detected.params.peakSenPerKwh ?? 200);
  const offPeak = useMoney(detected.params.offPeakSenPerKwh ?? 100);
  const [peakStart, setPeakStart] = useState(detected.params.peakStart ?? '14:00');
  const [peakEnd, setPeakEnd] = useState(detected.params.peakEnd ?? '22:00');
  const sessionFee = useMoney(detected.params.sessionFeeSen ?? 200);
  const [customJson, setCustomJson] = useState(JSON.stringify(elementsOf(initial), null, 2));
  const [taxIncluded, setTaxIncluded] = useState(initial?.tax_included ?? true);
  const [taxProfileId, setTaxProfileId] = useState<string>(
    initial?.tax_profile_id ?? taxProfiles.find((t) => t.is_default)?.id ?? '',
  );
  const minPrice = useMoney(initial?.min_price_sen == null ? null : Number(initial.min_price_sen));
  const maxPrice = useMoney(initial?.max_price_sen == null ? null : Number(initial.max_price_sen));
  const [displayText, setDisplayText] = useState(initial?.display_text ?? '');
  const [displayTouched, setDisplayTouched] = useState(Boolean(initial?.display_text));

  const { elements, error } = useMemo<{
    elements: billing.TariffElement[];
    error: string | null;
  }>(() => {
    if (kind === 'custom') {
      try {
        return { elements: billing.parseTariffElements(JSON.parse(customJson)), error: null };
      } catch (err) {
        return {
          elements: [],
          error: err instanceof Error ? err.message.split('\n')[0] : 'Invalid JSON',
        };
      }
    }
    const params: billing.PresetParams = {
      senPerKwh: perKwh.sen ?? 0,
      idleSenPerMinute: idlePerMin.sen ?? 0,
      graceMinutes: Math.max(0, Number(grace) || 0),
      senPerMinute: perMin.sen ?? 0,
      peakSenPerKwh: peak.sen ?? 0,
      offPeakSenPerKwh: offPeak.sen ?? 0,
      peakStart,
      peakEnd,
      sessionFeeSen: sessionFee.sen ?? 0,
    };
    return { elements: billing.buildElements(kind, params), error: null };
  }, [
    kind,
    customJson,
    perKwh.sen,
    idlePerMin.sen,
    grace,
    perMin.sen,
    peak.sen,
    offPeak.sen,
    peakStart,
    peakEnd,
    sessionFee.sen,
  ]);

  const taxRateBps = taxProfiles.find((t) => t.id === taxProfileId)?.rate_bps ?? 0;
  const autoText = elements.length ? billing.describeElements(elements) : '';
  const effectiveDisplay = displayTouched ? displayText : autoText;

  useEffect(() => {
    onChange({
      elements,
      tax_included: taxIncluded,
      tax_profile_id: taxProfileId || null,
      min_price_sen: minPrice.sen,
      max_price_sen: maxPrice.sen,
      display_text: effectiveDisplay || null,
      valid: elements.length > 0 && !error,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, error, taxIncluded, taxProfileId, minPrice.sen, maxPrice.sen, effectiveDisplay]);

  const money = (m: ReturnType<typeof useMoney>, placeholder = '1.20') => (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 12, top: 9, fontSize: 13, color: C.slate }}>
        RM
      </span>
      <input
        value={m.text}
        onChange={(e) => m.setText(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        style={{ ...inputStyle, paddingLeft: 38, fontFamily: 'monospace' }}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>Pricing shape</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {billing.PRESET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (k === 'custom' && kind !== 'custom')
                  setCustomJson(JSON.stringify(elements, null, 2));
                setKind(k);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 99,
                border: `2px solid ${kind === k ? C.green : C.border}`,
                background: kind === k ? C.honeydew : C.white,
                color: kind === k ? C.green : C.slate,
                fontFamily: 'Figtree',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {billing.PRESET_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {(kind === 'per_kwh' || kind === 'per_kwh_idle' || kind === 'session_fee_kwh') && (
          <div>
            <label style={labelStyle}>Per kWh</label>
            {money(perKwh)}
          </div>
        )}
        {kind === 'per_kwh_idle' && (
          <>
            <div>
              <label style={labelStyle}>Idle fee per minute</label>
              {money(idlePerMin, '1.00')}
            </div>
            <div>
              <label style={labelStyle}>Grace period (min)</label>
              <input
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                inputMode="numeric"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {kind === 'per_minute' && (
          <div>
            <label style={labelStyle}>Per minute of charging</label>
            {money(perMin, '0.50')}
          </div>
        )}
        {kind === 'peak_off_peak' && (
          <>
            <div>
              <label style={labelStyle}>Peak per kWh</label>
              {money(peak, '2.00')}
            </div>
            <div>
              <label style={labelStyle}>Off-peak per kWh</label>
              {money(offPeak, '1.00')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>Peak from</label>
                <input
                  type="time"
                  value={peakStart}
                  onChange={(e) => setPeakStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Peak until</label>
                <input
                  type="time"
                  value={peakEnd}
                  onChange={(e) => setPeakEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        )}
        {kind === 'session_fee_kwh' && (
          <div>
            <label style={labelStyle}>Session fee</label>
            {money(sessionFee, '2.00')}
          </div>
        )}
        {kind === 'free' && (
          <div style={{ gridColumn: '1/-1', fontSize: 13, color: C.slate }}>
            Sessions are recorded and priced at RM 0.00 — still visible in reports and exports.
          </div>
        )}
      </div>

      {kind === 'custom' && (
        <div>
          <label style={labelStyle}>OCPI tariff elements (JSON)</label>
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            rows={10}
            spellCheck={false}
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              fontSize: 12,
              resize: 'vertical',
              borderColor: error ? C.error : C.border,
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: error ? C.error : C.slate,
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {error ??
              'Elements are evaluated in order; the first whose restrictions match prices each dimension. Prices are sen per kWh / per hour / per session; step_size in Wh or seconds.'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Tax</label>
          <select
            value={taxProfileId}
            onChange={(e) => setTaxProfileId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— None —</option>
            {taxProfiles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {(t.rate_bps / 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Prices above are</label>
          <select
            value={taxIncluded ? 'incl' : 'excl'}
            onChange={(e) => setTaxIncluded(e.target.value === 'incl')}
            style={inputStyle}
          >
            <option value="incl">Tax-inclusive</option>
            <option value="excl">Tax-exclusive</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Min per session</label>
            {money(minPrice, '—')}
          </div>
          <div>
            <label style={labelStyle}>Max per session</label>
            {money(maxPrice, '—')}
          </div>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Shown to drivers as</label>
        <input
          value={effectiveDisplay}
          onChange={(e) => {
            setDisplayTouched(true);
            setDisplayText(e.target.value);
          }}
          placeholder={autoText}
          style={inputStyle}
        />
      </div>

      <PricePreview
        elements={elements}
        taxRateBps={taxRateBps}
        taxIncluded={taxIncluded}
        minPriceSen={minPrice.sen}
        maxPriceSen={maxPrice.sen}
      />
    </div>
  );
}
