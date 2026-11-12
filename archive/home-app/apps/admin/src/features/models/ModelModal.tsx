import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import {
  cancelButton,
  errorText,
  hintStyle,
  inputStyle,
  labelStyle,
  optionPill,
  primaryState,
} from '@/shared/lib/styles';
import { CHARGER_PROTOCOLS, CONNECTOR_TYPES, PHASE_OPTIONS } from './types';
import type { ChargerModel, ModelFormRow } from './types';

interface Props {
  model: ChargerModel | null;
  onClose: () => void;
  onSave: (row: ModelFormRow) => void;
  isSaving?: boolean;
  saveError?: string | null;
}

export function ModelModal({ model, onClose, onSave, isSaving, saveError }: Props) {
  const isNew = !model;
  const [form, setForm] = useState<ModelFormRow>(() =>
    model
      ? {
          brand: model.brand,
          model: model.model,
          name: model.name,
          rated_kw: model.rated_kw,
          rated_amps: model.rated_amps,
          phases: model.phases,
          protocol: model.protocol,
          connector_type: model.connector_type,
          ble_name_prefix: model.ble_name_prefix,
          is_active: model.is_active,
        }
      : {
          brand: '',
          model: '',
          name: '',
          rated_kw: 7.4,
          rated_amps: 32,
          phases: 1,
          protocol: 'hici-v1',
          connector_type: 'Type2',
          ble_name_prefix: null,
          is_active: true,
        },
  );
  const [fieldError, setFieldError] = useState('');

  const valid =
    !!form.brand.trim() &&
    !!form.model.trim() &&
    !!form.name.trim() &&
    form.rated_kw > 0 &&
    Number.isInteger(form.rated_amps) &&
    form.rated_amps > 0;
  const canSave = valid && !isSaving;

  const handleSave = () => {
    if (!valid) {
      setFieldError('Brand, model, name and positive ratings are required.');
      return;
    }
    onSave({
      ...form,
      brand: form.brand.trim(),
      model: form.model.trim(),
      name: form.name.trim(),
      ble_name_prefix: form.ble_name_prefix?.trim() || null,
    });
  };

  const setNum = (key: 'rated_kw' | 'rated_amps', raw: string) => {
    const n = Number(raw);
    setForm((f) => ({ ...f, [key]: raw === '' || Number.isNaN(n) ? 0 : n }));
  };

  return (
    <Modal
      title={isNew ? 'New model' : model.name}
      subtitle={isNew ? undefined : `${model.brand} ${model.model}`}
      onClose={onClose}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Brand</label>
          <input
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            placeholder="HiCi"
            style={inputStyle}
            autoFocus
          />
        </div>
        <div>
          <label style={labelStyle}>Model code</label>
          <input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="AC7-S"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Display name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="HiCi 7 kW wall box"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Rated power (kW)</label>
          <input
            type="number"
            step="0.1"
            min={0}
            value={form.rated_kw || ''}
            onChange={(e) => setNum('rated_kw', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Rated current (A)</label>
          <input
            type="number"
            step={1}
            min={0}
            value={form.rated_amps || ''}
            onChange={(e) => setNum('rated_amps', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Phases</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {PHASE_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setForm((f) => ({ ...f, phases: p }))}
                style={optionPill(form.phases === p)}
              >
                {p === 1 ? '1-phase' : '3-phase'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Connector</label>
          <select
            value={form.connector_type}
            onChange={(e) => setForm((f) => ({ ...f, connector_type: e.target.value }))}
            style={inputStyle}
          >
            {CONNECTOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Protocol</label>
          <select
            value={form.protocol}
            onChange={(e) => setForm((f) => ({ ...f, protocol: e.target.value }))}
            style={inputStyle}
          >
            {CHARGER_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div style={hintStyle}>The driver the app uses over BLE.</div>
        </div>
        <div>
          <label style={labelStyle}>BLE name prefix</label>
          <input
            value={form.ble_name_prefix ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, ble_name_prefix: e.target.value || null }))}
            placeholder="e.g. HICI-"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>
        <label
          style={{
            gridColumn: '1/-1',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: C.ink,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            style={{ accentColor: C.green }}
          />
          Active — offered when registering chargers
        </label>
      </div>

      {(fieldError || saveError) && <div style={errorText}>{fieldError || saveError}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={{ ...cancelButton, marginLeft: 'auto' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={!canSave} style={primaryState(canSave, isSaving)}>
          {isSaving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
