import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { MY_STATES, PHASE_MODES, PHASE_MODE_LABELS } from '@voltara/shared';
import type { PhaseMode } from '@voltara/shared';
import { errorMessage } from '@/shared/lib/errors';
import {
  cancelButton,
  errorText,
  hintStyle,
  inputStyle,
  labelStyle,
  optionPill,
  primaryState,
} from '@/shared/lib/styles';
import { useCommissionCharger } from './hooks';
import type { ChargerRow, CommissionSite } from './types';

const MIN_A = 6;
const MAX_A = 63;

function isPhaseMode(v: string | null): v is PhaseMode {
  return (PHASE_MODES as readonly string[]).includes(v ?? '');
}

export function CommissionModal({
  charger,
  onClose,
}: {
  charger: ChargerRow;
  onClose: () => void;
}) {
  const commission = useCommissionCharger();
  const [ratedA, setRatedA] = useState(
    String(charger.rated_current_a ?? charger.model_rated_amps ?? 32),
  );
  const [phaseMode, setPhaseMode] = useState<PhaseMode>(
    isPhaseMode(charger.phase_mode) ? charger.phase_mode : 'auto',
  );
  const [firmware, setFirmware] = useState(charger.firmware_version ?? '');
  const [siteLabel, setSiteLabel] = useState(charger.site_label ?? '');
  const [city, setCity] = useState(charger.city ?? '');
  const [state, setState] = useState(charger.state ?? '');
  const [postcode, setPostcode] = useState(charger.postcode ?? '');
  const [notes, setNotes] = useState(charger.notes ?? '');

  const amps = Number(ratedA);
  const ampsValid = Number.isInteger(amps) && amps >= MIN_A && amps <= MAX_A;
  const canSubmit = ampsValid && !commission.isPending;
  const first = charger.lifecycle === 'registered';

  const submit = () => {
    if (!canSubmit) return;
    const site: CommissionSite = {
      site_label: siteLabel.trim() || undefined,
      city: city.trim() || undefined,
      state: state || undefined,
      postcode: postcode.trim() || undefined,
    };
    commission.mutate(
      {
        chargerId: charger.id,
        ratedCurrentA: amps,
        phaseMode,
        firmwareVersion: firmware.trim() || null,
        site: Object.values(site).some(Boolean) ? site : null,
        notes: notes.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      title={first ? 'Commission charger' : 'Edit commissioning'}
      subtitle={`${charger.serial} · ${charger.model_name ?? ''}`}
      onClose={onClose}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Rated current (A)</label>
          <input
            type="number"
            min={MIN_A}
            max={MAX_A}
            step={1}
            value={ratedA}
            onChange={(e) => setRatedA(e.target.value)}
            style={{ ...inputStyle, borderColor: ampsValid ? C.border : C.error }}
            autoFocus
          />
          <div style={hintStyle}>
            {MIN_A}–{MAX_A} A, the circuit breaker rating. The owner&apos;s limit can never exceed
            it.
          </div>
        </div>
        <div>
          <label style={labelStyle}>Phase mode</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PHASE_MODES.map((m) => (
              <button key={m} onClick={() => setPhaseMode(m)} style={optionPill(phaseMode === m)}>
                {PHASE_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Firmware version</label>
          <input
            value={firmware}
            onChange={(e) => setFirmware(e.target.value)}
            placeholder="As reported by the unit"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Site label</label>
          <input
            value={siteLabel}
            onChange={(e) => setSiteLabel(e.target.value)}
            placeholder="e.g. Porch, Bay 2"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
            <option value="">— Select state —</option>
            {MY_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Postcode</label>
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="e.g. 47800"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Cable run, DB location, anything the next installer should know"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
      </div>

      {commission.error && <div style={errorText}>{errorMessage(commission.error)}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={{ ...cancelButton, marginLeft: 'auto' }}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={primaryState(canSubmit, commission.isPending)}
        >
          {commission.isPending ? 'Saving…' : first ? 'Commission' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
