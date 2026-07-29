import { useEffect, useMemo, useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { useLocations } from '@/features/locations';
import { useChargePointWatch, useRegisterChargePoint } from './hooks';
import { CONNECTOR_TYPES, type RegisteredCharger } from './types';

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  'wss://voltara-gateway-staging.fly.dev';

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

/** Mirrors the identity derivation in register_charge_point(). */
function deriveIdentity(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function AddChargerModal({ onClose }: { onClose: () => void }) {
  const { data: locations = [] } = useLocations();
  const registerMut = useRegisterChargePoint();

  const [name, setName] = useState('');
  const [identityTouched, setIdentityTouched] = useState(false);
  const [identity, setIdentity] = useState('');
  const [locationId, setLocationId] = useState<string>('');
  const [connectorCount, setConnectorCount] = useState(1);
  const [connectorType, setConnectorType] = useState<string>('Type2');
  const [maxKw, setMaxKw] = useState('');
  const [registered, setRegistered] = useState<RegisteredCharger | null>(null);

  // The identity tracks the name until the operator edits it themselves —
  // it has to be typed into the charger by hand, so a sane default matters.
  const effectiveIdentity = identityTouched ? identity : deriveIdentity(name);

  const canSubmit =
    name.trim().length > 0 && effectiveIdentity.length >= 3 && !registerMut.isPending;

  const submit = () => {
    if (!canSubmit) return;
    registerMut.mutate(
      {
        name: name.trim(),
        locationId: locationId || null,
        ocppIdentity: effectiveIdentity,
        connectorCount,
        connectorType,
        maxKw: maxKw ? Number(maxKw) : null,
      },
      { onSuccess: setRegistered },
    );
  };

  if (registered) {
    return (
      <CredentialsStep charger={registered} connectorCount={connectorCount} onClose={onClose} />
    );
  }

  return (
    <Modal
      title="Add Charger"
      subtitle="Generates the credentials to enter on the unit"
      onClose={onClose}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Charger Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vantage Bay 1"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Charge Point ID</label>
          <input
            value={effectiveIdentity}
            onChange={(e) => {
              setIdentityTouched(true);
              setIdentity(e.target.value.toUpperCase());
            }}
            placeholder="VANTAGE-BAY-1"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
          <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>
            This exact value must be entered on the charger. It cannot be changed later, and it must
            be unique across every operator on the platform.
          </div>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Site</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Unassigned —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Connectors</label>
          <input
            type="number"
            min={1}
            max={16}
            value={connectorCount}
            onChange={(e) =>
              setConnectorCount(Math.max(1, Math.min(16, Number(e.target.value) || 1)))
            }
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Connector Type</label>
          <select
            value={connectorType}
            onChange={(e) => setConnectorType(e.target.value)}
            style={inputStyle}
          >
            {CONNECTOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Rated Power (kW)</label>
          <input
            type="number"
            step="any"
            value={maxKw}
            onChange={(e) => setMaxKw(e.target.value)}
            placeholder="7.4"
            style={inputStyle}
          />
        </div>
      </div>

      {registerMut.error && (
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
          {(registerMut.error as Error).message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={cancelButton}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...primaryButton,
            marginLeft: 0,
            background: canSubmit ? C.green : C.slate,
            cursor: canSubmit ? 'pointer' : registerMut.isPending ? 'wait' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {registerMut.isPending ? 'Registering…' : 'Register Charger'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * The key is displayed here and nowhere else, ever. It is stored only as a
 * bcrypt hash, so this screen is the single moment it exists in readable form —
 * hence the warning, the copy buttons, and no "close" until it is acknowledged.
 */
function CredentialsStep({
  charger,
  connectorCount,
  onClose,
}: {
  charger: RegisteredCharger;
  connectorCount: number;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const { data: watched } = useChargePointWatch(charger.chargePointId, true);

  const connected = watched?.connection_state === 'online';
  const everBooted = watched?.lifecycle === 'active';

  const serverUrl = `${GATEWAY_URL.replace(/\/$/, '')}/ocpp`;

  return (
    <Modal
      title="Charger registered"
      subtitle={`${charger.ocppIdentity} · ${connectorCount} connector${connectorCount > 1 ? 's' : ''}`}
      onClose={onClose}
      width={620}
    >
      <div
        style={{
          background: C.warningBg,
          border: `1px solid ${C.warning}33`,
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 12,
          color: C.warning,
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        The key below is shown once. It is stored only as a hash — if it is lost, register the
        charger again rather than trying to recover it.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <CopyRow label="Server URL" value={serverUrl} />
        <CopyRow label="Charge Point ID" value={charger.ocppIdentity} mono />
        <CopyRow label="Basic Auth username" value={charger.ocppIdentity} mono />
        <CopyRow label="Password / AuthorizationKey" value={charger.authKey} mono />
      </div>

      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6 }}>
        Set the charger to <strong>OCPP 1.6J</strong> and <strong>security profile 2</strong> (TLS
        with Basic Auth). Some firmware wants the ID appended to the URL instead of in its own
        field: <code style={{ fontSize: 11 }}>{`${serverUrl}/${charger.ocppIdentity}`}</code>
      </div>

      <ConnectionWatch connected={connected} everBooted={everBooted} watched={watched} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label
          style={{
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
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ accentColor: C.green, cursor: 'pointer' }}
          />
          I have saved the key
        </label>
        <button
          onClick={onClose}
          disabled={!acknowledged}
          style={{
            ...primaryButton,
            background: acknowledged ? C.green : C.slate,
            cursor: acknowledged ? 'pointer' : 'not-allowed',
            opacity: acknowledged ? 1 : 0.6,
          }}
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

/** Live feedback so commissioning is a closed loop, not a leap of faith. */
function ConnectionWatch({
  connected,
  everBooted,
  watched,
}: {
  connected: boolean;
  everBooted: boolean;
  watched:
    | {
        vendor_reported: string | null;
        model_reported: string | null;
        firmware_version: string | null;
      }
    | null
    | undefined;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const detail = useMemo(() => {
    if (!watched) return null;
    return [watched.vendor_reported, watched.model_reported, watched.firmware_version]
      .filter(Boolean)
      .join(' · ');
  }, [watched]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 12,
        background: connected ? C.honeydew : C.seasalt,
        border: `1px solid ${connected ? C.green : C.border}`,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 99,
          background: connected ? C.green : C.slate,
          flexShrink: 0,
          animation: connected ? undefined : 'voltara-pulse 1.4s ease-in-out infinite',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: connected ? C.green : C.ink }}>
          {connected ? 'Charger connected' : 'Waiting for the charger to connect…'}
        </div>
        <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
          {connected
            ? (detail ?? 'Reported in and authenticated.')
            : everBooted
              ? 'It has connected before but is currently offline.'
              : `Enter the settings above on the unit and power-cycle it. ${elapsed}s elapsed.`}
        </div>
      </div>
    </div>
  );
}

function CopyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked without https or permission; the value is on
      // screen and selectable, which is the fallback that always works.
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ ...labelStyle, marginBottom: 0, width: 190, flexShrink: 0 }}>{label}</span>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          padding: '9px 12px',
          borderRadius: 8,
          background: C.seasalt,
          border: `1px solid ${C.border}`,
          fontSize: 12,
          fontFamily: mono ? 'monospace' : 'Figtree',
          color: C.ink,
          overflow: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </code>
      <button
        onClick={copy}
        style={{
          flexShrink: 0,
          padding: '7px 12px',
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: copied ? C.honeydew : C.white,
          color: copied ? C.green : C.slate,
          fontFamily: 'Figtree',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
}

const cancelButton: React.CSSProperties = {
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
};

const primaryButton: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: 10,
  border: 'none',
  color: C.white,
  fontFamily: 'Figtree',
  fontSize: 13,
  fontWeight: 700,
  marginLeft: 'auto',
};
