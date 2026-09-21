import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { useChargePoints } from '@/features/charge-points';
import { useDriverGroups } from '@/features/driver-groups';
import { useLocations } from '@/features/locations';
import { useCreateAssignment } from './hooks';
import { AUDIENCE_LABELS, SCOPE_LABELS } from './types';
import type { NewAssignmentInput } from './types';

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

/** Where and for whom a tariff applies. Precedence is explained inline so the operator can predict the outcome. */
export function AssignmentModal({ tariffId, onClose }: { tariffId: string; onClose: () => void }) {
  const { data: locations = [] } = useLocations();
  const { data: chargePoints = [] } = useChargePoints();
  const { data: groups = [] } = useDriverGroups();
  const create = useCreateAssignment(tariffId);
  const [scope, setScope] = useState<NewAssignmentInput['scope_type']>('tenant');
  const [locationId, setLocationId] = useState('');
  const [chargePointId, setChargePointId] = useState('');
  const [connectorId, setConnectorId] = useState('');
  const [audience, setAudience] = useState<NewAssignmentInput['audience']>('all');
  const [groupId, setGroupId] = useState('');
  const [priority, setPriority] = useState('0');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState('');

  const cp = chargePoints.find((c) => c.id === chargePointId);
  const scopeOk =
    scope === 'tenant' ||
    (scope === 'location' && locationId) ||
    (scope === 'charge_point' && chargePointId) ||
    (scope === 'connector' && connectorId);
  const audienceOk = audience !== 'group' || groupId;
  const canSave = Boolean(scopeOk && audienceOk) && !create.isPending;

  const submit = () =>
    create.mutate(
      {
        scope_type: scope,
        location_id: scope === 'location' ? locationId : null,
        charge_point_id: scope === 'charge_point' ? chargePointId : null,
        connector_id: scope === 'connector' ? connectorId : null,
        audience,
        driver_group_id: audience === 'group' ? groupId : null,
        priority: Number(priority) || 0,
        valid_from: new Date(`${validFrom}T00:00:00`).toISOString(),
        valid_to: validTo ? new Date(`${validTo}T23:59:59`).toISOString() : null,
      },
      { onSuccess: onClose },
    );

  return (
    <Modal
      title="Assign tariff"
      subtitle="The most specific matching assignment wins"
      onClose={onClose}
      width={560}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Applies to</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['tenant', 'location', 'charge_point', 'connector'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 99,
                  border: `2px solid ${scope === s ? C.green : C.border}`,
                  background: scope === s ? C.honeydew : C.white,
                  color: scope === s ? C.green : C.slate,
                  fontFamily: 'Figtree',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        {scope === 'location' && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Site</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
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
        {(scope === 'charge_point' || scope === 'connector') && (
          <div style={{ gridColumn: scope === 'connector' ? 'auto' : '1/-1' }}>
            <label style={labelStyle}>Charger</label>
            <select
              value={chargePointId}
              onChange={(e) => {
                setChargePointId(e.target.value);
                setConnectorId('');
              }}
              style={inputStyle}
            >
              <option value="">— Choose a charger —</option>
              {chargePoints.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.ocpp_identity}
                </option>
              ))}
            </select>
          </div>
        )}
        {scope === 'connector' && (
          <div>
            <label style={labelStyle}>Connector</label>
            <select
              value={connectorId}
              onChange={(e) => setConnectorId(e.target.value)}
              disabled={!cp}
              style={inputStyle}
            >
              <option value="">— Choose —</option>
              {cp?.connectors.map((k) => (
                <option key={k.id} value={k.id}>
                  Connector {k.ocpp_connector_id} · {k.connector_type}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>For whom</label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as NewAssignmentInput['audience'])}
            style={inputStyle}
          >
            {(['all', 'ad_hoc', 'group'] as const).map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        {audience === 'group' && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Driver group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={inputStyle}>
              <option value="">— Choose a group —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {groups.length === 0 && (
              <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
                No driver groups yet — create one under Billing → Driver groups.
              </div>
            )}
          </div>
        )}

        <div>
          <label style={labelStyle}>Priority (ties)</label>
          <input
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            inputMode="numeric"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>From</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Until</label>
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6 }}>
        Connector beats charger beats site beats whole operator. Within the same scope, a
        driver-group assignment beats ad-hoc, which beats everyone; then the higher priority wins.
      </div>
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
          onClick={submit}
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
          {create.isPending ? 'Saving…' : 'Assign'}
        </button>
      </div>
    </Modal>
  );
}
