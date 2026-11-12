import { useState } from 'react';
import { Badge, C, KPICard, STATUS_COLORS, Toolbar } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { errorMessage } from '@/shared/lib/errors';
import { formatDate } from '@/shared/lib/format';
import {
  cancelButton,
  card,
  dangerButton,
  dangerOutlineButton,
  emptyState,
  errorText,
  rowStyle,
  smallButton,
  table,
  td,
  th,
} from '@/shared/lib/styles';
import { useRemoveStaff, useSetStaffRole, useTeam } from './hooks';
import { InviteModal } from './InviteModal';
import {
  DEALER_ROLE_LABELS,
  DEALER_ROLE_PILL,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  STAFF_ROLE_PILL,
} from './types';
import type { DealerRole, TeamPerson } from './types';

export function TeamScreen() {
  const { session, actor, isStaff, isStaffAdmin, isDealerAdmin } = useAuth();
  const { data: people = [], isLoading } = useTeam();
  const setRole = useSetStaffRole();
  const remove = useRemoveStaff();
  const [showInvite, setShowInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const me = session.user.id;
  const canInvite = isStaffAdmin || isDealerAdmin;
  const dealerName = people.find((p) => p.dealer_name)?.dealer_name ?? 'your dealer';
  const error = errorMessage(setRole.error) ?? errorMessage(remove.error);

  // Staff admins may change or remove anyone but themselves (staff_update_admin).
  const canManage = (p: TeamPerson) => isStaff && isStaffAdmin && p.user_id !== me;

  const roleOf = (p: TeamPerson) => (isStaff ? (p.staff_role ?? '') : (p.dealer_role ?? ''));
  const roleLabel = (role: string) =>
    isStaff ? (STAFF_ROLE_LABELS[role] ?? role) : (DEALER_ROLE_LABELS[role as DealerRole] ?? role);
  const rolePill = (role: string) => (isStaff ? STAFF_ROLE_PILL[role] : DEALER_ROLE_PILL[role]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label={isStaff ? 'Voltara staff' : 'Team'}
          value={people.length}
          sub={isStaff ? 'People with portal access' : dealerName}
          accent
        />
        {isStaff ? (
          <>
            <KPICard
              label="Admins"
              value={people.filter((p) => p.staff_role === 'admin').length}
              sub="Can change configuration"
            />
            <KPICard
              label="Support"
              value={people.filter((p) => p.staff_role === 'support').length}
              sub="Run the fleet"
            />
            <KPICard
              label="Viewers"
              value={people.filter((p) => p.staff_role === 'viewer').length}
              sub="Read-only"
            />
          </>
        ) : (
          <>
            <KPICard
              label="Dealer admins"
              value={people.filter((p) => p.dealer_role === 'dealer_admin').length}
              sub="Manage the dealer"
            />
            <KPICard
              label="Installers"
              value={people.filter((p) => p.dealer_role === 'installer').length}
              sub="Commission on site"
            />
            <KPICard
              label="Your role"
              value={actor.dealer_role ? DEALER_ROLE_LABELS[actor.dealer_role] : '—'}
              sub={session.user.email ?? ''}
            />
          </>
        )}
      </div>

      <Toolbar
        primaryLabel={canInvite ? '+ Invite' : undefined}
        onPrimary={canInvite ? () => setShowInvite(true) : undefined}
      />

      {error && <div style={errorText}>{error}</div>}

      <div style={card}>
        <table style={table}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {['Person', 'Role', 'Phone', 'Joined', ''].map((h, i) => (
                <th key={i} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const isMe = p.user_id === me;
              const role = roleOf(p);
              const manageable = canManage(p);
              const family = rolePill(role);
              return (
                <tr key={p.user_id} style={rowStyle}>
                  <td style={td}>
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
                        {(p.full_name || p.email || '?')[0]?.toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: C.ink }}>
                          {p.full_name || p.email || p.user_id.slice(0, 8)}
                          {isMe && <span style={{ color: C.slate, fontWeight: 500 }}> · you</span>}
                        </div>
                        <div style={{ fontSize: 11 }}>{p.email ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {manageable && (
                        <select
                          value={role}
                          onChange={(e) =>
                            setRole.mutate({ userId: p.user_id, role: e.target.value })
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
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {STAFF_ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                      <Badge
                        status={roleLabel(role)}
                        override={family ? STATUS_COLORS[family] : undefined}
                      />
                    </span>
                  </td>
                  <td style={td}>{p.phone ?? '—'}</td>
                  <td style={td}>{p.created_at ? formatDate(p.created_at) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {manageable &&
                      (confirmRemove === p.user_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                            Remove access?
                          </span>
                          <button
                            onClick={() =>
                              remove.mutate(p.user_id, { onSuccess: () => setConfirmRemove(null) })
                            }
                            disabled={remove.isPending}
                            style={{ ...dangerButton, ...smallButton }}
                          >
                            {remove.isPending ? 'Removing…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            style={{ ...cancelButton, ...smallButton }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(p.user_id)}
                          style={{ ...dangerOutlineButton, ...smallButton }}
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
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && people.length === 0 && <div style={emptyState}>No people found.</div>}
      </div>

      {showInvite && (
        <InviteModal
          target={
            isStaff
              ? { kind: 'staff' }
              : { kind: 'dealer', dealerId: actor.dealer_id ?? '', dealerName }
          }
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
