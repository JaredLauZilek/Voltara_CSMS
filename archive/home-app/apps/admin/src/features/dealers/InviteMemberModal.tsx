import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { errorMessage } from '@/shared/lib/errors';
import {
  cancelButton,
  errorText,
  inputStyle,
  labelStyle,
  primaryButton,
  primaryState,
} from '@/shared/lib/styles';
import { useInviteDealerMember } from './hooks';
import { DEALER_ROLES, DEALER_ROLE_HINTS, DEALER_ROLE_LABELS } from './types';
import type { DealerRole } from './types';

export function InviteMemberModal({
  dealerId,
  dealerName,
  onClose,
}: {
  dealerId: string;
  dealerName: string;
  onClose: () => void;
}) {
  const invite = useInviteDealerMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<DealerRole>('installer');
  const [done, setDone] = useState<{ invited: boolean } | null>(null);

  const canSend = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && !invite.isPending;

  if (done) {
    return (
      <Modal title="Invitation sent" onClose={onClose} width={460}>
        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
          <strong>{email.trim()}</strong>{' '}
          {done.invited
            ? `has been emailed a link to set a password and sign in as ${DEALER_ROLE_LABELS[role].toLowerCase()} at ${dealerName}.`
            : `already had an account and has been added to ${dealerName} as ${DEALER_ROLE_LABELS[role].toLowerCase()}.`}
        </div>
        <div style={{ display: 'flex' }}>
          <button onClick={onClose} style={{ ...primaryButton, marginLeft: 'auto' }}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Invite to dealer" subtitle={dealerName} onClose={onClose} width={460}>
      <div>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@dealer.com.my"
          style={inputStyle}
          autoFocus
        />
      </div>
      <div>
        <label style={labelStyle}>Role</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DEALER_ROLES.map((r) => (
            <label
              key={r}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${role === r ? C.green : C.border}`,
                background: role === r ? C.honeydew : C.white,
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <input
                type="radio"
                name="dealer-role"
                checked={role === r}
                onChange={() => setRole(r)}
                style={{ accentColor: C.green, marginTop: 2 }}
              />
              <span>
                <strong style={{ color: C.ink }}>{DEALER_ROLE_LABELS[r]}</strong>
                <span style={{ color: C.slate }}> — {DEALER_ROLE_HINTS[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {invite.error && <div style={errorText}>{errorMessage(invite.error)}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={{ ...cancelButton, marginLeft: 'auto' }}>
          Cancel
        </button>
        <button
          onClick={() =>
            invite.mutate({ email: email.trim(), role, dealerId }, { onSuccess: setDone })
          }
          disabled={!canSend}
          style={primaryState(canSend, invite.isPending)}
        >
          {invite.isPending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Modal>
  );
}
