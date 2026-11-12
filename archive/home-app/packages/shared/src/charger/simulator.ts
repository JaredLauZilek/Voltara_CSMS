// A charger that exists only in memory. Drives the app in development, in
// vitest, and in the App Store review build (reviewers have no charger). It
// implements the same ChargerLink surface as a real unit, so screens cannot
// tell the difference — which is the point.

import type { ChargerInfo, ChargerLink, ChargerState, ChargerStatus, Unsubscribe } from './types';

export interface SimulatorOptions {
  serial: string;
  ratedAmps?: number;
  phases?: 1 | 3;
  nominalVoltage?: number;
  /** Lifetime meter at boot, kWh. */
  initialEnergyKwh?: number;
  /** Starting limit, amps. */
  maxCurrentA?: number;
  firmware?: string;
  /** What the "vehicle" asks for, amps. */
  vehicleDemandA?: number;
  now?: () => number;
}

type Listener = (s: ChargerStatus) => void;

/**
 * Pure physics + state machine. `tick(now)` advances time; nothing inside
 * schedules itself, so tests can step it deterministically. `SimulatedLink`
 * below adds the timer.
 */
export class ChargerSimulator {
  readonly info: ChargerInfo;
  private readonly ratedAmps: number;
  private readonly phases: 1 | 3;
  private readonly voltage: number;
  private readonly vehicleDemandA: number;
  private readonly now: () => number;
  private listeners = new Set<Listener>();
  private lastTick: number;
  private rampA = 0;

  status: ChargerStatus;

  constructor(opts: SimulatorOptions) {
    this.ratedAmps = opts.ratedAmps ?? 32;
    this.phases = opts.phases ?? 1;
    this.voltage = opts.nominalVoltage ?? 230;
    this.vehicleDemandA = opts.vehicleDemandA ?? 32;
    this.now = opts.now ?? Date.now;
    this.lastTick = this.now();
    this.info = {
      serial: opts.serial,
      protocol: 'mock',
      model: 'Simulator',
      firmware: opts.firmware ?? 'sim-1.0.0',
      ratedAmps: this.ratedAmps,
      phases: this.phases,
    };
    this.status = {
      state: 'Available',
      plugged: false,
      charging: false,
      powerKw: 0,
      currentA: [0, 0, 0],
      voltageV:
        this.phases === 3 ? [this.voltage, this.voltage, this.voltage] : [this.voltage, 0, 0],
      energyTotalKwh: opts.initialEnergyKwh ?? 1234.5,
      sessionKwh: 0,
      maxCurrentA: Math.min(opts.maxCurrentA ?? this.ratedAmps, this.ratedAmps),
      temperatureC: 31,
      cableLocked: false,
      faultCode: null,
      at: this.lastTick,
    };
  }

  subscribe(cb: Listener): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ── Bench controls (dev screen / tests) ──────────────────────────────────

  plugIn(): void {
    if (this.status.faultCode) return;
    if (!this.status.plugged) {
      this.status.plugged = true;
      this.status.sessionKwh = 0;
      this.setState('Preparing');
    }
  }

  unplug(): void {
    this.status.plugged = false;
    this.status.charging = false;
    this.rampA = 0;
    this.setState(this.status.faultCode ? 'Faulted' : 'Available');
  }

  injectFault(code = 'E07'): void {
    this.status.faultCode = code;
    this.status.charging = false;
    this.rampA = 0;
    this.setState('Faulted');
  }

  clearFault(): void {
    this.status.faultCode = null;
    this.setState(this.status.plugged ? 'Preparing' : 'Available');
  }

  /** The car stops drawing (battery full / car-side pause). */
  vehiclePause(): void {
    if (this.status.state === 'Charging') {
      this.status.charging = false;
      this.rampA = 0;
      this.setState('SuspendedEV');
    }
  }

  // ── Commands (what the app can do) ───────────────────────────────────────

  start(): void {
    if (this.status.faultCode) throw new Error('Charger is faulted');
    if (!this.status.plugged) throw new Error('No vehicle connected');
    this.status.charging = true;
    this.setState('Charging');
  }

  stop(): void {
    if (this.status.state === 'Charging' || this.status.state === 'SuspendedEV') {
      this.status.charging = false;
      this.rampA = 0;
      this.setState('SuspendedEVSE');
    }
  }

  setMaxCurrent(amps: number): void {
    if (!Number.isFinite(amps)) throw new Error('Invalid current');
    this.status.maxCurrentA = Math.max(6, Math.min(Math.round(amps), this.ratedAmps));
  }

  setCableLock(locked: boolean): void {
    this.status.cableLocked = locked;
  }

  // ── Physics ──────────────────────────────────────────────────────────────

  tick(now = this.now()): ChargerStatus {
    const dtH = Math.max(0, now - this.lastTick) / 3_600_000;
    this.lastTick = now;
    const s = this.status;

    if (s.charging) {
      const target = Math.min(s.maxCurrentA, this.vehicleDemandA, this.ratedAmps);
      // Real chargers ramp ~2 A per second after a start.
      this.rampA = this.rampA < target ? Math.min(target, this.rampA + 2) : target;
      const jitter = () => this.rampA * (0.985 + Math.random() * 0.03);
      s.currentA = this.phases === 3 ? [jitter(), jitter(), jitter()] : [jitter(), 0, 0];
      const vj = () => this.voltage * (0.99 + Math.random() * 0.02);
      s.voltageV = this.phases === 3 ? [vj(), vj(), vj()] : [vj(), 0, 0];
      s.powerKw =
        (s.currentA[0] * s.voltageV[0] +
          s.currentA[1] * s.voltageV[1] +
          s.currentA[2] * s.voltageV[2]) /
        1000;
      const kwh = s.powerKw * dtH;
      s.energyTotalKwh += kwh;
      s.sessionKwh += kwh;
      s.temperatureC = Math.min(55, (s.temperatureC ?? 30) + 0.05);
    } else {
      s.currentA = [0, 0, 0];
      s.powerKw = 0;
      s.temperatureC = Math.max(28, (s.temperatureC ?? 30) - 0.02);
    }
    s.at = now;
    this.emit();
    return { ...s, currentA: [...s.currentA], voltageV: [...s.voltageV] };
  }

  private setState(state: ChargerState): void {
    this.status.state = state;
    this.status.at = this.now();
    this.emit();
  }

  private emit(): void {
    const snap: ChargerStatus = {
      ...this.status,
      currentA: [...this.status.currentA],
      voltageV: [...this.status.voltageV],
    };
    for (const cb of this.listeners) cb(snap);
  }
}

/**
 * ChargerLink over a simulator with a wall-clock timer. The timer runs only
 * while someone is connected, like a real link.
 */
export class SimulatedLink implements ChargerLink {
  readonly info: ChargerInfo;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disconnectListeners = new Set<(reason: string | null) => void>();

  constructor(
    readonly sim: ChargerSimulator,
    tickMs = 1000,
    private readonly latencyMs = 120,
  ) {
    this.info = sim.info;
    this.timer = setInterval(() => sim.tick(), tickMs);
  }

  private async roundTrip<T>(fn: () => T): Promise<T> {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    return fn();
  }

  readStatus(): Promise<ChargerStatus> {
    return this.roundTrip(() => this.sim.tick());
  }

  subscribe(cb: (status: ChargerStatus) => void): Unsubscribe {
    return this.sim.subscribe(cb);
  }

  onDisconnect(cb: (reason: string | null) => void): Unsubscribe {
    this.disconnectListeners.add(cb);
    return () => this.disconnectListeners.delete(cb);
  }

  start(): Promise<void> {
    return this.roundTrip(() => this.sim.start());
  }

  stop(): Promise<void> {
    return this.roundTrip(() => this.sim.stop());
  }

  setMaxCurrent(amps: number): Promise<void> {
    return this.roundTrip(() => this.sim.setMaxCurrent(amps));
  }

  setCableLock(locked: boolean): Promise<void> {
    return this.roundTrip(() => this.sim.setCableLock(locked));
  }

  async disconnect(): Promise<void> {
    this.dropped(null);
  }

  /** Simulate the radio link falling over (bench control). */
  dropped(reason: string | null): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const cb of this.disconnectListeners) cb(reason);
    this.disconnectListeners.clear();
  }
}
