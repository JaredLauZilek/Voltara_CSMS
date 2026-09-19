import { useState } from 'react';
import { Badge, C, KPICard, STATUS_COLORS, Toolbar } from '@voltara/ui';
import { formatDate, formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useRemoveMember, useSetMemberRole, useTeam } from './hooks';
import { InviteModal } from './InviteModal';
import { ROLE_BADGE, ROLE_LABELS, TENANT_ROLES } from './types';
import type { TeamMember } from './types';

export function TeamScreen() {
  const { session, tenantRole } = useAuth();
  const { data: members = [], isLoading } = useTeam();
  const setRole = useSetMemberRole();
  const remove = useRemoveMember();
  const [showInvite, setShowInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const isAdmin = tenantRole === 'owner' || tenantRole === 'admin';
  const isOwner = tenantRole === 'owner';
  const error = setRole.error
    ? (setRole.error as Error).message
    : remove.error
      ? (remove.error as Error).message
      : null;

  const canManage = (m: TeamMember) =>
    isAdmin && m.user_id !== session.user.id && (isOwner || m.role !== 'owner');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Team" value={members.length} sub="People with access" accent />
        <KPICard
          label="Owners & Admins"
          value={members.filter((m) => m.role === 'owner' || m.role === 'admin').length}
          sub="Can change configuration"
        />
        <KPICard
          label="Operators"
          value={members.filter((m) => m.role === 'operator').length}
          sub="Run the network"
        />
        <KPICard
          label="Viewers"
          value={members.filter((m) => m.role === 'viewer').length}
          sub="Read-only"
        />
      </div>

      <Toolbar
        primaryLabel={isAdmin ? '+ Invite' : undefined}
        onPrimary={isAdmin ? () => setShowInvite(true) : undefined}
      />

      {error && (
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
          {error}
        </div>
      )}

      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {['Member', 'Role', 'Joined', 'Last sign-in', ''].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.slate,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const me = m.user_id === session.user.id;
              const manageable = canManage(m);
              return (
                <tr key={m.user_id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: C.green,
                          color: C.yellow,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {(m.email ?? '?')[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, color: C.ink }}>
                        {m.email}
                        {me && <span style={{ color: C.slate, fontWeight: 500 }}> · you</span>}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {manageable ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          setRole.mutate({ userId: m.user_id, role: e.target.value })
                        }
                        disabled={setRole.isPending}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          fontFamily: 'Figtree',
                          fontSize: 12,
                          fontWeight: 600,
                          background: C.white,
                          color: C.ink,
                        }}
                      >
                        {TENANT_ROLES.filter((r) => r !== 'owner' || isOwner).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge
                        status={ROLE_LABELS[m.role] ?? m.role}
                        override={STATUS_COLORS[ROLE_BADGE[m.role]]}
                      />
                    )}
                    {manageable && (
                      <span style={{ marginLeft: 8 }}>
                        <Badge
                          status={ROLE_LABELS[m.role] ?? m.role}
                          override={STATUS_COLORS[ROLE_BADGE[m.role]]}
                        />
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', color: C.slate }}>
                    {formatDate(m.joined_at)}
                  </td>
                  <td style={{ padding: '13px 16px', color: C.slate }}>
                    {m.last_sign_in_at ? formatDateTime(m.last_sign_in_at) : 'never'}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {manageable &&
                      (confirmRemove === m.user_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                            Remove access?
                          </span>
                          <button
                            onClick={() =>
                              remove.mutate(m.user_id, { onSuccess: () => setConfirmRemove(null) })
                            }
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: C.error,
                              color: C.white,
                              fontFamily: 'Figtree',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: `1px solid ${C.border}`,
                              background: 'transparent',
                              color: C.slate,
                              fontFamily: 'Figtree',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(m.user_id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: `1px solid ${C.errorBg}`,
                            background: 'transparent',
                            color: C.error,
                            fontFamily: 'Figtree',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && members.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No members found.
          </div>
        )}
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
