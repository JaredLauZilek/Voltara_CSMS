// Realtime Broadcast contracts. One private channel per tenant; the gateway
// publishes, apps subscribe. Never use postgres_changes for telemetry —
// see CLAUDE.md §8 and docs/adr/0003-realtime-broadcast.md.

import type { CommandStatus, ConnectorStatus, ConnectionState, SessionStatus } from './domain';

/** Private broadcast channel for everything scoped to one tenant. */
export function tenantChannel(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/**
 * Public per-site channel for driver apps: connector status only. Readable
 * by any signed-in user (RLS on realtime.messages allows `site:%`).
 */
export function siteChannel(locationId: string): string {
  return `site:${locationId}`;
}

export const BROADCAST_EVENTS = {
  cpStatus: 'cp_status',
  sessionUpdate: 'session_update',
  meter: 'meter',
  /** Sent by a database trigger (realtime.send) when a remote command's status changes. */
  commandUpdate: 'command_update',
} as const;
export type BroadcastEvent = (typeof BROADCAST_EVENTS)[keyof typeof BROADCAST_EVENTS];

/** Connector status change or charge-point connection change. */
export interface CpStatusEvent {
  chargePointId: string;
  ocppIdentity: string;
  connectionState: ConnectionState;
  /** Present when a specific connector changed. */
  connector?: {
    ocppConnectorId: number;
    status: ConnectorStatus;
    errorCode?: string | null;
  };
  at: string; // ISO timestamp
}

export interface SessionUpdateEvent {
  sessionId: string;
  chargePointId: string;
  ocppConnectorId: number;
  status: SessionStatus;
  energyWh: number | null;
  at: string;
}

/** Throttled meter sample (≥5s per connector) for live session screens. */
export interface MeterEvent {
  sessionId: string;
  chargePointId: string;
  ocppConnectorId: number;
  powerW: number | null;
  energyWh: number | null;
  socPercent: number | null;
  at: string;
}

/** A remote command moved through its lifecycle (queued → sent → settled). */
export interface CommandUpdateEvent {
  commandId: string;
  chargePointId: string;
  action: string;
  status: CommandStatus;
  error: string | null;
  at: string;
}

/** Payload type for each broadcast event, for typed subscriptions. */
export interface BroadcastPayloads {
  cp_status: CpStatusEvent;
  session_update: SessionUpdateEvent;
  meter: MeterEvent;
  command_update: CommandUpdateEvent;
}
