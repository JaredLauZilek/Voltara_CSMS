import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { useUpsertTaxProfile } from './hooks';
import type { TaxProfile } from './types';

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
 * SST is stored as a rate per tenant, applied per line, never folded into a
 * price. Changing it here affects sessions that START after the change;
 * issued documents keep the rate they were issued with (CLAUDE.md §13).
 */
export function TaxProfileModal({
  profile,
  onClose,
}: {
  profile: TaxProfile | null;
  onClose: () => void;
}) {
  const upsert = useUpsertTaxProfile();
  const [name, setName] = useState(profile?.name ?? 'SST');
  const [code, setCode] = useState(profile?.code ?? 'SST');
  const [rate, setRate] = useState(profile ? String(profile.rate_bps / 100) : '0');
  const [isDefault, setIsDefault] = useState(profile?.is_default ?? true);
  const rateBps = Math.round((Number(rate) || 0) * 100);
  const canSave = name.trim().length > 0 && rateBps >= 0 && rateBps <= 10_000 && !upsert.isPending;

  return (
    <Modal
      title={profile ? 'Edit tax rate' : 'New tax rate'}
      subtitle="Applied as a separate line on every receipt and invoice"
      onClose={onClose}
      width={480}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Code on documents</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Rate (%)</label>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>
        <label
          style={{
            gridColumn: '1/-1',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: C.slate,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            style={{ accentColor: C.green }}
          />
          Default for new tariff versions
        </label>
      </div>
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6 }}>
        SST on EV charging is unresolved in Malaysia. Keep 0% until the position is confirmed; when
        it changes, only sessions started afterwards are affected, and every document keeps the rate
        it was issued with.
      </div>
      {upsert.error && (
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
          {(upsert.error as Error).message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
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
          onClick={() =>
            upsert.mutate(
              {
                ...(profile ? { id: profile.id } : {}),
                name: name.trim(),
                code: code.trim() || 'SST',
                rate_bps: rateBps,
                is_default: isDefault,
              },
              { onSuccess: onClose },
            )
          }
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
            cursor: canSave ? 'pointer' : upsert.isPending ? 'wait' : 'not-allowed',
            opacity: canSave ? 1 : 0.6,
          }}
        >
          {upsert.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
