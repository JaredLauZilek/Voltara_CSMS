import { useEffect, useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useChargePoints } from '@/features/charge-points';
import { useCreateIssue, useDeleteIssue, useUpdateIssue } from './hooks';
import {
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
} from './types';
import type { Issue, IssueInsert } from './types';

interface Props {
  /** Existing issue to edit, or null for a new one. */
  issue: Issue | null;
  /** Preselects the charger when raised from a charger page. */
  presetChargePointId?: string | null;
  presetConnectorId?: number | null;
  onClose: () => void;
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

/**
 * Self-contained: owns its mutations so the charger detail page can raise an
 * issue without importing this feature's internals (barrel only, CLAUDE.md §4).
 */
export function IssueModal({
  issue,
  presetChargePointId = null,
  presetConnectorId = null,
  onClose,
}: Props) {
  const { tenantId, tenantRole, session } = useAuth();
  const { data: chargePoints = [] } = useChargePoints();
  const createMut = useCreateIssue();
  const updateMut = useUpdateIssue();
  const deleteMut = useDeleteIssue();
  const isNew = !issue;
  const canDelete = tenantRole === 'owner' || tenantRole === 'admin';

  const [form, setForm] = useState<Omit<IssueInsert, 'tenant_id' | 'opened_by'>>(() =>
    issue
      ? {
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          status: issue.status,
          charge_point_id: issue.charge_point_id,
          ocpp_connector_id: issue.ocpp_connector_id,
        }
      : {
          title: '',
          description: null,
          severity: 'medium',
          status: 'open',
          charge_point_id: presetChargePointId,
          ocpp_connector_id: presetConnectorId,
        },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    createMut.reset();
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave = !!form.title?.trim() && !isSaving;
  const saveError = createMut.error
    ? (createMut.error as Error).message
    : updateMut.error
      ? (updateMut.error as Error).message
      : deleteMut.error
        ? (deleteMut.error as Error).message
        : null;

  const selectedCp = chargePoints.find((cp) => cp.id === form.charge_point_id);

  const handleSave = () => {
    if (!canSave) return;
    const row = {
      ...form,
      title: form.title.trim(),
      description: form.description?.trim() || null,
    };
    if (isNew) {
      createMut.mutate(
        { ...row, tenant_id: tenantId, opened_by: session.user.id },
        { onSuccess: onClose },
      );
    } else {
      const resolvedNow =
        (row.status === 'resolved' || row.status === 'closed') && !issue.resolved_at;
      updateMut.mutate(
        {
          id: issue.id,
          patch: {
            ...row,
            resolved_at: resolvedNow ? new Date().toISOString() : issue.resolved_at,
          },
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      title={isNew ? 'Report an issue' : issue.title}
      subtitle={isNew ? undefined : `Opened ${formatDateTime(issue.created_at)}`}
      onClose={onClose}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Connector 2 stuck on Faulted after every session"
            style={inputStyle}
            autoFocus={isNew}
          />
        </div>

        <div>
          <label style={labelStyle}>Charger</label>
          <select
            value={form.charge_point_id ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                charge_point_id: e.target.value || null,
                ocpp_connector_id: null,
              }))
            }
            style={inputStyle}
          >
            <option value="">— Not charger-specific —</option>
            {chargePoints.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.name} · {cp.ocpp_identity}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Connector</label>
          <select
            value={form.ocpp_connector_id ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                ocpp_connector_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            disabled={!selectedCp}
            style={inputStyle}
          >
            <option value="">— Whole charger —</option>
            {selectedCp?.connectors.map((c) => (
              <option key={c.id} value={c.ocpp_connector_id}>
                Connector {c.ocpp_connector_id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Severity</label>
          <select
            value={form.severity ?? 'medium'}
            onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
            style={inputStyle}
          >
            {ISSUE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {ISSUE_SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Status</label>
          <select
            value={form.status ?? 'open'}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            style={inputStyle}
          >
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ISSUE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Details</label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="What happened, when, and what has been tried"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
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
          canDelete &&
          (confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                Permanent — cannot be undone.
              </span>
              <button
                onClick={() => deleteMut.mutate(issue.id, { onSuccess: onClose })}
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
          {isSaving ? 'Saving…' : isNew ? 'Report Issue' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
