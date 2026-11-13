import { useEffect, useMemo, useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { useChargePointWatch, useRegisterChargePoint } from './hooks';
import { GunRows, ModelPicker, SitePicker, resizeGuns } from './ChargerFields';
import {
  SECURITY_PROFILES,
  gatewayDisplayHost,
  type ChargerModel,
  type GunInput,
  type RegisteredCharger,
} from './types';

const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'wss://ocpp.voltaracharging.com';

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
 * Mirrors register_charge_point(): many installers set a charger's OCPP ID to
 * its serial number, so the ID defaults to the serial.
 */
function deriveIdentity(serial: string): string {
  return serial
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function AddChargerModal({ onClose }: { onClose: () => void }) {
  const registerMut = useRegisterChargePoint();

  const [serial, setSerial] = useState('');
  const [identityTouched, setIdentityTouched] = useState(false);
  const [identity, setIdentity] = useState('');
  const [locationId, setLocationId] = useState<string>('');
  const [modelId, setModelId] = useState<string | null>(null);
  const [guns, setGuns] = useState<GunInput[]>([{ connectorType: 'Type2', parkingLot: '' }]);
  const [maxKw, setMaxKw] = useState('');
  const [securityProfile, setSecurityProfile] = useState<0 | 1 | 2>(2);
  const [registered, setRegistered] = useState<RegisteredCharger | null>(null);

  // The identity tracks the serial until the operator edits it themselves —
  // it has to match what is set on the charger, so a sane default matters.
  const effectiveIdentity = identityTouched ? identity : deriveIdentity(serial);

  // A catalogue model prefills the gun layout and power; everything stays
  // editable, and lots already typed are kept.
  const pickModel = (m: ChargerModel | null) => {
    setModelId(m?.id ?? null);
    if (!m) return;
    const types = m.connector_types.length ? m.connector_types : ['Type2'];
    setGuns(
      Array.from({ length: m.connector_count }, (_, i) => ({
        connectorType: types[Math.min(i, types.length - 1)]!,
        parkingLot: guns[i]?.parkingLot ?? '',
      })),
    );
    if (m.power_kw != null) setMaxKw(String(m.power_kw));
  };

  const canSubmit =
    serial.trim().length > 0 && effectiveIdentity.length >= 3 && !registerMut.isPending;

  const submit = () => {
    if (!canSubmit) return;
    registerMut.mutate(
      {
        serialNumber: serial.trim(),
        locationId: locationId || null,
        ocppIdentity: effectiveIdentity,
        modelId,
        guns,
        maxKw: maxKw ? Number(maxKw) : null,
        securityProfile,
      },
      { onSuccess: setRegistered },
    );
  };

  if (registered) {
    return (
      <CredentialsStep
        charger={registered}
        gunCount={guns.length}
        securityProfile={securityProfile}
        onClose={onClose}
      />
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
          <label style={labelStyle}>Serial number</label>
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="As printed on the charger's label"
            maxLength={64}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
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
            placeholder="Defaults to the serial number"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
          <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>
            Defaults to the serial number, which many chargers use as their ID. This exact value
            must be set on the charger; it cannot be changed later and must be unique across every
            operator on the platform.
          </div>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Site</label>
          <SitePicker value={locationId || null} onChange={(id) => setLocationId(id ?? '')} />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Brand & model</label>
          <ModelPicker value={modelId} onChange={pickModel} />
        </div>

        <div>
          <label style={labelStyle}>Guns</label>
          <input
            type="number"
            min={1}
            max={16}
            value={guns.length}
            onChange={(e) =>
              setGuns(resizeGuns(guns, Math.max(1, Math.min(16, Number(e.target.value) || 1))))
            }
            style={inputStyle}
          />
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

        <div style={{ gridColumn: '1/-1' }}>
          <GunRows guns={guns} onChange={setGuns} />
        </div>

        {/* The security ladder. Profile 2 is the default and the production
            floor; 0 exists because it is how the incumbent networks run and a
            charger that cannot get online teaches nobody anything. */}
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Connection security</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SECURITY_PROFILES.map((p) => (
              <label
                key={p.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${securityProfile === p.value ? C.green : C.border}`,
                  background: securityProfile === p.value ? C.honeydew : C.white,
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <input
                  type="radio"
                  name="security-profile"
                  checked={securityProfile === p.value}
                  onChange={() => setSecurityProfile(p.value)}
                  style={{ accentColor: C.green, cursor: 'pointer', marginTop: 2 }}
                />
                <span>
                  <strong style={{ color: C.ink }}>{p.label}</strong>
                  <span style={{ color: C.slate }}> — {p.hint}</span>
                </span>
              </label>
            ))}
          </div>
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
 * An open (profile 0) charger has no key: no warning, nothing to acknowledge.
 */
function CredentialsStep({
  charger,
  gunCount,
  securityProfile,
  onClose,
}: {
  charger: RegisteredCharger;
  gunCount: number;
  securityProfile: 0 | 1 | 2;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const { data: watched } = useChargePointWatch(charger.chargePointId, true);

  const connected = watched?.connection_state === 'online';
  const everBooted = watched?.lifecycle === 'active';

  // Two URL dialects exist in the wild. Spec-style firmware takes a full
  // wss:// URL; a large class (most Chinese AC units) takes host:port/path in
  // one field with a separate TLS toggle supplying the scheme. Show both, with
  // the port explicit — that firmware's parsers often require it.
  const serverUrl = `${GATEWAY_URL.replace(/\/$/, '')}/ocpp`;
  // Profile 2 needs TLS (port 443), profile 1 plaintext (port 80). An open
  // charger may use either, and the cheap units that run open often cannot do
  // TLS at all — so it gets both, TLS first as the one to prefer.
  const noAuth = securityProfile === 0;
  const showTls = securityProfile !== 1;
  const showPlain = securityProfile !== 2;
  const plaintext = !showTls;
  const mustAcknowledge = !noAuth;
  const canClose = !mustAcknowledge || acknowledged;

  return (
    <Modal
      title="Charger registered"
      subtitle={`${charger.ocppIdentity} · ${gunCount} gun${gunCount > 1 ? 's' : ''}`}
      onClose={onClose}
      width={620}
    >
      {mustAcknowledge && (
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
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {showTls && (
          <CopyRow
            label="Server URL · TLS ON"
            value={gatewayDisplayHost(GATEWAY_URL, false)}
            mono
          />
        )}
        {showPlain && (
          <CopyRow
            label="Server URL · TLS OFF"
            value={gatewayDisplayHost(GATEWAY_URL, true)}
            mono
          />
        )}
        <CopyRow label="Charge Point ID" value={charger.ocppIdentity} mono />
        {!noAuth && (
          <>
            <CopyRow label="Username (TLS/Basic auth)" value={charger.ocppIdentity} mono />
            <CopyRow label="Password / AuthorizationKey" value={charger.authKey} mono />
          </>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6 }}>
        Set the charger to <strong>OCPP 1.6J</strong>
        {noAuth ? (
          <>
            . <strong>No username or password is needed</strong> — leave auth disabled on the
            charger. Use the TLS ON address if the unit has a TLS setting, otherwise TLS OFF; match
            the charger's TLS toggle to the address you enter.
          </>
        ) : plaintext ? (
          <>
            {' '}
            with its <strong>TLS toggle OFF</strong> and auth enabled (this charger was registered
            for unencrypted connections).
          </>
        ) : (
          <>
            {' '}
            with its <strong>TLS toggle ON</strong> and auth enabled. Leave any CA/certificate field
            empty — the certificate is publicly trusted.
          </>
        )}{' '}
        The charger appends its own ID to the URL. If yours wants a full URL instead of host:port,
        use {showTls && <code style={{ fontSize: 11 }}>{serverUrl}</code>}
        {showTls && showPlain && ' (TLS) or '}
        {showPlain && <code style={{ fontSize: 11 }}>{serverUrl.replace(/^wss:/, 'ws:')}</code>}
        {showTls && showPlain && ' (no TLS)'}
      </div>

      <ConnectionWatch connected={connected} everBooted={everBooted} watched={watched} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {mustAcknowledge && (
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
        )}
        <button
          onClick={onClose}
          disabled={!canClose}
          style={{
            ...primaryButton,
            background: canClose ? C.green : C.slate,
            cursor: canClose ? 'pointer' : 'not-allowed',
            opacity: canClose ? 1 : 0.6,
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
