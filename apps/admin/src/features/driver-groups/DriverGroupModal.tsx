import { useEffect, useState } from 'react';
import { Badge, C, Modal } from '@voltara/ui';
import { useBillingAccounts } from '@/features/billing-accounts';
import { useIdTags } from '@/features/id-tags';
import {
  useAddMember,
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useRemoveMember,
  useUpdateGroup,
} from './hooks';
import { GROUP_KINDS, GROUP_KIND_LABELS } from './types';
import type { DriverGroupWithCount } from './types';

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

/** A whitelist: members by RFID/virtual tag or by billing account (all of an account's tags). */
export function DriverGroupModal({
  group,
  onClose,
}: {
  group: DriverGroupWithCount | null;
  onClose: () => void;
}) {
  const isNew = !group;
  const createMut = useCreateGroup();
  const updateMut = useUpdateGroup();
  const deleteMut = useDeleteGroup();
  const [name, setName] = useState(group?.name ?? '');
  const [kind, setKind] = useState(group?.kind ?? 'residents');
  const [description, setDescription] = useState(group?.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    createMut.reset();
    updateMut.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave = name.trim().length > 0 && !isSaving;
  const error = createMut.error ?? updateMut.error ?? deleteMut.error;

  const save = () => {
    const row = { name: name.trim(), kind, description: description.trim() || null };
    if (isNew) createMut.mutate(row, { onSuccess: onClose });
    else updateMut.mutate({ id: group.id, patch: row }, { onSuccess: onClose });
  };

  return (
    <Modal
      title={isNew ? 'New driver group' : group.name}
      subtitle={
        isNew
          ? 'A whitelist that can carry its own tariff'
          : `${group.member_count} member${group.member_count === 1 ? '' : 's'}`
      }
      onClose={onClose}
      width={640}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vantage residents"
            autoFocus={isNew}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
            {GROUP_KINDS.map((k) => (
              <option key={k} value={k}>
                {GROUP_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Notes</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
      </div>

      {!isNew && <Members groupId={group.id} />}

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
          {(error as Error).message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {!isNew &&
          (confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.error, fontWeight: 600 }}>
                Removes its tariff assignments too. Permanent.
              </span>
              <button
                onClick={() => deleteMut.mutate(group.id, { onSuccess: onClose })}
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
          onClick={save}
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

function Members({ groupId }: { groupId: string }) {
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: tags = [] } = useIdTags();
  const { data: accounts = [] } = useBillingAccounts();
  const add = useAddMember(groupId);
  const remove = useRemoveMember();
  const [mode, setMode] = useState<'tag' | 'account'>('tag');
  const [pick, setPick] = useState('');
  const usedTags = new Set(members.map((m) => m.id_tag_id));
  const usedAccounts = new Set(members.map((m) => m.billing_account_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={labelStyle}>Members</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'tag' | 'account');
            setPick('');
          }}
          style={{ ...inputStyle, width: 150 }}
        >
          <option value="tag">ID tag</option>
          <option value="account">Billing account</option>
        </select>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={inputStyle}>
          <option value="">— Choose —</option>
          {mode === 'tag'
            ? tags
                .filter((t) => !usedTags.has(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label ? `${t.label} · ${t.tag}` : t.tag}
                  </option>
                ))
            : accounts
                .filter((a) => !usedAccounts.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
        </select>
        <button
          onClick={() =>
            pick &&
            add.mutate(mode === 'tag' ? { id_tag_id: pick } : { billing_account_id: pick }, {
              onSuccess: () => setPick(''),
            })
          }
          disabled={!pick || add.isPending}
          style={{
            padding: '9px 16px',
            borderRadius: 10,
            border: 'none',
            background: pick ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: pick ? 'pointer' : 'not-allowed',
            opacity: pick ? 1 : 0.6,
            whiteSpace: 'nowrap',
          }}
        >
          Add
        </button>
      </div>
      {add.error && (
        <div style={{ fontSize: 12, color: C.error }}>{(add.error as Error).message}</div>
      )}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {members.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.slate, fontSize: 13 }}>
            No members yet.
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderBottom: `1px solid ${C.divider}`,
                fontSize: 13,
              }}
            >
              <Badge
                status={m.id_tag_id ? 'Active' : 'Charging'}
                override={m.id_tag_id ? undefined : { bg: C.infoBg, color: C.info }}
              />
              <span
                style={{
                  fontWeight: 600,
                  color: C.ink,
                  fontFamily: m.id_tag_id ? 'monospace' : 'Figtree',
                  fontSize: m.id_tag_id ? 12 : 13,
                }}
              >
                {m.id_tag_id ? m.tag : m.account_name}
              </span>
              {m.tag_label && <span style={{ color: C.slate }}>{m.tag_label}</span>}
              <button
                onClick={() => remove.mutate(m.id)}
                style={{
                  marginLeft: 'auto',
                  border: 'none',
                  background: 'transparent',
                  color: C.slate,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
