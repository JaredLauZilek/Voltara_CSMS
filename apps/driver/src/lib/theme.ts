// Voltara tokens — byte-identical to @voltara/ui `C` (CLAUDE.md §2). The
// driver app cannot import @voltara/ui (it depends on react-dom / CSS), so the
// values are mirrored here and a site's theme overrides them at runtime.
import { createContext, useContext } from 'react';

export const C = {
  green: '#1B512D',
  yellow: '#FECC3E',
  honeydew: '#E4F3E3',
  opal: '#97C8C0',
  seasalt: '#F9F9F9',
  white: '#FFFFFF',
  slate: '#767B77',
  border: '#EBEBEB',
  divider: '#F3F3F3',
  hoverRow: '#FAFAFA',
  error: '#C0321A',
  errorBg: '#FDEAEA',
  info: '#1A62C0',
  infoBg: '#E3F0FF',
  warning: '#B07D00',
  warningBg: '#FFF8E1',
  ink: '#1a1a1a',
} as const;

export type Theme = typeof C;

/** Status → colour family, mirroring STATUS_COLORS in @voltara/ui. */
export const STATUS: Record<string, { bg: string; color: string }> = {
  Available: { bg: '#E4F3E3', color: '#1B512D' },
  Preparing: { bg: '#FFF8E1', color: '#B07D00' },
  Charging: { bg: '#E3F0FF', color: '#1A62C0' },
  SuspendedEV: { bg: '#FFF8E1', color: '#B07D00' },
  SuspendedEVSE: { bg: '#FFF8E1', color: '#B07D00' },
  Finishing: { bg: '#E3F0FF', color: '#1A62C0' },
  Reserved: { bg: '#FFF0E0', color: '#B45309' },
  Unavailable: { bg: '#F3F3F3', color: '#767B77' },
  Faulted: { bg: '#FDEAEA', color: '#C0321A' },
  Unknown: { bg: '#F3F3F3', color: '#767B77' },
  Offline: { bg: '#FDEAEA', color: '#C0321A' },
};

export const ThemeContext = createContext<Theme>(C);
export const useTheme = () => useContext(ThemeContext);

/** Applies a tenant's `theme` jsonb (token overrides) on top of the default. */
export function mergeTheme(overrides: Record<string, unknown> | null | undefined): Theme {
  if (!overrides) return C;
  const out: Record<string, string> = { ...C };
  for (const [k, v] of Object.entries(overrides)) {
    if (k in C && typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v;
  }
  return out as Theme;
}
