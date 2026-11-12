import { useState } from 'react';
import { C, Modal, SearchableSelect } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { errorMessage } from '@/shared/lib/errors';
import {
  cancelButton,
  errorText,
  hintStyle,
  inputStyle,
  labelStyle,
  primaryButton,
  primaryState,
  secondaryButton,
} from '@/shared/lib/styles';
import { useChargerModels, useDealerOptions, useRegisterCharger } from './hooks';
import type { RegisteredCharger } from './types';

export function RegisterChargerModal({ onClose }: { onClose: () => void }) {
  const { isStaff } = useAuth();
  const { data: models = [] } = useChargerModels();
  // Dealers register into their own dealer (the RPC enforces it); only staff pick one.
  const { data: dealers = [] } = useDealerOptions(isStaff);
  const register = useRegisterCharger();
  const [modelId, setModelId] = useState<string | null>(null);
  const [serial, setSerial] = useState('');
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [registered, setRegistered] = useState<RegisteredCharger | null>(null);

  const codeValid = claimCode === '' || /^\d{6}$/.test(claimCode);
  const canSubmit = !!modelId && serial.trim().length >= 3 && codeValid && !register.isPending;

  const submit = () => {
    if (!modelId || !canSubmit) return;
    register.mutate(
      {
        serial: serial.trim().toUpperCase(),
        modelId,
        dealerId: isStaff ? dealerId : null,
        claimCode: claimCode || null,
        name: name.trim() || null,
      },
      { onSuccess: setRegistered },
    );
  };

  if (registered) return <ClaimCodeStep charger={registered} onClose={onClose} />;

  return (
    <Modal
      title="Register charger"
      subtitle="Creates the unit and its one-time claim code"
      onClose={onClose}
      width={520}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Model</label>
          <SearchableSelect
            options={models.map((m) => ({
              value: m.id,
              label: m.name,
              meta: `${m.brand} ${m.model}`,
            }))}
            value={modelId}
            onChange={setModelId}
            placeholder="Select a model…"
          />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Serial</label>
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
            placeholder="As printed on the unit"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            autoFocus
          />
        </div>
        {isStaff && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Dealer</label>
            <SearchableSelect
              options={dealers.map((d) => ({ value: d.id, label: d.name, meta: d.code }))}
              value={dealerId}
              onChange={setDealerId}
              nullable
              nullLabel="— No dealer (Voltara direct) —"
              placeholder="Select a dealer…"
            />
          </div>
        )}
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home charger"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Claim code</label>
          <input
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Leave blank to generate"
            inputMode="numeric"
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              borderColor: codeValid ? C.border : C.error,
            }}
          />
          <div style={hintStyle}>Six digits. Blank generates one.</div>
        </div>
      </div>

      {register.error && <div style={errorText}>{errorMessage(register.error)}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={{ ...cancelButton, marginLeft: 'auto' }}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={primaryState(canSubmit, register.isPending)}
        >
          {register.isPending ? 'Registering…' : 'Register'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * The claim code is displayed here and nowhere else. It is stored only as a
 * bcrypt hash (CLAUDE.md §7), so this is the single moment it is readable.
 */
function ClaimCodeStep({ charger, onClose }: { charger: RegisteredCharger; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(charger.claimCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked without https or permission; the code is on
      // screen and selectable, which always works.
    }
  };

  return (
    <Modal title="Charger registered" subtitle={charger.serial} onClose={onClose} width={480}>
      <div
        style={{
          background: C.warningBg,
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 12,
          color: C.warning,
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        This claim code is shown once. It is stored only as a hash — write it on the card that ships
        with the unit before closing.
      </div>
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={labelStyle}>Claim code</div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: '0.25em',
            color: C.green,
            fontFamily: 'monospace',
          }}
        >
          {charger.claimCode}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={copy} style={secondaryButton}>
          {copied ? '✓ Copied' : 'Copy code'}
        </button>
        <button onClick={onClose} style={primaryButton}>
          Done
        </button>
      </div>
    </Modal>
  );
}
