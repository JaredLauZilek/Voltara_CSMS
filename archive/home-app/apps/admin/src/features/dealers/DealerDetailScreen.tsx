import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, C, STATUS_COLORS } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { LifecycleBadge, StateBadge, useChargers } from '@/features/chargers';
import { errorMessage } from '@/shared/lib/errors';
import { formatDate, formatRelative } from '@/shared/lib/format';
import {
  backLink,
  cancelButton,
  card,
  cardHeader,
  dangerButton,
  dangerOutlineButton,
  emptyState,
  errorText,
  linkStyle,
  paddedCard,
  rowStyle,
  secondaryButton,
  sectionTitle,
  smallButton,
  table,
  td,
  th,
} from '@/shared/lib/styles';
import { useDealer, useDealerPeople, useRemoveDealerMember, useUpdateDealer } from './hooks';
import { DealerModal } from './DealerModal';
import { InviteMemberModal } from './InviteMemberModal';
import { DEALER_ROLE_LABELS, DEALER_ROLE_PILL, DEALER_STATUS_LABELS } from './types';
import type { DealerFormRow, DealerRole } from './types';

export function DealerDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { actor, session, isStaffAdmin, isDealerAdmin } = useAuth();
  const { data: dealer, isLoading } = useDealer(id);
  const { data: people = [], isLoading: peopleLoading } = useDealerPeople(id);
  const { data: chargers = [] } = useChargers();
  const updateMut = useUpdateDealer();
  const removeMut = useRemoveDealerMember();
  const [showEdit, setShowEdit] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEdit]);

  const ownDealer = actor.dealer_id === id;
  const canEdit = isStaffAdmin || (isDealerAdmin && ownDealer);
  const dealerChargers = useMemo(() => chargers.filter((c) => c.dealer_id === id), [chargers, id]);

  if (isLoading) return <div style={emptyState}>Loading…</div>;
  if (!dealer) {
    return (
      <div style={emptyState}>
        Dealer not found.{' '}
        <Link to="/dealers" style={linkStyle}>
          Back to dealers
        </Link>
      </div>
    );
  }

  const handleSave = (row: DealerFormRow) => {
    // Dealer admins may only change contact details (dealers_guard_update).
    const patch = isStaffAdmin ? row : { name: row.name, phone: row.phone, email: row.email };
    updateMut.mutate({ id: dealer.id, patch }, { onSuccess: () => setShowEdit(false) });
  };

  const contact = [dealer.phone, dealer.email].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link to="/dealers" style={backLink}>
        ‹ Dealers
      </Link>

      <div
        style={{
          ...paddedCard,
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}
            >
              {dealer.name}
            </span>
            <Badge status={DEALER_STATUS_LABELS[dealer.status] ?? dealer.status} />
            {dealer.is_first_party && <Badge status="First-party" override={STATUS_COLORS.Sent} />}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
            <span style={{ fontFamily: 'monospace' }}>{dealer.code}</span>
            {contact ? ` · ${contact}` : ''} · since {formatDate(dealer.created_at)}
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowEdit(true)}
            style={{ ...secondaryButton, marginLeft: 'auto' }}
          >
            Edit
          </button>
        )}
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <span style={sectionTitle}>People</span>
          {canEdit && (
            <button
              onClick={() => setShowInvite(true)}
              style={{ ...secondaryButton, ...smallButton, marginLeft: 'auto' }}
            >
              + Invite
            </button>
          )}
        </div>
        {removeMut.error && (
          <div style={{ ...errorText, padding: '10px 24px 0' }}>
            {errorMessage(removeMut.error)}
          </div>
        )}
        <table style={table}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {['Person', 'Role', 'Phone', 'Added', ''].map((h, i) => (
                <th key={i} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const me = p.user_id === session.user.id;
              const role = p.dealer_role ?? '';
              const removable = canEdit && !me;
              return (
                <tr key={p.user_id} style={rowStyle}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: C.ink }}>
                      {p.full_name || p.email || p.user_id.slice(0, 8)}
                      {me && <span style={{ color: C.slate, fontWeight: 500 }}> · you</span>}
                    </div>
                    <div style={{ fontSize: 11 }}>{p.email ?? '—'}</div>
                  </td>
                  <td style={td}>
                    <Badge
                      status={DEALER_ROLE_LABELS[role as DealerRole] ?? role}
                      override={
                        DEALER_ROLE_PILL[role] ? STATUS_COLORS[DEALER_ROLE_PILL[role]] : undefined
                      }
                    />
                  </td>
                  <td style={td}>{p.phone ?? '—'}</td>
                  <td style={td}>{p.created_at ? formatDate(p.created_at) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {removable &&
                      (confirmRemove === p.user_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                            Remove access?
                          </span>
                          <button
                            onClick={() =>
                              removeMut.mutate(
                                { dealerId: dealer.id, userId: p.user_id },
                                { onSuccess: () => setConfirmRemove(null) },
                              )
                            }
                            disabled={removeMut.isPending}
                            style={{ ...dangerButton, ...smallButton }}
                          >
                            {removeMut.isPending ? 'Removing…' : 'Confirm'}
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
        {!peopleLoading && people.length === 0 && <div style={emptyState}>No people yet.</div>}
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <span style={sectionTitle}>Chargers</span>
          <Link
            to={`/chargers?dealer=${dealer.id}`}
            style={{ ...linkStyle, marginLeft: 'auto', fontSize: 12 }}
          >
            Filter the fleet ›
          </Link>
        </div>
        <table style={table}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {['Charger', 'Lifecycle', 'Owner', 'Last seen', 'Site'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dealerChargers.map((c) => (
              <tr
                key={c.id}
                style={{ ...rowStyle, cursor: 'pointer' }}
                onClick={() => navigate(`/chargers/${c.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={td}>
                  <div style={{ fontWeight: 600, color: C.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.serial}</div>
                </td>
                <td style={td}>
                  <LifecycleBadge lifecycle={c.lifecycle} />
                </td>
                <td style={td}>{c.owner_name ?? c.owner_email ?? '—'}</td>
                <td style={td}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
                  >
                    <StateBadge row={c} />
                    <span>{formatRelative(c.last_seen_at)}</span>
                  </div>
                </td>
                <td style={td}>{[c.site_label, c.city].filter(Boolean).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dealerChargers.length === 0 && <div style={emptyState}>No chargers found.</div>}
      </div>

      {showEdit && (
        <DealerModal
          dealer={dealer}
          canEditRestricted={isStaffAdmin}
          onClose={() => setShowEdit(false)}
          onSave={handleSave}
          isSaving={updateMut.isPending}
          saveError={errorMessage(updateMut.error)}
        />
      )}
      {showInvite && (
        <InviteMemberModal
          dealerId={dealer.id}
          dealerName={dealer.name}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
