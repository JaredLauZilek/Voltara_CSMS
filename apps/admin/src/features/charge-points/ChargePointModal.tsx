import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { useLocations } from '@/features/locations';
import { SECURITY_PROFILES } from './types';
import type { ChargePointUpdate, ChargePointWithConnectors } from './types';

interface Props {
  chargePoint: ChargePointWithConnectors;
  onClose: () => void;
  onSave: (patch: ChargePointUpdate) => void;
  onDelete: () => void;
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

export function ChargePointModal({
  chargePoint,
  onClose,
  onSave,
  onDelete,
  isSaving,
  saveError,
}: Props) {
  const { data: locations = [] } = useLocations();
  const [name, setName] = useState(chargePoint.name);
  const [locationId, setLocationId] = useState(chargePoint.location_id ?? '');
  const [securityProfile, setSecurityProfile] = useState<number>(chargePoint.security_profile);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canSave = name.trim().length > 0 && !isSaving;

  const handleSave = () => {
    if (!canSave) return;
    // Only the editable columns — never echo back server-managed runtime state
    // (PostgREST silently drops unknown keys and the update "succeeds").
    onSave({
      name: name.trim(),
      location_id: locationId || null,
      security_profile: securityProfile,
    });
  };

  return (
    <Modal title={chargePoint.name} subtitle={chargePoint.ocpp_identity} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Charger Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Site</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Unassigned —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Connection security</label>
          <select
            value={securityProfile}
            onChange={(e) => setSecurityProfile(Number(e.target.value))}
            style={inputStyle}
          >
            {SECURITY_PROFILES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>
            {SECURITY_PROFILES.find((p) => p.value === securityProfile)?.hint ??
              'Applies at the charger&apos;s next reconnect.'}{' '}
            Applies at the next reconnect.
          </div>
        </div>
      </div>

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

      {/* Button order locked: Delete → spacer → Cancel → Save. CLAUDE.md §11. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
              Deletes its sessions and logs too. Permanent.
            </span>
            <button
              onClick={onDelete}
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
        )}
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
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
