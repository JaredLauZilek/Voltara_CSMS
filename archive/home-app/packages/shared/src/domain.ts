// Domain enums for Voltara Home. These mirror the CHECK constraints in
// supabase/migrations — change both together.

/** Lifecycle of a charger unit from factory to decommissioning. */
export const CHARGER_LIFECYCLES = [
  'registered',
  'commissioned',
  'claimed',
  'decommissioned',
] as const;
export type ChargerLifecycle = (typeof CHARGER_LIFECYCLES)[number];

export const CHARGER_LIFECYCLE_LABELS: Record<ChargerLifecycle, string> = {
  registered: 'Registered',
  commissioned: 'Commissioned',
  claimed: 'Claimed',
  decommissioned: 'Decommissioned',
};

/** Status-pill family for each lifecycle (keys of STATUS_COLORS in @voltara/ui). */
export const CHARGER_LIFECYCLE_PILL: Record<ChargerLifecycle, string> = {
  registered: 'Draft',
  commissioned: 'Scheduled',
  claimed: 'Active',
  decommissioned: 'Decommissioned',
};

export const PHASE_MODES = ['auto', 'single', 'three'] as const;
export type PhaseMode = (typeof PHASE_MODES)[number];
export const PHASE_MODE_LABELS: Record<PhaseMode, string> = {
  auto: 'Auto',
  single: '1-phase',
  three: '3-phase',
};

export const STAFF_ROLES = ['admin', 'support', 'viewer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const DEALER_ROLES = ['dealer_admin', 'installer'] as const;
export type DealerRole = (typeof DEALER_ROLES)[number];
export const DEALER_ROLE_LABELS: Record<DealerRole, string> = {
  dealer_admin: 'Dealer admin',
  installer: 'Installer',
};

export const CHARGER_MEMBER_ROLES = ['member', 'guest'] as const;
export type ChargerMemberRole = (typeof CHARGER_MEMBER_ROLES)[number];

/** What the signed-in person is to a given charger, as resolved by `charger_role()` in SQL. */
export const CHARGER_ACTOR_ROLES = ['staff', 'owner', 'member', 'guest', 'dealer'] as const;
export type ChargerActorRole = (typeof CHARGER_ACTOR_ROLES)[number];

export const EVENT_SEVERITIES = ['info', 'warning', 'error'] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_PILL: Record<TicketStatus, string> = {
  open: 'Pending',
  in_progress: 'In Progress',
  resolved: 'Completed',
  closed: 'Inactive',
};

export const READING_SOURCES = ['ble', 'wifi', 'sim'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

/** Charger protocols the mobile app knows how to drive. */
export const CHARGER_PROTOCOLS = ['hici-v1', 'mock'] as const;
export type ChargerProtocol = (typeof CHARGER_PROTOCOLS)[number];

export const MY_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Kuala Lumpur',
  'Labuan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Putrajaya',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
] as const;
export type MyState = (typeof MY_STATES)[number];
