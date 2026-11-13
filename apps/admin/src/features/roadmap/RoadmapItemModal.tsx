import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import {
  PRIORITY_LABELS,
  ROADMAP_AREAS,
  ROADMAP_PRIORITIES,
  ROADMAP_STATUSES,
  STATUS_META,
  type RoadmapArea,
  type RoadmapItem,
} from './types';

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

export function RoadmapItemModal({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: RoadmapItem;
  onClose: () => void;
  onSave: (item: RoadmapItem) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState(item);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canSave = form.title.trim().length > 0;

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 99,
    border: `2px solid ${active ? C.green : C.border}`,
    background: active ? C.honeydew : C.white,
    color: active ? C.green : C.slate,
    fontFamily: 'Figtree',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <Modal title="Roadmap item" subtitle={STATUS_META[item.status].label} onClose={onClose}>
      <div>
        <label style={labelStyle}>Title</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave({ ...form, title: form.title.trim() });
          }}
          style={inputStyle}
          autoFocus
        />
      </div>

      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={4}
          placeholder="What it is, why it matters, what done looks like"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Area</label>
          <select
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value as RoadmapArea }))}
            style={inputStyle}
          >
            {ROADMAP_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Priority</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {ROADMAP_PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => setForm((f) => ({ ...f, priority: p }))}
                style={pill(form.priority === p)}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Stage</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROADMAP_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setForm((f) => ({ ...f, status: s }))}
              style={pill(form.status === s)}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Button order locked: Delete → spacer → Cancel → Save. CLAUDE.md §11. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
              Permanent — cannot be undone.
            </span>
            <button
              onClick={() => onDelete(item.id)}
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
          onClick={() => onSave({ ...form, title: form.title.trim() })}
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
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.6,
          }}
        >
          Save Changes
        </button>
      </div>
    </Modal>
  );
}
