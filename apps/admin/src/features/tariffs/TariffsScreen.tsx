import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, C, KPICard, Modal, Toolbar } from '@voltara/ui';
import { billing, formatDate } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useCreateTariff, useTariffs, useTaxProfiles } from './hooks';
import { TariffEditor, type TariffEditorValue } from './TariffEditor';
import { TaxProfileModal } from './TaxProfileModal';
import { TARIFF_FILTERS, TARIFF_STATUS_BADGE, elementsOf } from './types';
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

export function TariffsScreen() {
  const { tenantRole } = useAuth();
  const navigate = useNavigate();
  const { data: tariffs = [], isLoading } = useTariffs();
  const { data: taxProfiles = [] } = useTaxProfiles();
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') ?? 'Active';
  const search = params.get('q') ?? '';
  const [showNew, setShowNew] = useState(false);
  const [taxModal, setTaxModal] = useState<TaxProfile | 'new' | null>(null);
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'Active') next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tariffs.filter((t) => {
      if (filter !== 'All' && t.status !== filter.toLowerCase()) return false;
      if (
        q &&
        !(
          t.name.toLowerCase().includes(q) ||
          (t.latest?.display_text ?? '').toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [tariffs, filter, search]);

  const defaultTax = taxProfiles.find((t) => t.is_default) ?? taxProfiles[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Tariffs"
          value={tariffs.filter((t) => t.status === 'active').length}
          sub={`${tariffs.length} total`}
          accent
        />
        <KPICard
          label="Assignments"
          value={tariffs.reduce((s, t) => s + t.assignment_count, 0)}
          sub="Places a tariff applies"
        />
        <KPICard
          label="Versions"
          value={tariffs.reduce((s, t) => s + t.version_count, 0)}
          sub="Immutable price history"
        />
        <KPICard
          label="Tax rate"
          value={defaultTax ? `${(defaultTax.rate_bps / 100).toFixed(0)}%` : '—'}
          sub={defaultTax ? defaultTax.name : 'No tax profile yet'}
        />
      </div>

      <Toolbar
        filters={[...TARIFF_FILTERS]}
        filter={filter}
        onFilterChange={(f) => setParam('status', f)}
        search={search}
        onSearchChange={(s) => setParam('q', s || null)}
        searchPlaceholder="Search tariffs…"
        primaryLabel={canEdit ? '+ New Tariff' : undefined}
        onPrimary={canEdit ? () => setShowNew(true) : undefined}
      />

      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {['Tariff', 'Pricing', 'Version', 'Assigned', 'Status', 'Updated'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.slate,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={t.id}
                style={{ borderBottom: `1px solid ${C.divider}`, cursor: 'pointer' }}
                onClick={() => navigate(`/tariffs/${t.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontWeight: 600, color: C.ink }}>{t.name}</div>
                  {t.description && (
                    <div style={{ fontSize: 12, color: C.slate }}>{t.description}</div>
                  )}
                </td>
                <td style={{ padding: '13px 16px', color: C.ink }}>
                  {t.latest?.display_text ??
                    (t.latest ? billing.describeElements(elementsOf(t.latest)) : '—')}
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>
                  v{t.latest?.version ?? '—'}
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>
                  {t.assignment_count} place{t.assignment_count === 1 ? '' : 's'}
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <Badge status={TARIFF_STATUS_BADGE[t.status] ?? t.status} />
                </td>
                <td style={{ padding: '13px 16px', color: C.slate }}>{formatDate(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
            No tariffs found.
          </div>
        )}
      </div>

      {/* Tax */}
      <div
        style={{
          background: C.white,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.slate,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Tax rates
          </span>
          {canEdit && (
            <button
              onClick={() => setTaxModal('new')}
              style={{
                marginLeft: 'auto',
                padding: '7px 14px',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.green,
                fontFamily: 'Figtree',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Add rate
            </button>
          )}
        </div>
        {taxProfiles.length === 0 ? (
          <div style={{ fontSize: 13, color: C.slate }}>
            No tax profile yet. Add one (0% is fine) so new tariff versions have a default.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {taxProfiles.map((t) => (
              <button
                key={t.id}
                onClick={() => canEdit && setTaxModal(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: `1px solid ${t.is_default ? C.green : C.border}`,
                  background: t.is_default ? C.honeydew : C.white,
                  cursor: canEdit ? 'pointer' : 'default',
                  fontFamily: 'Figtree',
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: C.green,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {(t.rate_bps / 100).toFixed(t.rate_bps % 100 ? 1 : 0)}%
                </span>
                <span style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.slate }}>
                    {t.code}
                    {t.is_default ? ' · default' : ''}
                  </div>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewTariffModal
          taxProfiles={taxProfiles}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/tariffs/${id}`);
          }}
        />
      )}
      {taxModal && (
        <TaxProfileModal
          profile={taxModal === 'new' ? null : taxModal}
          onClose={() => setTaxModal(null)}
        />
      )}
    </div>
  );
}

function NewTariffModal({
  taxProfiles,
  onClose,
  onCreated,
}: {
  taxProfiles: TaxProfile[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateTariff();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState<TariffEditorValue | null>(null);
  useEffect(() => {
    create.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  const canSave = name.trim().length > 0 && Boolean(value?.valid) && !create.isPending;

  return (
    <Modal
      title="New tariff"
      subtitle="Version 1 is created with it; later edits become new versions"
      onClose={onClose}
      width={760}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Residents"
            autoFocus
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Internal note</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
      </div>
      <TariffEditor initial={null} taxProfiles={taxProfiles} onChange={setValue} />
      {create.error && (
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
          {(create.error as Error).message}
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
            value &&
            create.mutate(
              {
                tariff: { name: name.trim(), description: description.trim() || null },
                version: value,
              },
              { onSuccess: (t) => onCreated(t.id) },
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
            cursor: canSave ? 'pointer' : create.isPending ? 'wait' : 'not-allowed',
            opacity: canSave ? 1 : 0.6,
          }}
        >
          {create.isPending ? 'Creating…' : 'Create tariff'}
        </button>
      </div>
    </Modal>
  );
}
