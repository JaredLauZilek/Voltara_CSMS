import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, C, Modal, STATUS_COLORS } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import type { ChargerRow } from '@/features/chargers';
import { errorMessage } from '@/shared/lib/errors';
import { formatDateTime } from '@/shared/lib/format';
import {
  cancelButton,
  errorText,
  inputStyle,
  labelStyle,
  linkStyle,
  primaryState,
  secondaryButton,
  smallButton,
} from '@/shared/lib/styles';
import { useUpdateTicket } from './hooks';
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_PILL,
  isTicketStatus,
  ticketLabel,
} from './types';
import type { ProfileLite, Ticket, TicketStatus } from './types';

interface Props {
  ticket: Ticket;
  charger: ChargerRow | undefined;
  requester: ProfileLite | undefined;
  assignee: ProfileLite | undefined;
  onClose: () => void;
}

export function TicketModal({ ticket, charger, requester, assignee, onClose }: Props) {
  const { session, isStaffSupport } = useAuth();
  const update = useUpdateTicket();
  const [status, setStatus] = useState<TicketStatus>(
    isTicketStatus(ticket.status) ? ticket.status : 'open',
  );
  const [assignedTo, setAssignedTo] = useState<string | null>(ticket.assigned_to);

  const me = session.user.id;
  const dirty = status !== ticket.status || assignedTo !== ticket.assigned_to;
  const canSave = isStaffSupport && dirty && !update.isPending;
  const assigneeLabel =
    assignedTo === null
      ? 'Unassigned'
      : assignedTo === me
        ? 'You'
        : assignedTo === ticket.assigned_to
          ? assignee?.full_name || assignee?.email || 'Assigned'
          : 'Assigned';

  const save = () => {
    if (!canSave) return;
    update.mutate(
      { id: ticket.id, patch: { status, assigned_to: assignedTo } },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      title={ticket.subject}
      subtitle={`${requester?.full_name || requester?.email || 'Unknown requester'} · ${formatDateTime(ticket.created_at)}`}
      onClose={onClose}
      width={560}
    >
      <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {ticket.body || <span style={{ color: C.slate }}>No details given.</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Charger</label>
          {charger ? (
            <Link
              to={`/chargers/${charger.id}`}
              style={{ ...linkStyle, fontSize: 13 }}
              onClick={onClose}
            >
              {charger.serial} · {charger.name}
            </Link>
          ) : (
            <span style={{ fontSize: 13, color: C.slate }}>—</span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Assigned to</label>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink }}
          >
            {assigneeLabel}
            {isStaffSupport && assignedTo !== me && (
              <button
                onClick={() => setAssignedTo(me)}
                style={{ ...secondaryButton, ...smallButton }}
              >
                Assign to me
              </button>
            )}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          {isStaffSupport ? (
            <select
              value={status}
              onChange={(e) => {
                if (isTicketStatus(e.target.value)) setStatus(e.target.value);
              }}
              style={inputStyle}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <Badge
              status={ticketLabel(ticket.status)}
              override={
                isTicketStatus(ticket.status)
                  ? STATUS_COLORS[TICKET_STATUS_PILL[ticket.status]]
                  : undefined
              }
            />
          )}
        </div>
        <div>
          <label style={labelStyle}>Updated</label>
          <div style={{ fontSize: 13, color: C.ink }}>{formatDateTime(ticket.updated_at)}</div>
        </div>
      </div>

      {update.error && <div style={errorText}>{errorMessage(update.error)}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={{ ...cancelButton, marginLeft: 'auto' }}>
          {isStaffSupport ? 'Cancel' : 'Close'}
        </button>
        {isStaffSupport && (
          <button
            onClick={save}
            disabled={!canSave}
            style={primaryState(canSave, update.isPending)}
          >
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>
    </Modal>
  );
}
