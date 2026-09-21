import { useEffect, useState } from 'react';
import { C } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { useOperatorSettings, useSaveOperatorSettings } from './hooks';
import type { OperatorForm } from './types';

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

const EMPTY: OperatorForm = {
  app_name: null,
  legal_name: null,
  business_registration_no: null,
  tax_identification_no: null,
  sst_registration_no: null,
  address: null,
  support_email: null,
  support_phone: null,
};

/**
 * Who the operator is on paper. Snapshotted onto every document at issue
 * time (seller_snapshot), so editing here changes future documents only.
 */
export function OperatorSettingsScreen() {
  const { tenantRole } = useAuth();
  const { data: settings, isLoading } = useOperatorSettings();
  const save = useSaveOperatorSettings();
  const [form, setForm] = useState<OperatorForm>(EMPTY);
  const [saved, setSaved] = useState(false);
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';

  useEffect(() => {
    if (settings) {
      setForm({
        app_name: settings.app_name,
        legal_name: settings.legal_name,
        business_registration_no: settings.business_registration_no,
        tax_identification_no: settings.tax_identification_no,
        sst_registration_no: settings.sst_registration_no,
        address: settings.address,
        support_email: settings.support_email,
        support_phone: settings.support_phone,
      });
    }
  }, [settings]);

  const set =
    (k: keyof OperatorForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSaved(false);
      setForm((f) => ({ ...f, [k]: e.target.value || null }));
    };
  const field = (k: keyof OperatorForm, label: string, placeholder = '', span = false) => (
    <div style={span ? { gridColumn: '1/-1' } : undefined}>
      <label style={labelStyle}>{label}</label>
      <input
        value={(form[k] as string | null) ?? ''}
        onChange={set(k)}
        placeholder={placeholder}
        disabled={!canEdit}
        style={inputStyle}
      />
    </div>
  );

  if (isLoading) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.slate,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Operator identity
          </div>
          <div style={{ fontSize: 13, color: C.slate, marginTop: 4, lineHeight: 1.6 }}>
            Printed as the seller on receipts, invoices and settlement statements, and required for
            LHDN e-invoicing. Changes apply to documents issued from now on.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('app_name', 'Trading name', 'e.g. Voltara Charge')}
          {field('legal_name', 'Legal name', 'e.g. Voltara Sdn. Bhd.')}
          {field(
            'business_registration_no',
            'Business registration no. (SSM)',
            '202001012345 (1234567-X)',
          )}
          {field('tax_identification_no', 'Tax identification no. (TIN)', 'C12345678900')}
          {field('sst_registration_no', 'SST registration no.', 'Leave empty until registered')}
          {field('support_phone', 'Support phone', '+60 …')}
          {field('support_email', 'Support email', 'billing@…', true)}
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Registered address</label>
            <textarea
              value={form.address ?? ''}
              onChange={set('address')}
              rows={3}
              disabled={!canEdit}
              placeholder="Press Enter for a new line"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>
        {save.error && (
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
            {(save.error as Error).message}
          </div>
        )}
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {saved && (
              <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved</span>
            )}
            <button
              onClick={() => save.mutate(form, { onSuccess: () => setSaved(true) })}
              disabled={save.isPending}
              style={{
                marginLeft: 'auto',
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: C.green,
                color: C.white,
                fontFamily: 'Figtree',
                fontSize: 13,
                fontWeight: 700,
                cursor: save.isPending ? 'wait' : 'pointer',
              }}
            >
              {save.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
