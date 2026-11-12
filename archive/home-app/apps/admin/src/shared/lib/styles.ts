// Inline-style presets shared by the admin feature screens. Every value comes
// from the design tokens (CLAUDE.md §2) so feature code never inlines hex.
import type { CSSProperties } from 'react';
import { C } from '@voltara/ui';

export const card: CSSProperties = {
  background: C.white,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  overflow: 'hidden',
};

export const paddedCard: CSSProperties = {
  ...card,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

export const cardHeader: CSSProperties = {
  padding: '16px 24px',
  borderBottom: `1px solid ${C.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

export const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };

export const th: CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
};

export const td: CSSProperties = { padding: '13px 16px', color: C.slate, verticalAlign: 'middle' };

export const rowStyle: CSSProperties = { borderBottom: `1px solid ${C.divider}` };

export const emptyState: CSSProperties = {
  padding: 32,
  textAlign: 'center',
  color: C.slate,
  fontSize: 14,
};

export const inputStyle: CSSProperties = {
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

export const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: 6,
};

export const hintStyle: CSSProperties = {
  fontSize: 11,
  color: C.slate,
  marginTop: 4,
  lineHeight: 1.5,
};

/** Mutation errors: red 11/600, inline, never alert(). */
export const errorText: CSSProperties = { fontSize: 11, fontWeight: 600, color: C.error };

const buttonBase: CSSProperties = {
  borderRadius: 10,
  fontFamily: 'Figtree',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const primaryButton: CSSProperties = {
  ...buttonBase,
  padding: '10px 24px',
  border: 'none',
  background: C.green,
  color: C.white,
};

export const secondaryButton: CSSProperties = {
  ...buttonBase,
  padding: '9px 18px',
  border: `1px solid ${C.border}`,
  background: C.white,
  color: C.green,
};

export const cancelButton: CSSProperties = {
  ...buttonBase,
  padding: '10px 20px',
  border: `1px solid ${C.border}`,
  background: 'transparent',
  color: C.slate,
  fontWeight: 600,
};

export const dangerOutlineButton: CSSProperties = {
  ...buttonBase,
  padding: '10px 16px',
  border: `1px solid ${C.errorBg}`,
  background: 'transparent',
  color: C.error,
  fontWeight: 600,
};

export const dangerButton: CSSProperties = {
  ...buttonBase,
  padding: '8px 14px',
  border: 'none',
  background: C.error,
  color: C.white,
};

/** Table-row sized variant: spread after one of the buttons above. */
export const smallButton: CSSProperties = { padding: '6px 12px', borderRadius: 8, fontSize: 12 };

/** Primary button that greys out while disabled and shows a wait cursor while busy. */
export function primaryState(enabled: boolean, busy = false): CSSProperties {
  return {
    ...primaryButton,
    background: enabled ? C.green : C.slate,
    cursor: enabled ? 'pointer' : busy ? 'wait' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
  };
}

export const linkStyle: CSSProperties = { color: C.green, fontWeight: 600, textDecoration: 'none' };

export const backLink: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: C.slate,
  textDecoration: 'none',
};

/** Filter pill used for the "selected" state of in-page option groups. */
export function optionPill(active: boolean): CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: 99,
    border: `2px solid ${active ? C.green : C.border}`,
    background: active ? C.honeydew : C.white,
    color: active ? C.green : C.slate,
    fontFamily: 'Figtree',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
}
