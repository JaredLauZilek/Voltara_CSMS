// HiCi driver: frames from @voltara/shared/charger/hici over the transport.
// Protocol assumptions are documented in packages/shared/src/charger/hici —
// this file only sequences them: connect → notify → auth → info → ready.

import { hici } from '@voltara/shared';
import type { ChargerInfo, ChargerLink, ChargerStatus, Unsubscribe } from '@voltara/shared';
import { UNKNOWN_STATUS } from '@voltara/shared';
import type { BleTransport, ConnectedDevice } from '../transport';
import type { ChargerDriver } from './types';

const { HICI_GATT, HICI_COMMAND_TIMEOUT_MS, HiciCmd } = hici;

interface Pending {
  expect: number[]; // reply command ids that settle this request
  resolve: (f: hici.HiciFrame) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class HiciLink implements ChargerLink {
  readonly info: ChargerInfo;
  private parser = new hici.FrameParser();
  private statusListeners = new Set<(s: ChargerStatus) => void>();
  private disconnectListeners = new Set<(reason: string | null) => void>();
  private pending: Pending | null = null;
  private queue: Array<() => void> = [];
  private stopMonitor: Unsubscribe | null = null;
  private stopDisconnect: Unsubscribe | null = null;
  private lastStatus: ChargerStatus = UNKNOWN_STATUS;
  private writeWithResponse = true;

  constructor(
    private readonly device: ConnectedDevice,
    info: ChargerInfo,
  ) {
    this.info = info;
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  attach(): void {
    this.stopMonitor = this.device.monitor(
      HICI_GATT.service,
      HICI_GATT.notify,
      (bytes) => {
        for (const frame of this.parser.push(bytes)) this.onFrame(frame);
      },
      (e) => console.warn('hici notify error', e.message),
    );
    this.stopDisconnect = this.device.onDisconnected((reason) => this.teardown(reason));
  }

  private onFrame(frame: hici.HiciFrame): void {
    if (frame.cmd === HiciCmd.StatusPush || frame.cmd === HiciCmd.GetStatus) {
      try {
        this.lastStatus = hici.decodeStatus(frame.payload);
        for (const cb of this.statusListeners) cb(this.lastStatus);
      } catch (e) {
        console.warn('hici status decode failed', (e as Error).message, hici.hex(frame.payload));
      }
    }
    const p = this.pending;
    if (p && p.expect.includes(frame.cmd)) {
      clearTimeout(p.timer);
      this.pending = null;
      if (frame.cmd === HiciCmd.Nak) p.reject(new Error('Charger rejected the command'));
      else p.resolve(frame);
      this.queue.shift()?.();
    }
  }

  /** One request in flight at a time; others wait their turn. */
  private request(bytes: Uint8Array, expect: number[]): Promise<hici.HiciFrame> {
    return new Promise((resolve, reject) => {
      const run = () => {
        const timer = setTimeout(() => {
          this.pending = null;
          reject(new Error('Charger did not answer in time'));
          this.queue.shift()?.();
        }, HICI_COMMAND_TIMEOUT_MS);
        this.pending = { expect: [...expect, HiciCmd.Nak], resolve, reject, timer };
        this.device
          .write(HICI_GATT.service, HICI_GATT.write, bytes, this.writeWithResponse)
          .catch(async (e: Error) => {
            // Some modules only accept write-without-response; try once.
            if (this.writeWithResponse) {
              this.writeWithResponse = false;
              try {
                await this.device.write(HICI_GATT.service, HICI_GATT.write, bytes, false);
                return;
              } catch (e2) {
                e = e2 as Error;
              }
            }
            clearTimeout(timer);
            this.pending = null;
            reject(e);
            this.queue.shift()?.();
          });
      };
      if (this.pending) this.queue.push(run);
      else run();
    });
  }

  async authenticate(pin: string): Promise<void> {
    await this.request(hici.encodeAuth(pin), [HiciCmd.Ack, HiciCmd.Auth]);
  }

  async loadInfo(): Promise<void> {
    try {
      const reply = await this.request(hici.encodeSimple(HiciCmd.GetInfo), [HiciCmd.GetInfo]);
      const info = hici.decodeInfo(reply.payload);
      Object.assign(this.info, {
        firmware: info.firmware || this.info.firmware,
        ratedAmps: info.ratedAmps,
        phases: info.phases,
      });
    } catch (e) {
      // Info is nice-to-have; a unit that lacks it still works.
      console.warn('hici info unavailable', (e as Error).message);
    }
  }

  // ── ChargerLink ──────────────────────────────────────────────────────────

  async readStatus(): Promise<ChargerStatus> {
    const reply = await this.request(hici.encodeSimple(HiciCmd.GetStatus), [
      HiciCmd.GetStatus,
      HiciCmd.StatusPush,
    ]);
    this.lastStatus = hici.decodeStatus(reply.payload);
    return this.lastStatus;
  }

  subscribe(cb: (status: ChargerStatus) => void): Unsubscribe {
    this.statusListeners.add(cb);
    if (this.lastStatus.state !== 'Unknown') cb(this.lastStatus);
    return () => this.statusListeners.delete(cb);
  }

  onDisconnect(cb: (reason: string | null) => void): Unsubscribe {
    this.disconnectListeners.add(cb);
    return () => this.disconnectListeners.delete(cb);
  }

  async start(): Promise<void> {
    await this.request(hici.encodeSimple(HiciCmd.Start), [HiciCmd.Ack]);
  }

  async stop(): Promise<void> {
    await this.request(hici.encodeSimple(HiciCmd.Stop), [HiciCmd.Ack]);
  }

  async setMaxCurrent(amps: number): Promise<void> {
    await this.request(hici.encodeSetMaxCurrent(amps), [HiciCmd.Ack]);
  }

  async setCableLock(locked: boolean): Promise<void> {
    await this.request(hici.encodeSetCableLock(locked), [HiciCmd.Ack]);
  }

  async disconnect(): Promise<void> {
    await this.device.disconnect();
    this.teardown(null);
  }

  private teardown(reason: string | null): void {
    this.stopMonitor?.();
    this.stopDisconnect?.();
    this.stopMonitor = null;
    this.stopDisconnect = null;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Disconnected'));
      this.pending = null;
    }
    this.queue = [];
    for (const cb of this.disconnectListeners) cb(reason);
    this.disconnectListeners.clear();
    this.statusListeners.clear();
  }
}

export const hiciDriver: ChargerDriver = {
  protocol: 'hici-v1',
  needsBle: true,

  async discover(transport: BleTransport, serial, opts) {
    const wanted = serial.toUpperCase();
    const device = await transport.findDevice(
      { namePrefix: HICI_GATT.namePrefix, timeoutMs: opts.timeoutMs },
      // Prefer a name that carries the serial; accept any HiCi if it does not.
      (d) => (d.name ?? '').toUpperCase().includes(wanted) || !!d.name,
    );
    return device.id;
  },

  async connect(transport, deviceId, credentials, hint) {
    const device = await transport.connect(deviceId, { mtu: HICI_GATT.requestedMtu });
    const link = new HiciLink(device, {
      serial: credentials.serial,
      protocol: 'hici-v1',
      model: hint.model,
      firmware: hint.firmware,
      ratedAmps: hint.ratedAmps,
      phases: hint.phases,
    });
    link.attach();
    try {
      if (credentials.pin) await link.authenticate(credentials.pin);
      await link.loadInfo();
      await link.readStatus();
    } catch (e) {
      await link.disconnect();
      throw e;
    }
    return link;
  },
};
