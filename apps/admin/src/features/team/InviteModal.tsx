import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { useInviteMember } from './hooks';
import { ROLE_HINTS, ROLE_LABELS, TENANT_ROLES } from './types';

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

export function InviteModal({ onClose }: { onClose: () => void }) {
  const { tenantRole } = useAuth();
  const invite = useInviteMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('operator');
  const [done, setDone] = useState<{ invited: boolean } | null>(null);

  const roles = TENANT_ROLES.filter((r) => r !== 'owner' || tenantRole === 'owner');
  const canSend = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && !invite.isPending;

  if (done) {
    return (
      <Modal title="Invitation sent" onClose={onClose} width={480}>
        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
          {done.invited ? (
            <>
              <strong>{email.trim()}</strong> has been emailed a link to set a password and sign in
              as {ROLE_LABELS[role].toLowerCase()}.
            </>
          ) : (
            <>
              <strong>{email.trim()}</strong> already had an account and has been added as{' '}
              {ROLE_LABELS[role].toLowerCase()} — they can sign in straight away.
            </>
          )}
        </div>
        <div style={{ display: 'flex' }}>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: C.green,
              color: C.white,
              fontFamily: 'Figtree',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite a team member"
      subtitle="They receive an email link to set their password"
      onClose={onClose}
      width={480}
    >
      <div>
        <label style={labelStyle}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          type="email"
          autoFocus
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Role</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {roles.map((r) => (
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
                name="role"
                checked={role === r}
                onChange={() => setRole(r)}
                style={{ accentColor: C.green, marginTop: 2 }}
              />
              <span>
                <strong style={{ color: C.ink }}>{ROLE_LABELS[r]}</strong>
                <span style={{ color: C.slate }}> — {ROLE_HINTS[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {invite.error && (
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
          {(invite.error as Error).message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            padding: '10px 20px',
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
        <button
          onClick={() => invite.mutate({ email: email.trim(), role }, { onSuccess: setDone })}
          disabled={!canSend}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: canSend ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: canSend ? 'pointer' : invite.isPending ? 'wait' : 'not-allowed',
            opacity: canSend ? 1 : 0.6,
          }}
        >
          {invite.isPending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Modal>
  );
}
