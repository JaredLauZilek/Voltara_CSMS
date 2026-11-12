import { useEffect, useMemo, useState } from 'react';
import { Badge, C, KPICard, STATUS_COLORS, Toolbar } from '@voltara/ui';
import { useAuth } from '@/app/auth';
import { errorMessage } from '@/shared/lib/errors';
import { formatDateTime } from '@/shared/lib/format';
import {
  card,
  cardHeader,
  emptyState,
  rowStyle,
  secondaryButton,
  sectionTitle,
  smallButton,
  table,
  td,
  th,
} from '@/shared/lib/styles';
import { useCreateModel, useFirmware, useModels, useUpdateModel } from './hooks';
import { ModelModal } from './ModelModal';
import { FirmwareModal } from './FirmwareModal';
import type { ChargerModel, ModelFormRow } from './types';

const COLUMNS = ['Brand', 'Model', 'Name', 'kW', 'A', 'Phases', 'Protocol', 'Active', ''];

export function ModelsScreen() {
  const { isStaffAdmin, isStaffSupport } = useAuth();
  const { data: models = [], isLoading } = useModels();
  const createMut = useCreateModel();
  const updateMut = useUpdateModel();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ChargerModel | 'new' | null>(null);
  const [showFirmware, setShowFirmware] = useState(false);

  useEffect(() => {
    createMut.reset();
    updateMut.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      [m.brand, m.model, m.name, m.protocol].some((s) => s.toLowerCase().includes(q)),
    );
  }, [models, search]);

  // The firmware panel follows the selected row, defaulting to the first one.
  const selected = models.find((m) => m.id === selectedId) ?? filtered[0] ?? null;
  const { data: firmware = [], isLoading: firmwareLoading } = useFirmware(selected?.id ?? null);

  // Live-derived record for the modal, never the row captured at click time.
  const modalRecord =
    modal && modal !== 'new' ? (models.find((m) => m.id === modal.id) ?? modal) : null;

  const handleSave = (row: ModelFormRow) => {
    if (modal === 'new') {
      createMut.mutate(row, { onSuccess: () => setModal(null) });
    } else if (modalRecord) {
      updateMut.mutate({ id: modalRecord.id, patch: row }, { onSuccess: () => setModal(null) });
    }
  };

  const active = models.filter((m) => m.is_active).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard label="Models" value={models.length} sub={`${active} active`} accent />
        <KPICard
          label="Brands"
          value={new Set(models.map((m) => m.brand)).size}
          sub="Supported over BLE"
        />
        <KPICard
          label="Firmware releases"
          value={selected ? firmware.length : '—'}
          sub={selected ? selected.name : 'Select a model'}
        />
        <KPICard
          label="Rolling out"
          value={selected ? firmware.filter((f) => f.is_rollout).length : '—'}
          sub="Offered to owners"
        />
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search brand, model or protocol…"
        primaryLabel={isStaffAdmin ? '+ Add model' : undefined}
        onPrimary={isStaffAdmin ? () => setModal('new') : undefined}
      />

      <div style={card}>
        <table style={table}>
          <thead>
            <tr style={{ background: C.seasalt }}>
              {COLUMNS.map((h, i) => (
                <th key={i} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const isSelected = selected?.id === m.id;
              return (
                <tr
                  key={m.id}
                  style={{
                    ...rowStyle,
                    cursor: 'pointer',
                    background: isSelected ? C.honeydew : 'transparent',
                  }}
                  onClick={() => setSelectedId(m.id)}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = C.hoverRow;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{m.brand}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{m.model}</td>
                  <td style={{ ...td, color: C.ink }}>{m.name}</td>
                  <td style={td}>{m.rated_kw}</td>
                  <td style={td}>{m.rated_amps}</td>
                  <td style={td}>{m.phases}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{m.protocol}</td>
                  <td style={td}>
                    <Badge status={m.is_active ? 'Active' : 'Inactive'} />
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {isStaffAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal(m);
                        }}
                        style={{ ...secondaryButton, ...smallButton }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isLoading && <div style={emptyState}>Loading…</div>}
        {!isLoading && filtered.length === 0 && <div style={emptyState}>No models found.</div>}
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <span style={sectionTitle}>Firmware releases{selected ? ` · ${selected.name}` : ''}</span>
          {isStaffSupport && selected && (
            <button
              onClick={() => setShowFirmware(true)}
              style={{ ...secondaryButton, ...smallButton, marginLeft: 'auto' }}
            >
              + Add release
            </button>
          )}
        </div>
        {!selected ? (
          <div style={emptyState}>Select a model to see its releases.</div>
        ) : (
          <>
            <table style={table}>
              <thead>
                <tr style={{ background: C.seasalt }}>
                  {['Version', 'Rollout', 'Notes', 'Created'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {firmware.map((f) => (
                  <tr key={f.id} style={rowStyle}>
                    <td style={{ ...td, color: C.ink, fontWeight: 600, fontFamily: 'monospace' }}>
                      {f.version}
                    </td>
                    <td style={td}>
                      <Badge
                        status={f.is_rollout ? 'Rolling out' : 'Held'}
                        override={STATUS_COLORS[f.is_rollout ? 'Active' : 'Inactive']}
                      />
                    </td>
                    <td style={td}>{f.notes ?? '—'}</td>
                    <td style={td}>{formatDateTime(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!firmwareLoading && firmware.length === 0 && (
              <div style={emptyState}>No releases yet.</div>
            )}
          </>
        )}
      </div>

      {(modal === 'new' || modalRecord) && (
        <ModelModal
          model={modal === 'new' ? null : modalRecord}
          onClose={() => setModal(null)}
          onSave={handleSave}
          isSaving={createMut.isPending || updateMut.isPending}
          saveError={errorMessage(createMut.error) ?? errorMessage(updateMut.error)}
        />
      )}
      {showFirmware && selected && (
        <FirmwareModal model={selected} onClose={() => setShowFirmware(false)} />
      )}
    </div>
  );
}
