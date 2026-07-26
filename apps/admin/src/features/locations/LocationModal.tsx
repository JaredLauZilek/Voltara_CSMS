import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { MY_STATES, SITE_TYPES, SITE_TYPE_LABELS } from './types';
import type { Location, LocationInsert, SiteType } from './types';

type FormRow = Omit<LocationInsert, 'tenant_id'>;

interface Props {
  location: Location | null;
  onClose: () => void;
  onSave: (row: FormRow) => void;
  onDelete?: (id: string) => void;
  isSaving?: boolean;
  saveError?: string | null;
}

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

export function LocationModal({ location, onClose, onSave, onDelete, isSaving, saveError }: Props) {
  const isNew = !location;
  const [form, setForm] = useState<FormRow>(() => {
    if (location) {
      // Strip server-managed fields so updates only carry editable columns.
      const { id: _id, tenant_id: _t, created_at: _c, updated_at: _u, ...rest } = location;
      return rest;
    }
    return {
      name: '',
      address: null,
      city: null,
      state: 'Selangor',
      postcode: null,
      site_type: 'public',
      jmb_name: null,
      lat: null,
      lng: null,
    };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameError, setNameError] = useState('');

  const isCondo = form.site_type === 'condo';

  const handleSave = () => {
    if (!form.name?.trim()) {
      setNameError('Name is required.');
      return;
    }
    onSave({ ...form, name: form.name.trim() });
  };

  const canSave = !!form.name?.trim() && !isSaving;

  return (
    <Modal
      title={isNew ? 'New Location' : (location?.name ?? '')}
      subtitle={
        isNew ? undefined : (SITE_TYPE_LABELS[location?.site_type as SiteType] ?? undefined)
      }
      onClose={onClose}
    >
      {/* Site type */}
      <div>
        <label style={labelStyle}>Site Type</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SITE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setForm((f) => ({ ...f, site_type: t }))}
              style={{
                padding: '6px 14px',
                borderRadius: 99,
                border: `2px solid ${form.site_type === t ? C.green : C.border}`,
                background: form.site_type === t ? C.honeydew : C.white,
                color: form.site_type === t ? C.green : C.slate,
                fontFamily: 'Figtree',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {SITE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Name */}
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Site Name</label>
          <input
            value={form.name ?? ''}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }));
              if (nameError) setNameError('');
            }}
            placeholder="e.g. Vantage Residences — Bangsar"
            style={{ ...inputStyle, borderColor: nameError ? C.error : C.border }}
          />
          {nameError && (
            <div style={{ fontSize: 11, color: C.error, marginTop: 4 }}>{nameError}</div>
          )}
        </div>

        {/* Address */}
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Address</label>
          <textarea
            value={form.address ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || null }))}
            rows={3}
            placeholder="Press Enter for a new line"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontFamily: 'Figtree' }}
          />
        </div>

        {/* City */}
        <div>
          <label style={labelStyle}>City</label>
          <input
            value={form.city ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value || null }))}
            style={inputStyle}
          />
        </div>

        {/* State */}
        <div>
          <label style={labelStyle}>State</label>
          <select
            value={form.state ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value || null }))}
            style={inputStyle}
          >
            <option value="">— Select state —</option>
            {MY_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Postcode */}
        <div>
          <label style={labelStyle}>Postcode</label>
          <input
            value={form.postcode ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value || null }))}
            placeholder="e.g. 59000"
            style={inputStyle}
          />
        </div>

        {/* JMB — licence prerequisite for condo sites */}
        <div>
          <label style={labelStyle}>JMB / MC Name</label>
          <input
            value={form.jmb_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, jmb_name: e.target.value || null }))}
            placeholder={isCondo ? 'Joint Management Body' : '—'}
            style={inputStyle}
          />
          {isCondo && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
              JMB/MC consent is a prerequisite of the ST EVCS licence.
            </div>
          )}
        </div>

        {/* Coordinates */}
        <div>
          <label style={labelStyle}>Latitude</label>
          <input
            type="number"
            step="any"
            value={form.lat ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, lat: e.target.value === '' ? null : Number(e.target.value) }))
            }
            placeholder="3.1290"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Longitude</label>
          <input
            type="number"
            step="any"
            value={form.lng ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, lng: e.target.value === '' ? null : Number(e.target.value) }))
            }
            placeholder="101.6790"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <div
          style={{
            fontSize: 12,
            color: C.error,
            fontWeight: 600,
            padding: '10px 12px',
            background: C.errorBg,
            borderRadius: 8,
          }}
        >
          {saveError}
        </div>
      )}

      {/* Actions — order locked: Delete → spacer → Cancel → Save. CLAUDE.md §11. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {!isNew &&
          onDelete &&
          (confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                Permanent — cannot be undone.
              </span>
              <button
                onClick={() => onDelete(location.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: C.error,
                  color: C.white,
                  fontFamily: 'Figtree',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: 'transparent',
                  color: C.slate,
                  fontFamily: 'Figtree',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: `1px solid ${C.errorBg}`,
                background: 'transparent',
                color: C.error,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          ))}
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.slate,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: canSave ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: canSave ? 'pointer' : isSaving ? 'wait' : 'not-allowed',
            opacity: canSave ? 1 : 0.6,
          }}
        >
          {isSaving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
