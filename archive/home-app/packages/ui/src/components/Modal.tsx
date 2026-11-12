import type { ReactNode } from 'react';
import { C } from '../tokens';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, subtitle, onClose, children, width = 640 }: Props) {
  return (
    <div
      className="voltara-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.32)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Always leave a small breathing margin on tablet so the modal isn't
        // glued to the screen edges. Mobile-specific overrides live in
        // styles.css (`.voltara-modal-backdrop`/`.voltara-modal`).
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="voltara-modal"
        style={{
          background: C.white,
          borderRadius: 20,
          // Clamp to the viewport so an iPad-portrait or Galaxy-Fold-folded
          // device never sees the modal extend past its edges. Width prop
          // remains the maximum target on desktop.
          width: '100%',
          maxWidth: width,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          padding: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: C.divider,
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 16,
              color: C.slate,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
