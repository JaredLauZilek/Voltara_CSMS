import { useState } from 'react';
import { C } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { AddDriverBox, driverName, useDrivers, type Driver } from '@/features/drivers';
import { useCreateIdTag, useDeleteIdTag, useUnassignDriver } from '@/features/id-tags';
import { useAddVehicle, useDeleteVehicle, useVehicles } from './hooks';

export const CHARGING_RULES = [
  { value: 'drivers', label: 'Any listed driver', hint: 'App or RFID card. The default.' },
  {
    value: 'vehicles',
    label: 'Company vehicles only',
    hint: 'Charging starts only when the charger recognises an enrolled vehicle.',
  },
  {
    value: 'vehicle_and_driver',
    label: 'Vehicle and driver',
    hint: 'A listed driver, in an enrolled vehicle. Strictest.',
  },
] as const;

const inputStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
  boxSizing: 'border-box',
  minWidth: 0,
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
const box: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  overflow: 'hidden',
};
const empty: React.CSSProperties = {
  padding: 20,
  textAlign: 'center',
  color: C.slate,
  fontSize: 13,
};
const removeButton: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: C.slate,
  cursor: 'pointer',
  fontSize: 14,
};

/**
 * Corporate charging for one company: the rule for who may charge on its
 * bill, its drivers (app accounts, each with optional RFID cards) and its
 * vehicles. Everything listed here is billed to the company monthly; the
 * driver pays nothing at the charger.
 */
export function CompanyCharging({
  accountId,
  rule,
  onRule,
}: {
  accountId: string;
  rule: string;
  onRule: (rule: string) => void;
}) {
  return (
    <>
      <div>
        <label style={labelStyle}>Who may charge on the company's bill</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CHARGING_RULES.map((r) => (
            <label
              key={r.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${rule === r.value ? C.green : C.border}`,
                background: rule === r.value ? C.honeydew : C.white,
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <input
                type="radio"
                name="charging-rule"
                checked={rule === r.value}
                onChange={() => onRule(r.value)}
                style={{ accentColor: C.green, marginTop: 2 }}
              />
              <span>
                <strong style={{ color: C.ink }}>{r.label}</strong>
                <span style={{ color: C.slate }}> — {r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {rule !== 'drivers' && (
          <div style={{ fontSize: 11, color: C.warning, marginTop: 6, lineHeight: 1.5 }}>
            Saved, but not enforced yet: vehicle recognition at the charger is still being built,
            and only works on chargers that read the car's identity (mostly DC).
          </div>
        )}
      </div>
      <Drivers accountId={accountId} />
      <Vehicles accountId={accountId} />
    </>
  );
}

function Drivers({ accountId }: { accountId: string }) {
  const { data: drivers = [] } = useDrivers();
  const unassign = useUnassignDriver();
  const mine = drivers.filter((d) => d.billing_account_id === accountId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ ...labelStyle, marginBottom: 0 }}>Drivers · {mine.length}</label>
      <AddDriverBox billingAccountId={accountId} />
      <div style={box}>
        {mine.length === 0 ? (
          <div style={empty}>
            No drivers yet. Add one by the email or phone number of their app account.
          </div>
        ) : (
          mine.map((d) => (
            <DriverRow
              key={d.user_id}
              driver={d}
              accountId={accountId}
              onRemove={() => unassign.mutate(d.user_id)}
            />
          ))
        )}
      </div>
      {unassign.error && (
        <div style={{ fontSize: 12, color: C.error }}>{(unassign.error as Error).message}</div>
      )}
    </div>
  );
}

function DriverRow({
  driver,
  accountId,
  onRemove,
}: {
  driver: Driver;
  accountId: string;
  onRemove: () => void;
}) {
  const { tenantId } = useAuth();
  const createTag = useCreateIdTag();
  const deleteTag = useDeleteIdTag();
  const [adding, setAdding] = useState(false);
  const [card, setCard] = useState('');
  const cards = driver.tags.filter((t) => t.kind === 'rfid');

  const addCard = () => {
    const tag = card.trim().toUpperCase();
    if (!tag) return;
    createTag.mutate(
      {
        tenant_id: tenantId,
        tag,
        kind: 'rfid',
        status: 'active',
        driver_user_id: driver.user_id,
        billing_account_id: accountId,
        label: driverName(driver),
      },
      {
        onSuccess: () => {
          setCard('');
          setAdding(false);
        },
      },
    );
  };

  return (
    <div
      style={{
        padding: '10px 12px',
        borderBottom: `1px solid ${C.divider}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: C.ink }}>{driverName(driver)}</span>
        <span style={{ color: C.slate, fontSize: 12 }}>
          {[driver.display_name ? driver.email : null, driver.phone].filter(Boolean).join(' · ')}
        </span>
        <button
          onClick={onRemove}
          title="Remove from this company"
          aria-label="Remove from this company"
          style={{ ...removeButton, marginLeft: 'auto' }}
        >
          ×
        </button>
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}
      >
        <span style={chip}>App</span>
        {cards.map((t) => (
          <span key={t.id} style={chip}>
            Card <span style={{ fontFamily: 'monospace' }}>{t.tag}</span>
            <button
              onClick={() => deleteTag.mutate(t.id)}
              aria-label={`Remove card ${t.tag}`}
              style={{ ...removeButton, fontSize: 12, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <>
            <input
              value={card}
              onChange={(e) => setCard(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCard();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder="RFID card number"
              maxLength={20}
              autoFocus
              style={{
                ...inputStyle,
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'monospace',
                width: 170,
              }}
            />
            <button onClick={addCard} disabled={createTag.isPending} style={linkButton}>
              {createTag.isPending ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setAdding(false)} style={{ ...linkButton, color: C.slate }}>
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setAdding(true)} style={linkButton}>
            + RFID card
          </button>
        )}
      </div>
      {createTag.error && (
        <div style={{ fontSize: 12, color: C.error }}>
          {(createTag.error as { code?: string }).code === '23505'
            ? 'That card number is already in use.'
            : (createTag.error as Error).message}
        </div>
      )}
    </div>
  );
}

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 8px',
  borderRadius: 6,
  background: C.seasalt,
  border: `1px solid ${C.border}`,
  color: C.ink,
  fontSize: 11,
  fontWeight: 600,
};
const linkButton: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: C.green,
  fontFamily: 'Figtree',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};

function Vehicles({ accountId }: { accountId: string }) {
  const { data: vehicles = [] } = useVehicles(accountId);
  const add = useAddVehicle(accountId);
  const remove = useDeleteVehicle();
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [label, setLabel] = useState('');
  const ready = plate.trim().length > 0 && !add.isPending;

  const submit = () =>
    ready &&
    add.mutate(
      {
        plate: plate.trim().toUpperCase(),
        vin: vin.trim().toUpperCase() || null,
        label: label.trim() || null,
      },
      {
        onSuccess: () => {
          setPlate('');
          setVin('');
          setLabel('');
        },
      },
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ ...labelStyle, marginBottom: 0 }}>Vehicles · {vehicles.length}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="Plate number"
          maxLength={20}
          style={{ ...inputStyle, width: 140 }}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Model (optional)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          value={vin}
          onChange={(e) => setVin(e.target.value)}
          placeholder="VIN (optional)"
          maxLength={20}
          style={{ ...inputStyle, width: 190, fontFamily: 'monospace' }}
        />
        <button
          onClick={submit}
          disabled={!ready}
          style={{
            padding: '9px 16px',
            borderRadius: 10,
            border: 'none',
            background: ready ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 13,
            fontWeight: 700,
            cursor: ready ? 'pointer' : 'not-allowed',
            opacity: ready ? 1 : 0.6,
            whiteSpace: 'nowrap',
          }}
        >
          Add vehicle
        </button>
      </div>
      {add.error && (
        <div style={{ fontSize: 12, color: C.error }}>{(add.error as Error).message}</div>
      )}
      <div style={box}>
        {vehicles.length === 0 ? (
          <div style={empty}>No vehicles yet.</div>
        ) : (
          vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '9px 12px',
                borderBottom: `1px solid ${C.divider}`,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 700, color: C.ink, fontFamily: 'monospace' }}>
                {v.plate}
              </span>
              <span style={{ color: C.slate }}>
                {[v.label, v.vin ? `VIN ${v.vin}` : null].filter(Boolean).join(' · ')}
              </span>
              <span
                style={{ marginLeft: 'auto', fontSize: 12, color: v.id_tag_id ? C.green : C.slate }}
              >
                {v.id_tag_id ? 'Recognised by chargers' : 'Not recognised yet'}
              </span>
              <button
                onClick={() => remove.mutate(v.id)}
                aria-label={`Remove ${v.plate}`}
                style={removeButton}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.5 }}>
        A charger recognises a car by an identifier it reads from the car itself, never one typed in
        here. A vehicle becomes "recognised" after it charges once on a charger that reads it and
        the company consents to storing it.
      </div>
    </div>
  );
}
