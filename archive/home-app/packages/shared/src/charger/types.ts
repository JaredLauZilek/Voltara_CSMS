// Charger domain model shared by the app, the admin and the database RPCs.
// Protocol-agnostic: a HiCi unit, a future brand and the simulator all
// resolve to these shapes. Wire formats live under ./hici (and later ./<brand>).

import type { ChargerProtocol } from '../domain';

/**
 * Operating state. Deliberately the OCPP 1.6 vocabulary (also used by the
 * CSMS) so the two products agree on status pills and the Wi-Fi/OCPP path
 * maps 1:1 later. 'Unknown' = never read since connect.
 */
export const CHARGER_STATES = [
  'Available',
  'Preparing',
  'Charging',
  'SuspendedEV',
  'SuspendedEVSE',
  'Finishing',
  'Faulted',
  'Unavailable',
  'Unknown',
] as const;
export type ChargerState = (typeof CHARGER_STATES)[number];

/** Three-phase vector; unused phases are 0. Single-phase units fill index 0. */
export type PhaseTriple = [number, number, number];

export interface ChargerStatus {
  state: ChargerState;
  /** Vehicle/cable detected (Preparing or later). */
  plugged: boolean;
  /** Energy flowing right now. */
  charging: boolean;
  powerKw: number;
  currentA: PhaseTriple;
  voltageV: PhaseTriple;
  /** Lifetime meter register. */
  energyTotalKwh: number;
  /** Since the current plug-in. */
  sessionKwh: number;
  /** Limit the charger is applying (owner setting ∧ installer rating ∧ vehicle). */
  maxCurrentA: number;
  temperatureC: number | null;
  cableLocked: boolean;
  faultCode: string | null;
  /** ms since epoch, phone clock at receipt. */
  at: number;
}

export interface ChargerInfo {
  serial: string;
  protocol: ChargerProtocol;
  model?: string;
  firmware?: string;
  ratedAmps?: number;
  phases?: 1 | 3;
}

export interface ChargerCommands {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** 6–rated amps. The charger clamps; the app re-reads the applied value. */
  setMaxCurrent(amps: number): Promise<void>;
  setCableLock(locked: boolean): Promise<void>;
}

export type Unsubscribe = () => void;

/** A connected and authenticated charger, whatever the brand. */
export interface ChargerLink extends ChargerCommands {
  readonly info: ChargerInfo;
  readStatus(): Promise<ChargerStatus>;
  subscribe(cb: (status: ChargerStatus) => void): Unsubscribe;
  onDisconnect(cb: (reason: string | null) => void): Unsubscribe;
  disconnect(): Promise<void>;
}

/** What the app presents to a charger to be allowed in. */
export interface PairingCredentials {
  serial: string;
  /** Printed on the unit / QR code. HiCi: see ./hici. */
  pin?: string;
  /** Backend-issued token, for protocols that use challenge–response. */
  token?: string;
}

export const UNKNOWN_STATUS: ChargerStatus = {
  state: 'Unknown',
  plugged: false,
  charging: false,
  powerKw: 0,
  currentA: [0, 0, 0],
  voltageV: [0, 0, 0],
  energyTotalKwh: 0,
  sessionKwh: 0,
  maxCurrentA: 0,
  temperatureC: null,
  cableLocked: false,
  faultCode: null,
  at: 0,
};

/** Status → STATUS_COLORS family in @voltara/ui (and the app's STATUS map). */
export function statePill(state: ChargerState, connected: boolean): string {
  if (!connected) return 'Offline';
  return state;
}

export function stateLabel(state: ChargerState): string {
  switch (state) {
    case 'Available':
      return 'Ready';
    case 'Preparing':
      return 'Plugged in';
    case 'Charging':
      return 'Charging';
    case 'SuspendedEV':
      return 'Paused by car';
    case 'SuspendedEVSE':
      return 'Paused';
    case 'Finishing':
      return 'Finishing';
    case 'Faulted':
      return 'Fault';
    case 'Unavailable':
      return 'Unavailable';
    default:
      return 'Unknown';
  }
}

/** Row shape accepted by the `ingest_readings` RPC (jsonb array element). */
export interface ReadingRow {
  at: string; // ISO timestamp
  state: ChargerState;
  power_kw: number;
  i1: number;
  i2: number;
  i3: number;
  v1: number;
  v2: number;
  v3: number;
  energy_total_kwh: number;
  session_kwh: number;
  temperature_c: number | null;
  source: 'ble' | 'wifi' | 'sim';
}

export function toReadingRow(s: ChargerStatus, source: ReadingRow['source']): ReadingRow {
  return {
    at: new Date(s.at).toISOString(),
    state: s.state,
    power_kw: round(s.powerKw, 3),
    i1: round(s.currentA[0], 2),
    i2: round(s.currentA[1], 2),
    i3: round(s.currentA[2], 2),
    v1: round(s.voltageV[0], 1),
    v2: round(s.voltageV[1], 1),
    v3: round(s.voltageV[2], 1),
    energy_total_kwh: round(s.energyTotalKwh, 3),
    session_kwh: round(s.sessionKwh, 3),
    temperature_c: s.temperatureC == null ? null : round(s.temperatureC, 1),
    source,
  };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
