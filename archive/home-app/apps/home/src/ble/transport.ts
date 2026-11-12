// Thin, promise-based wrapper over react-native-ble-plx. Knows nothing about
// chargers: it scans, connects, discovers, reads, writes and monitors bytes.
// Drivers under ./drivers turn bytes into ChargerLink. The GATT explorer
// (app/dev/gatt.tsx) uses this directly to inspect unknown hardware.

import { Platform } from 'react-native';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import type * as BlePlx from 'react-native-ble-plx';
import { fromBase64, toBase64 } from './bytes';
import { requestBlePermissions } from './permissions';

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  serviceUUIDs: string[] | null;
  manufacturerData: string | null;
}

export interface GattCharacteristic {
  uuid: string;
  serviceUUID: string;
  readable: boolean;
  writableWithResponse: boolean;
  writableWithoutResponse: boolean;
  notifiable: boolean;
  indicatable: boolean;
}

export interface GattService {
  uuid: string;
  characteristics: GattCharacteristic[];
}

export class BleUnavailableError extends Error {
  constructor(message = 'Bluetooth is not available in this build') {
    super(message);
    this.name = 'BleUnavailableError';
  }
}

let managerSingleton: BleManager | null | undefined;

/**
 * The native module is absent on web and in Expo Go, where `new BleManager()`
 * throws. Resolve it lazily so the rest of the app (and the simulator) still
 * runs there.
 */
function getManager(): BleManager | null {
  if (managerSingleton !== undefined) return managerSingleton;
  if (Platform.OS === 'web') {
    managerSingleton = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx') as typeof BlePlx;
    managerSingleton = new mod.BleManager();
  } catch (e) {
    console.warn('react-native-ble-plx unavailable — build a dev client to use Bluetooth', e);
    managerSingleton = null;
  }
  return managerSingleton;
}

export type AdapterState =
  'Unknown' | 'Resetting' | 'Unsupported' | 'Unauthorized' | 'PoweredOff' | 'PoweredOn';

export class BleTransport {
  static shared = new BleTransport();

  get available(): boolean {
    return getManager() !== null;
  }

  async adapterState(): Promise<AdapterState> {
    const m = getManager();
    if (!m) return 'Unsupported';
    return (await m.state()) as AdapterState;
  }

  onAdapterState(cb: (s: AdapterState) => void): () => void {
    const m = getManager();
    if (!m) return () => {};
    const sub = m.onStateChange((s) => cb(s as AdapterState), true);
    return () => sub.remove();
  }

  /** Permissions + adapter powered on, or throws with a human message. */
  async ensureReady(): Promise<void> {
    const m = getManager();
    if (!m) throw new BleUnavailableError();
    const perm = await requestBlePermissions();
    if (perm === 'denied') throw new Error('Bluetooth permission was declined');
    const state = await this.waitForPoweredOn(4000);
    if (state !== 'PoweredOn') {
      throw new Error(
        state === 'PoweredOff'
          ? 'Bluetooth is switched off'
          : state === 'Unauthorized'
            ? 'Bluetooth permission was declined'
            : `Bluetooth is ${state.toLowerCase()}`,
      );
    }
  }

  private waitForPoweredOn(timeoutMs: number): Promise<AdapterState> {
    const m = getManager()!;
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        sub.remove();
        m.state().then((s) => resolve(s as AdapterState));
      }, timeoutMs);
      const sub = m.onStateChange((s) => {
        if (s === 'PoweredOn' || s === 'Unsupported' || s === 'Unauthorized') {
          if (done) return;
          done = true;
          clearTimeout(timer);
          sub.remove();
          resolve(s as AdapterState);
        }
      }, true);
    });
  }

  /**
   * Scan until stopped. Returns the stop function. Devices are reported
   * every time they advertise; callers dedupe by id.
   */
  scan(
    opts: { serviceUUIDs?: string[]; namePrefix?: string },
    onDevice: (d: ScannedDevice) => void,
    onError?: (e: Error) => void,
  ): () => void {
    const m = getManager();
    if (!m) {
      onError?.(new BleUnavailableError());
      return () => {};
    }
    const prefix = opts.namePrefix?.toUpperCase();
    m.startDeviceScan(opts.serviceUUIDs ?? null, { allowDuplicates: true }, (error, device) => {
      if (error) {
        onError?.(new Error(error.message));
        return;
      }
      if (!device) return;
      const name = device.localName ?? device.name ?? null;
      if (prefix && !(name ?? '').toUpperCase().startsWith(prefix)) return;
      onDevice({
        id: device.id,
        name,
        rssi: device.rssi ?? null,
        serviceUUIDs: device.serviceUUIDs ?? null,
        manufacturerData: device.manufacturerData ?? null,
      });
    });
    return () => m.stopDeviceScan();
  }

  /** Scan until a device matches, or time out. */
  findDevice(
    opts: { serviceUUIDs?: string[]; namePrefix?: string; timeoutMs?: number },
    match: (d: ScannedDevice) => boolean,
  ): Promise<ScannedDevice> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const stop = this.scan(
        opts,
        (d) => {
          if (settled || !match(d)) return;
          settled = true;
          clearTimeout(timer);
          stop();
          resolve(d);
        },
        (e) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          stop();
          reject(e);
        },
      );
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        stop();
        reject(new Error('Charger not found nearby. Is it powered and within a few metres?'));
      }, opts.timeoutMs ?? 15_000);
    });
  }

  async connect(
    deviceId: string,
    opts: { mtu?: number; timeoutMs?: number } = {},
  ): Promise<ConnectedDevice> {
    const m = getManager();
    if (!m) throw new BleUnavailableError();
    const device = await m.connectToDevice(deviceId, {
      requestMTU: opts.mtu,
      timeout: opts.timeoutMs ?? 10_000,
    });
    await device.discoverAllServicesAndCharacteristics();
    return new ConnectedDevice(m, device);
  }
}

export class ConnectedDevice {
  readonly id: string;
  readonly name: string | null;
  readonly mtu: number;

  constructor(
    private readonly manager: BleManager,
    private readonly device: Device,
  ) {
    this.id = device.id;
    this.name = device.localName ?? device.name ?? null;
    this.mtu = device.mtu ?? 23;
  }

  async services(): Promise<GattService[]> {
    const services = await this.device.services();
    const out: GattService[] = [];
    for (const s of services) {
      const chars = await s.characteristics();
      out.push({
        uuid: s.uuid,
        characteristics: chars.map((c) => ({
          uuid: c.uuid,
          serviceUUID: s.uuid,
          readable: c.isReadable,
          writableWithResponse: c.isWritableWithResponse,
          writableWithoutResponse: c.isWritableWithoutResponse,
          notifiable: c.isNotifiable,
          indicatable: c.isIndicatable,
        })),
      });
    }
    return out;
  }

  async read(serviceUUID: string, charUUID: string): Promise<Uint8Array> {
    const c = await this.device.readCharacteristicForService(serviceUUID, charUUID);
    return c.value ? fromBase64(c.value) : new Uint8Array(0);
  }

  async write(
    serviceUUID: string,
    charUUID: string,
    bytes: Uint8Array,
    withResponse = true,
  ): Promise<void> {
    const b64 = toBase64(bytes);
    if (withResponse) {
      await this.device.writeCharacteristicWithResponseForService(serviceUUID, charUUID, b64);
    } else {
      await this.device.writeCharacteristicWithoutResponseForService(serviceUUID, charUUID, b64);
    }
  }

  /** Subscribe to notifications/indications. Returns the unsubscribe. */
  monitor(
    serviceUUID: string,
    charUUID: string,
    onData: (bytes: Uint8Array) => void,
    onError?: (e: Error) => void,
  ): () => void {
    const sub: Subscription = this.device.monitorCharacteristicForService(
      serviceUUID,
      charUUID,
      (error, c) => {
        if (error) {
          // "Operation was cancelled" arrives on every disconnect; not an error to surface.
          if (!/cancel/i.test(error.message)) onError?.(new Error(error.message));
          return;
        }
        if (c?.value) onData(fromBase64(c.value));
      },
    );
    return () => sub.remove();
  }

  onDisconnected(cb: (reason: string | null) => void): () => void {
    const sub = this.manager.onDeviceDisconnected(this.id, (error) => {
      cb(error?.message ?? null);
    });
    return () => sub.remove();
  }

  isConnected(): Promise<boolean> {
    return this.device.isConnected();
  }

  async disconnect(): Promise<void> {
    try {
      await this.device.cancelConnection();
    } catch {
      // Already gone.
    }
  }
}
