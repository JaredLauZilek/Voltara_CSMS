// Voltara tokens — byte-identical to @voltara/ui `C` (CLAUDE.md §2). The app
// cannot import @voltara/ui (it depends on react-dom / CSS), so the values
// are mirrored here. Light mode only.
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
  Online: { bg: '#E4F3E3', color: '#1B512D' },
  Connected: { bg: '#E4F3E3', color: '#1B512D' },
  Connecting: { bg: '#E3F0FF', color: '#1A62C0' },
  Disconnected: { bg: '#F3F3F3', color: '#767B77' },
  // Lifecycle
  Draft: { bg: '#F3F3F3', color: '#767B77' },
  Scheduled: { bg: '#E3F0FF', color: '#1A62C0' },
  Active: { bg: '#E4F3E3', color: '#1B512D' },
  Decommissioned: { bg: '#F3F3F3', color: '#767B77' },
  Pending: { bg: '#FFF8E1', color: '#B07D00' },
  Completed: { bg: '#E4F3E3', color: '#1B512D' },
};

export const ThemeContext = createContext<Theme>(C);
export const useTheme = () => useContext(ThemeContext);

/**
 * Figtree is the only typeface (CLAUDE.md §2). With custom fonts React
 * Native picks the face by family name, so weights are separate families;
 * use `font('bold')` instead of fontWeight.
 */
export const FONT = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold',
} as const;
export type FontWeight = keyof typeof FONT;
export const font = (w: FontWeight = 'regular') => ({ fontFamily: FONT[w] });
