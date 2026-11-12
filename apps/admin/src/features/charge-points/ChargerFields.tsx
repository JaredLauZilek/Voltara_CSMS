import { useMemo } from 'react';
import { C, SearchableSelect, type SelectOption } from '@voltara/ui';
import { SITE_TYPE_LABELS, formatGun, type SiteType } from '@voltara/shared';
import { useLocations } from '@/features/locations';
import { useChargerModels } from './hooks';
import { CONNECTOR_TYPES, type ChargerModel, type GunInput } from './types';

// Form pieces shared by Add Charger and Edit: the site and catalogue model
// pickers, and the per-gun table (connector type, car park lot).

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

const microLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

/** The site the charger stands at, searchable; a charger may stay unassigned. */
export function SitePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (locationId: string | null) => void;
}) {
  const { data: locations = [] } = useLocations();
  const options = useMemo<SelectOption[]>(
    () =>
      locations.map((l) => ({
        value: l.id,
        label: l.name,
        meta: SITE_TYPE_LABELS[l.site_type as SiteType] ?? l.site_type,
      })),
    [locations],
  );
  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Search sites…"
      nullable
      nullLabel="Unassigned"
    />
  );
}

/** '50 kW · CCS2 + CHAdeMO' or '180 kW · 2 × CCS2'. */
function modelSpec(m: ChargerModel): string {
  const types = m.connector_types;
  const same = types.length > 1 && types.every((t) => t === types[0]);
  return [
    m.power_kw != null ? `${m.power_kw} kW` : null,
    same ? `${types.length} × ${types[0]}` : types.join(' + '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Brand and model from the catalogue, searchable by either and grouped by
 * brand. Optional: a charger reports its own make and model when it boots, so
 * an unlisted unit still registers.
 */
export function ModelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (model: ChargerModel | null) => void;
}) {
  const { data: models = [] } = useChargerModels();
  const options = useMemo<SelectOption[]>(
    () =>
      models.map((m) => ({
        value: m.id,
        label: `${m.vendor} ${m.name}`,
        meta: modelSpec(m),
        group: m.vendor,
      })),
    [models],
  );

  return (
    <div>
      <SearchableSelect
        options={options}
        value={value}
        onChange={(id) => onChange(models.find((m) => m.id === id) ?? null)}
        placeholder="Search brand or model…"
        nullable
        nullLabel="Not listed"
      />
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>
        Fills in the guns and power below. Not listed? Leave it empty — the charger reports its make
        and model when it first connects.
      </div>
    </div>
  );
}

/** Resize the gun list, keeping what was entered; new guns copy the last gun's type. */
export function resizeGuns(guns: GunInput[], count: number): GunInput[] {
  const lastType = guns[guns.length - 1]?.connectorType ?? 'Type2';
  return Array.from(
    { length: count },
    (_, i) => guns[i] ?? { connectorType: lastType, parkingLot: '' },
  );
}

/**
 * One row per gun: its letter, connector type and the car park lot it serves.
 * A twin-gun unit between two bays gets a lot per gun. With `fixedTypes` the
 * type is shown, not edited (an existing charger's hardware).
 */
export function GunRows({
  guns,
  onChange,
  fixedTypes = false,
}: {
  guns: GunInput[];
  onChange: (guns: GunInput[]) => void;
  fixedTypes?: boolean;
}) {
  const set = (i: number, patch: Partial<GunInput>) =>
    onChange(guns.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1fr) minmax(0, 1fr)',
        gap: '8px 12px',
        alignItems: 'center',
        padding: '12px 14px',
        borderRadius: 12,
        background: C.seasalt,
        border: `1px solid ${C.border}`,
      }}
    >
      <span style={microLabel}>Gun</span>
      <span style={microLabel}>Connector</span>
      <span style={microLabel}>Car park lot</span>
      {guns.map((g, i) => (
        <GunRow
          key={i}
          index={i}
          gun={g}
          fixedType={fixedTypes}
          onChange={(patch) => set(i, patch)}
        />
      ))}
    </div>
  );
}

function GunRow({
  index,
  gun,
  fixedType,
  onChange,
}: {
  index: number;
  gun: GunInput;
  fixedType: boolean;
  onChange: (patch: Partial<GunInput>) => void;
}) {
  return (
    <>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{formatGun(index + 1)}</span>
      {fixedType ? (
        <span style={{ fontSize: 13, color: C.slate }}>{gun.connectorType}</span>
      ) : (
        <select
          value={gun.connectorType}
          onChange={(e) => onChange({ connectorType: e.target.value })}
          style={inputStyle}
        >
          {CONNECTOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      <input
        value={gun.parkingLot}
        onChange={(e) => onChange({ parkingLot: e.target.value })}
        placeholder="e.g. B1-12"
        maxLength={40}
        style={inputStyle}
      />
    </>
  );
}
