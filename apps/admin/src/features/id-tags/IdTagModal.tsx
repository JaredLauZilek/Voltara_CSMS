import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { ID_TAG_KINDS, ID_TAG_STATUSES, KIND_LABELS, STATUS_LABELS } from './types';
import type { IdTag, IdTagInsert } from './types';

type FormRow = Omit<IdTagInsert, 'tenant_id'>;

interface Props {
  idTag: IdTag | null;
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

/** Local datetime → ISO for timestamptz, and back for the input. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function IdTagModal({ idTag, onClose, onSave, onDelete, isSaving, saveError }: Props) {
  const isNew = !idTag;
  const [form, setForm] = useState<FormRow>(() => {
    if (idTag) {
      const { id: _id, tenant_id: _t, created_at: _c, driver_user_id: _d, ...rest } = idTag;
      return rest;
    }
    return {
      tag: '',
      label: null,
      kind: 'rfid',
      status: 'active',
      expires_at: null,
      parent_tag: null,
    };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagError, setTagError] = useState('');

  const canSave = !!form.tag?.trim() && !isSaving;

  const handleSave = () => {
    const tag = form.tag?.trim() ?? '';
    if (!tag) return setTagError('The tag value is required.');
    // OCPP 1.6 idTag is at most 20 characters — a longer one can never authorise.
    if (tag.length > 20) return setTagError('An OCPP idTag is at most 20 characters.');
    onSave({
      ...form,
      tag,
      label: form.label?.trim() || null,
      parent_tag: form.parent_tag?.trim() || null,
    });
  };

  return (
    <Modal
      title={isNew ? 'New ID tag' : (idTag?.tag ?? '')}
      subtitle={isNew ? undefined : (idTag?.label ?? undefined)}
      onClose={onClose}
      width={520}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Tag (as the charger reads it)</label>
          <input
            value={form.tag ?? ''}
            onChange={(e) => {
              setForm((f) => ({ ...f, tag: e.target.value.toUpperCase() }));
              if (tagError) setTagError('');
            }}
            placeholder="e.g. 04A2B3C4D5E6F7"
            disabled={!isNew}
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              borderColor: tagError ? C.error : C.border,
              background: isNew ? C.white : C.seasalt,
            }}
          />
          {tagError ? (
            <div style={{ fontSize: 11, color: C.error, marginTop: 4 }}>{tagError}</div>
          ) : (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
              {isNew
                ? 'Case-insensitive on most readers; stored upper-case. Cannot be changed later.'
                : 'The tag value cannot be changed — add a new tag instead.'}
            </div>
          )}
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Label</label>
          <input
            value={form.label ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Who or what this tag belongs to"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Kind</label>
          <select
            value={form.kind ?? 'rfid'}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            style={inputStyle}
          >
            {ID_TAG_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select
            value={form.status ?? 'active'}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            style={inputStyle}
          >
            {ID_TAG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Expires</label>
          <input
            type="datetime-local"
            value={toLocalInput(form.expires_at)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              }))
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Parent tag</label>
          <input
            value={form.parent_tag ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, parent_tag: e.target.value.toUpperCase() }))}
            placeholder="Optional group tag"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
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
        {!isNew &&
          onDelete &&
          (confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                Permanent — cannot be undone.
              </span>
              <button
                onClick={() => onDelete(idTag.id)}
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
