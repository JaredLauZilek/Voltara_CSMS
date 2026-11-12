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
import { DEALER_STATUSES, DEALER_STATUS_LABELS } from './types';
import type { Dealer, DealerFormRow } from './types';

interface Props {
  dealer: Dealer | null;
  /** Staff admins may change code, status and first-party; dealer admins only contact details. */
  canEditRestricted: boolean;
  onClose: () => void;
  onSave: (row: DealerFormRow) => void;
  isSaving?: boolean;
  saveError?: string | null;
}

export function DealerModal({
  dealer,
  canEditRestricted,
  onClose,
  onSave,
  isSaving,
  saveError,
}: Props) {
  const isNew = !dealer;
  const [form, setForm] = useState<DealerFormRow>(() =>
    dealer
      ? {
          code: dealer.code,
          name: dealer.name,
          phone: dealer.phone,
          email: dealer.email,
          is_first_party: dealer.is_first_party,
          status: dealer.status,
        }
      : { code: '', name: '', phone: null, email: null, is_first_party: false, status: 'active' },
  );
  const [fieldError, setFieldError] = useState('');

  const canSave = !!form.name.trim() && (!canEditRestricted || !!form.code.trim()) && !isSaving;

  const handleSave = () => {
    if (!form.name.trim()) {
      setFieldError('Name is required.');
      return;
    }
    if (canEditRestricted && !form.code.trim()) {
      setFieldError('Code is required.');
      return;
    }
    onSave({ ...form, name: form.name.trim(), code: form.code.trim().toUpperCase() });
  };

  return (
    <Modal
      title={isNew ? 'New dealer' : dealer.name}
      subtitle={isNew ? undefined : dealer.code}
      onClose={onClose}
      width={520}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Name</label>
          <input
            value={form.name}
            onChange={(e) => {
              setForm((f) => ({ ...f, name: e.target.value }));
              if (fieldError) setFieldError('');
            }}
            placeholder="e.g. EVOne Charging Sdn Bhd"
            style={inputStyle}
            autoFocus
          />
        </div>
        {canEditRestricted && (
          <div>
            <label style={labelStyle}>Code</label>
            <input
              value={form.code}
              onChange={(e) => {
                setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
                if (fieldError) setFieldError('');
              }}
              placeholder="e.g. EVONE"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
            <div style={hintStyle}>Short, unique, printed on paperwork.</div>
          </div>
        )}
        {canEditRestricted && !isNew && (
          <div>
            <label style={labelStyle}>Status</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {DEALER_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm((f) => ({ ...f, status: s }))}
                  style={optionPill(form.status === s)}
                >
                  {DEALER_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label style={labelStyle}>Phone</label>
          <input
            value={form.phone ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
            placeholder="+60 …"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={form.email ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
            placeholder="ops@dealer.com.my"
            style={inputStyle}
          />
        </div>
        {canEditRestricted && (
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
              checked={form.is_first_party}
              onChange={(e) => setForm((f) => ({ ...f, is_first_party: e.target.checked }))}
              style={{ accentColor: C.green }}
            />
            First-party (Voltara&apos;s own installation team)
          </label>
        )}
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
