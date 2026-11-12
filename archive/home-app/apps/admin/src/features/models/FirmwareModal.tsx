import { useState } from 'react';
import { C, Modal } from '@voltara/ui';
import { errorMessage } from '@/shared/lib/errors';
import {
  cancelButton,
  errorText,
  hintStyle,
  inputStyle,
  labelStyle,
  primaryState,
} from '@/shared/lib/styles';
import { useCreateFirmware } from './hooks';
import type { ChargerModel } from './types';

export function FirmwareModal({ model, onClose }: { model: ChargerModel; onClose: () => void }) {
  const create = useCreateFirmware();
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [isRollout, setIsRollout] = useState(false);

  const canSave = version.trim().length > 0 && !create.isPending;

  return (
    <Modal
      title="New firmware release"
      subtitle={`${model.name} · ${model.brand} ${model.model}`}
      onClose={onClose}
      width={480}
    >
      <div>
        <label style={labelStyle}>Version</label>
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="e.g. 1.4.2"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          autoFocus
        />
        <div style={hintStyle}>Unique per model, exactly as the unit reports it.</div>
      </div>
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What changed"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: C.ink,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={isRollout}
          onChange={(e) => setIsRollout(e.target.checked)}
          style={{ accentColor: C.green }}
        />
        Rolling out — the app offers this version to owners
      </label>

      {create.error && <div style={errorText}>{errorMessage(create.error)}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onClose} style={{ ...cancelButton, marginLeft: 'auto' }}>
          Cancel
        </button>
        <button
          onClick={() =>
            create.mutate(
              {
                model_id: model.id,
                version: version.trim(),
                notes: notes.trim() || null,
                is_rollout: isRollout,
              },
              { onSuccess: onClose },
            )
          }
          disabled={!canSave}
          style={primaryState(canSave, create.isPending)}
        >
          {create.isPending ? 'Saving…' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}
