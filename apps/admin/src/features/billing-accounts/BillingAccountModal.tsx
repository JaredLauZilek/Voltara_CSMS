import { useEffect, useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { billing, formatDate } from '@voltara/shared';
import { useLocations } from '@/features/locations';
import {
  useAgreements,
  useCreateAccount,
  useDeleteAccount,
  useDeleteAgreement,
  useUpdateAccount,
  useUpsertAgreement,
} from './hooks';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABELS,
  BILLING_MODELS,
  BILLING_MODEL_LABELS,
  ELECTRICITY_BASIS_LABELS,
} from './types';
import type {
  AgreementWithLocation,
  BillingAccountInsert,
  BillingAccountWithCounts,
} from './types';

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

type Form = Omit<BillingAccountInsert, 'tenant_id'>;

/** The payer. Kind + billing model decide how documents are produced; the MyInvois fields print on invoices. */
export function BillingAccountModal({
  account,
  onClose,
}: {
  account: BillingAccountWithCounts | null;
  onClose: () => void;
}) {
  const isNew = !account;
  const { data: locations = [] } = useLocations();
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const deleteMut = useDeleteAccount();
  const [form, setForm] = useState<Form>(() =>
    account
      ? {
          kind: account.kind,
          name: account.name,
          email: account.email,
          phone: account.phone,
          billing_model: account.billing_model,
          legal_name: account.legal_name,
          business_registration_no: account.business_registration_no,
          tax_identification_no: account.tax_identification_no,
          sst_registration_no: account.sst_registration_no,
          address: account.address,
          pool_cap_sen: account.pool_cap_sen,
          per_driver_cap_sen: account.per_driver_cap_sen,
          location_id: account.location_id,
          status: account.status,
          notes: account.notes,
        }
      : {
          kind: 'individual',
          name: '',
          email: null,
          phone: null,
          billing_model: 'postpaid_invoice',
          legal_name: null,
          business_registration_no: null,
          tax_identification_no: null,
          sst_registration_no: null,
          address: null,
          pool_cap_sen: null,
          per_driver_cap_sen: null,
          location_id: null,
          status: 'active',
          notes: null,
        },
  );
  const [poolCap, setPoolCap] = useState(
    account?.pool_cap_sen == null ? '' : (Number(account.pool_cap_sen) / 100).toFixed(2),
  );
  const [driverCap, setDriverCap] = useState(
    account?.per_driver_cap_sen == null
      ? ''
      : (Number(account.per_driver_cap_sen) / 100).toFixed(2),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    createMut.reset();
    updateMut.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof Form, placeholder = '') => (
    <input
      value={(form[k] as string | null) ?? ''}
      onChange={(e) => set(k, (e.target.value || null) as never)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave = form.name.trim().length > 0 && !isSaving;
  const error = createMut.error ?? updateMut.error ?? deleteMut.error;
  const isBusiness = form.kind !== 'individual';

  const save = () => {
    const row: Form = {
      ...form,
      name: form.name.trim(),
      pool_cap_sen: billing.parseSen(poolCap),
      per_driver_cap_sen: billing.parseSen(driverCap),
    };
    if (isNew) createMut.mutate(row, { onSuccess: onClose });
    else updateMut.mutate({ id: account.id, patch: row }, { onSuccess: onClose });
  };

  return (
    <Modal
      title={isNew ? 'New billing account' : account.name}
      subtitle={
        isNew
          ? 'Who gets billed'
          : `${ACCOUNT_KIND_LABELS[account.kind]} · ${account.tag_count} ID tag${account.tag_count === 1 ? '' : 's'}`
      }
      onClose={onClose}
      width={680}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Kind</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set('kind', k)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 99,
                  border: `2px solid ${form.kind === k ? C.green : C.border}`,
                  background: form.kind === k ? C.honeydew : C.white,
                  color: form.kind === k ? C.green : C.slate,
                  fontFamily: 'Figtree',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {ACCOUNT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={isBusiness ? 'e.g. JMB Vantage Residences' : 'e.g. Tan Ah Kow · Unit 12-3'}
            autoFocus={isNew}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>How they pay</label>
          <select
            value={form.billing_model ?? 'postpaid_invoice'}
            onChange={(e) => set('billing_model', e.target.value)}
            style={inputStyle}
          >
            {BILLING_MODELS.map((m) => (
              <option key={m} value={m}>
                {BILLING_MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          {text('email', 'billing@…')}
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          {text('phone', '+60…')}
        </div>
        {form.kind === 'site_host' && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Site they host</label>
            <select
              value={form.location_id ?? ''}
              onChange={(e) => set('location_id', e.target.value || null)}
              style={inputStyle}
            >
              <option value="">— Choose a site —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {isBusiness && (
          <>
            <div
              style={{
                gridColumn: '1/-1',
                fontSize: 11,
                fontWeight: 700,
                color: C.slate,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginTop: 6,
              }}
            >
              Invoice identity (MyInvois)
            </div>
            <div>
              <label style={labelStyle}>Legal name</label>
              {text('legal_name')}
            </div>
            <div>
              <label style={labelStyle}>Business registration no.</label>
              {text('business_registration_no', 'SSM')}
            </div>
            <div>
              <label style={labelStyle}>Tax identification no. (TIN)</label>
              {text('tax_identification_no')}
            </div>
            <div>
              <label style={labelStyle}>SST registration no.</label>
              {text('sst_registration_no')}
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Address</label>
              <textarea
                value={form.address ?? ''}
                onChange={(e) => set('address', e.target.value || null)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </>
        )}
        {form.kind === 'corporate' && (
          <>
            <div>
              <label style={labelStyle}>Pool cap per period (RM)</label>
              <input
                value={poolCap}
                onChange={(e) => setPoolCap(e.target.value)}
                placeholder="unlimited"
                inputMode="decimal"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Per-driver cap (RM)</label>
              <input
                value={driverCap}
                onChange={(e) => setDriverCap(e.target.value)}
                placeholder="unlimited"
                inputMode="decimal"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </div>
          </>
        )}
        {!isNew && (
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={form.status ?? 'active'}
              onChange={(e) => set('status', e.target.value)}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        )}
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Notes</label>
          {text('notes')}
        </div>
      </div>

      {!isNew && account.kind === 'site_host' && <Agreements account={account} />}

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
                Permanent — cannot be undone.
              </span>
              <button
                onClick={() => deleteMut.mutate(account.id, { onSuccess: onClose })}
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

/** Revenue share terms with a site host — what the settlement statement is computed from. */
function Agreements({ account }: { account: BillingAccountWithCounts }) {
  const { data: agreements = [] } = useAgreements(account.id);
  const { data: locations = [] } = useLocations();
  const upsert = useUpsertAgreement();
  const remove = useDeleteAgreement();
  const [editing, setEditing] = useState<AgreementWithLocation | 'new' | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Revenue share agreements</label>
        <button
          onClick={() => setEditing('new')}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.white,
            color: C.green,
            fontFamily: 'Figtree',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Agreement
        </button>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {agreements.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.slate, fontSize: 13 }}>
            No agreement yet — settlement statements need one.
          </div>
        ) : (
          agreements.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderBottom: `1px solid ${C.divider}`,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600, color: C.ink }}>{a.location_name ?? 'Site'}</span>
              <span style={{ color: C.slate }}>
                AC {a.revenue_share_bps_ac / 100}% · DC {a.revenue_share_bps_dc / 100}%
                {a.fixed_monthly_fee_sen
                  ? ` · fee ${billing.formatSen(Number(a.fixed_monthly_fee_sen))}/mo`
                  : ''}
                {a.electricity_basis !== 'none'
                  ? ` · electricity ${billing.formatSen(a.electricity_sen_per_kwh)}/kWh`
                  : ''}
              </span>
              <span style={{ marginLeft: 'auto', color: C.slate, fontSize: 12 }}>
                from {formatDate(a.valid_from)}
                {a.valid_to ? ` to ${formatDate(a.valid_to)}` : ''}
              </span>
              <button
                onClick={() => setEditing(a)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: C.green,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Edit
              </button>
              <button
                onClick={() => remove.mutate(a.id)}
                style={{
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
      {editing && (
        <AgreementForm
          initial={editing === 'new' ? null : editing}
          locations={locations}
          defaultLocationId={account.location_id}
          isSaving={upsert.isPending}
          error={upsert.error ? (upsert.error as Error).message : null}
          onCancel={() => setEditing(null)}
          onSave={(row) =>
            upsert.mutate(
              {
                ...row,
                host_account_id: account.id,
                ...(editing !== 'new' ? { id: editing.id } : {}),
              },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}
    </div>
  );
}

function AgreementForm({
  initial,
  locations,
  defaultLocationId,
  isSaving,
  error,
  onCancel,
  onSave,
}: {
  initial: AgreementWithLocation | null;
  locations: { id: string; name: string }[];
  defaultLocationId: string | null;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (row: {
    location_id: string;
    revenue_share_bps_ac: number;
    revenue_share_bps_dc: number;
    fixed_monthly_fee_sen: number;
    electricity_sen_per_kwh: number;
    electricity_basis: string;
    valid_from: string;
    valid_to: string | null;
  }) => void;
}) {
  const [locationId, setLocationId] = useState(initial?.location_id ?? defaultLocationId ?? '');
  const [ac, setAc] = useState(String((initial?.revenue_share_bps_ac ?? 0) / 100));
  const [dc, setDc] = useState(String((initial?.revenue_share_bps_dc ?? 0) / 100));
  const [fee, setFee] = useState(
    initial ? (Number(initial.fixed_monthly_fee_sen) / 100).toFixed(2) : '',
  );
  const [elec, setElec] = useState(
    initial ? (initial.electricity_sen_per_kwh / 100).toFixed(2) : '',
  );
  const [basis, setBasis] = useState(initial?.electricity_basis ?? 'none');
  const [from, setFrom] = useState(initial?.valid_from ?? new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(initial?.valid_to ?? '');
  const canSave = Boolean(locationId) && !isSaving;
  return (
    <div
      style={{
        background: C.seasalt,
        borderRadius: 12,
        padding: 14,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10,
      }}
    >
      <div style={{ gridColumn: '1/-1' }}>
        <label style={labelStyle}>Site</label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Choose —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Host share · AC (%)</label>
        <input
          value={ac}
          onChange={(e) => setAc(e.target.value)}
          inputMode="decimal"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Host share · DC (%)</label>
        <input
          value={dc}
          onChange={(e) => setDc(e.target.value)}
          inputMode="decimal"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Platform fee / month (RM)</label>
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Electricity (RM/kWh)</label>
        <input
          value={elec}
          onChange={(e) => setElec(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          style={inputStyle}
        />
      </div>
      <div style={{ gridColumn: 'span 2' }}>
        <label style={labelStyle}>Electricity is</label>
        <select value={basis} onChange={(e) => setBasis(e.target.value)} style={inputStyle}>
          {Object.entries(ELECTRICITY_BASIS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Until</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
      </div>
      {error && <div style={{ gridColumn: '1/-1', fontSize: 12, color: C.error }}>{error}</div>}
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
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
        <button
          disabled={!canSave}
          onClick={() =>
            onSave({
              location_id: locationId,
              revenue_share_bps_ac: Math.round((Number(ac) || 0) * 100),
              revenue_share_bps_dc: Math.round((Number(dc) || 0) * 100),
              fixed_monthly_fee_sen: billing.parseSen(fee) ?? 0,
              electricity_sen_per_kwh: billing.parseSen(elec) ?? 0,
              electricity_basis: basis,
              valid_from: from,
              valid_to: to || null,
            })
          }
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: 'none',
            background: canSave ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 12,
            fontWeight: 700,
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.6,
          }}
        >
          {isSaving ? 'Saving…' : 'Save agreement'}
        </button>
      </div>
    </div>
  );
}
