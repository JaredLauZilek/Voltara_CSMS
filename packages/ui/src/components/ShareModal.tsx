import { useEffect } from 'react';
import { C } from '../tokens';
import { Modal } from './Modal';

export interface ShareMethod {
  id: string;
  /** Single character / glyph rendered as the leading icon. */
  icon: string;
  label: string;
  /** Short subtitle inside the tile — e.g. "Send to +60123…" or "Coming soon". */
  hint: string;
  enabled: boolean;
  /** Required when enabled — invoked on click. */
  onClick?: () => void;
}

interface Props {
  title: string;
  subtitle?: string;
  /** Recipient summary card shown at the top of the picker. */
  recipient: { name: string; sub?: string };
  methods: ShareMethod[];
  onClose: () => void;
}

/**
 * Generic share-method picker. Each entity screen (Sales / Invoices / POs)
 * builds its own `methods` array and owns the per-method child modals so the
 * picker stays generic and entity-agnostic.
 */
export function ShareModal({ title, subtitle, recipient, methods, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <div
        style={{
          background: C.seasalt,
          borderRadius: 12,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{recipient.name}</div>
        {recipient.sub ? <div style={{ fontSize: 11, color: C.slate }}>{recipient.sub}</div> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {methods.map((m) => (
          <button
            key={m.id}
            onClick={() => m.enabled && m.onClick?.()}
            disabled={!m.enabled}
            style={{
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 12,
              border: `1px solid ${m.enabled ? C.green : C.border}`,
              background: m.enabled ? C.white : C.seasalt,
              color: m.enabled ? '#1a1a1a' : C.slate,
              fontFamily: 'Figtree',
              fontSize: 13,
              fontWeight: 600,
              cursor: m.enabled ? 'pointer' : 'not-allowed',
              opacity: m.enabled ? 1 : 0.6,
            }}
          >
            <span
              style={{
                fontSize: 22,
                color: m.enabled ? C.green : C.slate,
                width: 26,
                textAlign: 'center',
              }}
            >
              {m.icon}
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: m.enabled ? C.green : C.slate }}>
                {m.label}
              </span>
              <span style={{ fontSize: 11, color: C.slate, fontWeight: 500 }}>{m.hint}</span>
            </span>
            {m.enabled && <span style={{ color: C.slate, fontSize: 14 }}>›</span>}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex' }}>
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
          Close
        </button>
      </div>
    </Modal>
  );
}
