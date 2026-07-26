// Brand tokens — single source of truth for colours, spacing, radii.
// See CLAUDE.md §1. Never inline hex values in feature code.

export const C = {
  green: '#1B512D',
  yellow: '#FECC3E',
  honeydew: '#E4F3E3',
  opal: '#97C8C0',
  seasalt: '#F9F9F9',
  white: '#FFFFFF',
  slate: '#767B77',
  black: '#000000',
  border: '#EBEBEB',
  divider: '#F3F3F3',
  hoverRow: '#FAFAFA',
  // Semantic accents — keep status badges and inline alerts consistent with
  // the rest of the palette without features inlining hex.
  error: '#C0321A',
  errorBg: '#FDEAEA',
  errorBgSoft: '#FFAAAA',
  info: '#1A62C0',
  infoBg: '#E3F0FF',
  warning: '#B07D00',
  warningBg: '#FFF8E1',
  ink: '#1a1a1a',
} as const;

export const RADIUS = {
  chip: 6,
  input: 8,
  button: 10,
  subCard: 12,
  card: 16,
  modal: 20,
  pill: 99,
} as const;

export const SPACE = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
} as const;

// Generic status pill colour map. Each transactional feature may extend it
// with its own statuses (e.g. invoice "Overdue") via STATUS_COLORS overrides.
export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Completed: { bg: '#E4F3E3', color: '#1B512D' },
  Pending: { bg: '#FFF8E1', color: '#B07D00' },
  'In Progress': { bg: '#E3F0FF', color: '#1A62C0' },
  Cancelled: { bg: '#FDEAEA', color: '#C0321A' },
  Active: { bg: '#E4F3E3', color: '#1B512D' },
  Inactive: { bg: '#F3F3F3', color: '#767B77' },
  Prospect: { bg: '#FFF8E1', color: '#B07D00' },
  Overdue: { bg: '#FDEAEA', color: '#C0321A' },
  Draft: { bg: '#F3F3F3', color: '#767B77' },
  Sent: { bg: '#E3F0FF', color: '#1A62C0' },
  Paid: { bg: '#E4F3E3', color: '#1B512D' },
  'Partially Paid': { bg: '#FFF8E1', color: '#B07D00' },
  'Case Won': { bg: '#E4F3E3', color: '#1B512D' },
  'Case Lost': { bg: '#FDEAEA', color: '#C0321A' },
  Expired: { bg: '#FFF0E0', color: '#B45309' },
  Submitted: { bg: '#E3F0FF', color: '#1A62C0' },
  Approved: { bg: '#E4F3E3', color: '#1B512D' },
  Received: { bg: '#E4F3E3', color: '#1B512D' },
  Partial: { bg: '#FFF8E1', color: '#B07D00' },
  Scheduled: { bg: '#E3F0FF', color: '#1A62C0' },
  Published: { bg: '#E4F3E3', color: '#1B512D' },
  'Needs Review': { bg: '#FFF8E1', color: '#B07D00' },
  'In Stock': { bg: '#E4F3E3', color: '#1B512D' },
  'Low Stock': { bg: '#FFF8E1', color: '#B07D00' },
  'Out of Stock': { bg: '#FDEAEA', color: '#C0321A' },
  Service: { bg: '#E3F0FF', color: '#1A62C0' },
  Unpaid: { bg: '#FFF8E1', color: '#B07D00' },
  Disputed: { bg: '#FFF0E0', color: '#B45309' },

  // ── CSMS statuses ─────────────────────────────────────────────
  // OCPP connector states + charge-point/command/session domain states,
  // mapped onto the same green/amber/blue/red/orange/grey families.
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
  Online: { bg: '#E4F3E3', color: '#1B512D' },
  Offline: { bg: '#FDEAEA', color: '#C0321A' },
  'Never Connected': { bg: '#F3F3F3', color: '#767B77' },
  Decommissioned: { bg: '#F3F3F3', color: '#767B77' },
  Orphaned: { bg: '#FFF0E0', color: '#B45309' },
  Queued: { bg: '#F3F3F3', color: '#767B77' },
  Accepted: { bg: '#E4F3E3', color: '#1B512D' },
  Rejected: { bg: '#FDEAEA', color: '#C0321A' },
  Timeout: { bg: '#FFF0E0', color: '#B45309' },
  Failed: { bg: '#FDEAEA', color: '#C0321A' },
  Blocked: { bg: '#FDEAEA', color: '#C0321A' },
  // Site types (locations)
  Public: { bg: '#E3F0FF', color: '#1A62C0' },
  Condo: { bg: '#EEF2FF', color: '#3730A3' },
  Workplace: { bg: '#E4F3E3', color: '#1B512D' },
  Home: { bg: '#FFF8E1', color: '#B07D00' },
  'Fleet Depot': { bg: '#FFF0E0', color: '#B45309' },
};
