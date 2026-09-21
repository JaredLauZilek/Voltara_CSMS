import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge, C, Modal } from '@voltara/ui';
import { billing, formatDateTime } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { AssignmentModal } from './AssignmentModal';
import {
  useCreateVersion,
  useDeleteAssignment,
  useEndAssignment,
  useTariff,
  useTaxProfiles,
  useUpdateTariff,
} from './hooks';
import { PricePreview } from './PricePreview';
import { TariffEditor, type TariffEditorValue } from './TariffEditor';
import { AUDIENCE_LABELS, SCOPE_LABELS, TARIFF_STATUS_BADGE, elementsOf } from './types';
import type { AssignmentWithNames } from './types';

const TABS = ['pricing', 'assignments', 'history'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  pricing: 'Pricing',
  assignments: 'Assignments',
  history: 'Version history',
};

const card: React.CSSProperties = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
const secondaryButton: React.CSSProperties = {
  padding: '9px 18px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.white,
  color: C.green,
  fontFamily: 'Figtree',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export function TariffDetailScreen() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { tenantRole } = useAuth();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'pricing';
  const { data: tariff, isLoading } = useTariff(id);
  const { data: taxProfiles = [] } = useTaxProfiles();
  const updateMut = useUpdateTariff();
  const endMut = useEndAssignment();
  const deleteMut = useDeleteAssignment();
  const [showVersion, setShowVersion] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const canEdit = tenantRole === 'owner' || tenantRole === 'admin';

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'pricing') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  if (isLoading) return null;
  if (!tariff) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        Tariff not found.{' '}
        <Link to="/tariffs" style={{ color: C.green, fontWeight: 600 }}>
          Back to tariffs
        </Link>
      </div>
    );
  }
  const latest = tariff.versions[0] ?? null;
  const latestElements = elementsOf(latest);
  const tax = taxProfiles.find((t) => t.id === latest?.tax_profile_id) ?? null;
  const live = tariff.assignments.filter((a) => !a.valid_to || new Date(a.valid_to) > new Date());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link
        to="/tariffs"
        style={{ fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: 'none' }}
      >
        ‹ Tariffs
      </Link>

      <div
        style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: C.green, letterSpacing: '-0.02em' }}
            >
              {tariff.name}
            </span>
            <Badge status={TARIFF_STATUS_BADGE[tariff.status] ?? tariff.status} />
            {latest && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.slate }}>
                v{latest.version}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>
            {latest?.display_text ??
              (latest ? billing.describeElements(latestElements) : 'No version yet')}
          </div>
        </div>
        {canEdit && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {tariff.status !== 'archived' ? (
              <button
                onClick={() => updateMut.mutate({ id: tariff.id, patch: { status: 'archived' } })}
                style={{ ...secondaryButton, color: C.slate }}
              >
                Archive
              </button>
            ) : (
              <button
                onClick={() => updateMut.mutate({ id: tariff.id, patch: { status: 'active' } })}
                style={secondaryButton}
              >
                Reactivate
              </button>
            )}
            <button
              onClick={() => setShowVersion(true)}
              style={{ ...secondaryButton, background: C.green, color: C.white, border: 'none' }}
            >
              New version
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: `1px solid ${tab === t ? C.green : C.border}`,
              background: tab === t ? C.green : C.white,
              color: tab === t ? C.white : C.slate,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Figtree',
              cursor: 'pointer',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'pricing' && latest && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}
        >
          <div style={card}>
            <div style={sectionTitle}>Current pricing · v{latest.version}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {latestElements.map((el, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: C.seasalt,
                    fontSize: 13,
                  }}
                >
                  {el.price_components.map((c, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.ink, fontWeight: 600 }}>
                        {c.type === 'ENERGY'
                          ? 'Energy'
                          : c.type === 'TIME'
                            ? 'Charging time'
                            : c.type === 'PARKING_TIME'
                              ? 'Idle time'
                              : 'Session fee'}
                      </span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {billing.formatSen(c.price_sen)}
                        {c.type === 'ENERGY' ? '/kWh' : c.type === 'FLAT' ? '' : '/h'}
                      </span>
                    </div>
                  ))}
                  {el.restrictions && Object.keys(el.restrictions).length > 0 && (
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
                      {Object.entries(el.restrictions)
                        .map(
                          ([k, v]) =>
                            `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`,
                        )
                        .join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
              {latest.tax_included ? 'Prices include tax' : 'Tax is added on top'} ·{' '}
              {tax ? `${tax.name} ${(tax.rate_bps / 100).toFixed(0)}%` : 'no tax profile'}
              {latest.min_price_sen != null
                ? ` · min ${billing.formatSen(Number(latest.min_price_sen))}`
                : ''}
              {latest.max_price_sen != null
                ? ` · max ${billing.formatSen(Number(latest.max_price_sen))}`
                : ''}
              {' · '}created {formatDateTime(latest.created_at)}
            </div>
          </div>
          <PricePreview
            elements={latestElements}
            taxRateBps={tax?.rate_bps ?? 0}
            taxIncluded={latest.tax_included}
            minPriceSen={latest.min_price_sen == null ? null : Number(latest.min_price_sen)}
            maxPriceSen={latest.max_price_sen == null ? null : Number(latest.max_price_sen)}
          />
        </div>
      )}

      {tab === 'assignments' && (
        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px 24px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={sectionTitle}>Where this tariff applies</span>
            {canEdit && tariff.status === 'active' && (
              <button
                onClick={() => setShowAssign(true)}
                style={{ ...secondaryButton, marginLeft: 'auto' }}
              >
                + Assign
              </button>
            )}
          </div>
          {tariff.assignments.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
              Not assigned anywhere yet — sessions will not use this tariff until it is.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.seasalt }}>
                  {['Scope', 'For', 'Priority', 'Valid', ''].map((h) => (
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
                {tariff.assignments.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    a={a}
                    live={live.includes(a)}
                    canEdit={canEdit}
                    onEnd={() => endMut.mutate(a.id)}
                    onDelete={() => deleteMut.mutate(a.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
            <span style={sectionTitle}>Versions · immutable</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.seasalt }}>
                {['Version', 'Pricing', 'Tax', 'Created'].map((h) => (
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
              {tariff.versions.map((v) => (
                <tr key={v.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: C.green }}>
                    v{v.version}
                    {v.id === latest?.id ? (
                      <span style={{ color: C.slate, fontWeight: 500 }}> · current</span>
                    ) : (
                      ''
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: C.ink }}>
                    {v.display_text ?? billing.describeElements(elementsOf(v))}
                  </td>
                  <td style={{ padding: '12px 16px', color: C.slate }}>
                    {v.tax_included ? 'inclusive' : 'exclusive'}
                  </td>
                  <td style={{ padding: '12px 16px', color: C.slate }}>
                    {formatDateTime(v.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showVersion && (
        <NewVersionModal
          tariffId={tariff.id}
          initial={latest}
          onClose={() => setShowVersion(false)}
        />
      )}
      {showAssign && <AssignmentModal tariffId={tariff.id} onClose={() => setShowAssign(false)} />}
    </div>
  );
}

function AssignmentRow({
  a,
  live,
  canEdit,
  onEnd,
  onDelete,
}: {
  a: AssignmentWithNames;
  live: boolean;
  canEdit: boolean;
  onEnd: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const where =
    a.scope_type === 'tenant'
      ? SCOPE_LABELS.tenant
      : a.scope_type === 'location'
        ? `Site · ${a.location_name ?? '—'}`
        : a.scope_type === 'charge_point'
          ? `Charger · ${a.charge_point_name ?? '—'}`
          : `${a.charge_point_name ?? 'Charger'} · ${a.connector_label ?? 'connector'}`;
  return (
    <tr style={{ borderBottom: `1px solid ${C.divider}`, opacity: live ? 1 : 0.55 }}>
      <td style={{ padding: '12px 16px', fontWeight: 600, color: C.ink }}>{where}</td>
      <td style={{ padding: '12px 16px', color: C.slate }}>
        {a.audience === 'group'
          ? `Group · ${a.driver_group_name ?? '—'}`
          : AUDIENCE_LABELS[a.audience]}
      </td>
      <td style={{ padding: '12px 16px', color: C.slate }}>{a.priority}</td>
      <td style={{ padding: '12px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
        {formatDateTime(a.valid_from)}
        {a.valid_to ? ` → ${formatDateTime(a.valid_to)}` : ' → open'}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {canEdit &&
          (confirm ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {live && (
                <button
                  onClick={onEnd}
                  style={{
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
                  End today
                </button>
              )}
              <button
                onClick={onDelete}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: C.error,
                  color: C.white,
                  fontFamily: 'Figtree',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setConfirm(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
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
            </span>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'transparent',
                color: C.slate,
                fontFamily: 'Figtree',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Remove…
            </button>
          ))}
      </td>
    </tr>
  );
}

function NewVersionModal({
  tariffId,
  initial,
  onClose,
}: {
  tariffId: string;
  initial: Parameters<typeof TariffEditor>[0]['initial'];
  onClose: () => void;
}) {
  const { data: taxProfiles = [] } = useTaxProfiles();
  const create = useCreateVersion(tariffId);
  const [value, setValue] = useState<TariffEditorValue | null>(null);
  useEffect(() => {
    create.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  const canSave = Boolean(value?.valid) && !create.isPending;
  return (
    <Modal
      title="New version"
      subtitle="Applies to sessions that start after it is saved; running sessions keep their price"
      onClose={onClose}
      width={760}
    >
      <TariffEditor initial={initial} taxProfiles={taxProfiles} onChange={setValue} />
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
          onClick={() => value && create.mutate(value, { onSuccess: onClose })}
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
          {create.isPending ? 'Saving…' : 'Publish version'}
        </button>
      </div>
    </Modal>
  );
}
