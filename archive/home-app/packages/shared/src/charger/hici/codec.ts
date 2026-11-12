// Frame codec for the HiCi BLE protocol.
//
// STATUS: ASSUMED FRAMING — a conventional header/length/command/payload/
// checksum serial protocol. It is deliberately complete and unit-tested so
// the app, the simulator bridge and the GATT explorer have something real to
// run against; when the bench capture shows the actual format, change
// *this file and gatt.ts only*. Field positions are documented so a diff
// against a captured frame is quick.
//
//   byte 0   0x5A   header 1
//   byte 1   0xA5   header 2
//   byte 2   len    number of bytes after this one, excluding the checksum
//   byte 3   cmd    command / reply id
//   byte 4…  payload
//   last     xor    XOR of bytes 2…(last-1)

import type { ChargerState, ChargerStatus } from '../types';

export const HICI_HEADER = [0x5a, 0xa5] as const;

export const HiciCmd = {
  Auth: 0x10,
  GetInfo: 0x11,
  GetStatus: 0x01,
  Start: 0x02,
  Stop: 0x03,
  SetMaxCurrent: 0x04,
  SetCableLock: 0x05,
  /** Unsolicited push from the charger. */
  StatusPush: 0x81,
  Ack: 0x90,
  Nak: 0x91,
} as const;
export type HiciCmd = (typeof HiciCmd)[keyof typeof HiciCmd];

/** Charger-side state byte → domain state. Values are assumed. */
const STATE_BY_CODE: Record<number, ChargerState> = {
  0: 'Available',
  1: 'Preparing',
  2: 'Charging',
  3: 'SuspendedEV',
  4: 'SuspendedEVSE',
  5: 'Finishing',
  6: 'Faulted',
  7: 'Unavailable',
};
const CODE_BY_STATE: Record<ChargerState, number> = {
  Available: 0,
  Preparing: 1,
  Charging: 2,
  SuspendedEV: 3,
  SuspendedEVSE: 4,
  Finishing: 5,
  Faulted: 6,
  Unavailable: 7,
  Unknown: 0xff,
};

export interface HiciFrame {
  cmd: number;
  payload: Uint8Array;
}

export function xorChecksum(bytes: Uint8Array, from: number, to: number): number {
  let x = 0;
  for (let i = from; i < to; i += 1) x ^= bytes[i];
  return x & 0xff;
}

export function encodeFrame(cmd: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const len = 1 + payload.length; // cmd + payload
  const out = new Uint8Array(3 + len + 1);
  out[0] = HICI_HEADER[0];
  out[1] = HICI_HEADER[1];
  out[2] = len;
  out[3] = cmd & 0xff;
  out.set(payload, 4);
  out[out.length - 1] = xorChecksum(out, 2, out.length - 1);
  return out;
}

/**
 * Accumulates notification chunks (BLE delivers ≤ MTU-3 bytes per packet)
 * and yields complete, checksum-valid frames. Garbage before a header is
 * skipped so a mid-stream connect self-heals.
 */
export class FrameParser {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): HiciFrame[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf);
    joined.set(chunk, this.buf.length);
    this.buf = joined;

    const frames: HiciFrame[] = [];
    for (;;) {
      const start = findHeader(this.buf);
      if (start < 0) {
        // Keep a possible half header.
        this.buf = this.buf.slice(Math.max(0, this.buf.length - 1));
        return frames;
      }
      if (start > 0) this.buf = this.buf.slice(start);
      if (this.buf.length < 4) return frames;
      const len = this.buf[2];
      const total = 3 + len + 1;
      if (this.buf.length < total) return frames;
      const frame = this.buf.slice(0, total);
      this.buf = this.buf.slice(total);
      const expect = frame[total - 1];
      if (xorChecksum(frame, 2, total - 1) !== expect) continue; // drop bad frame, keep going
      frames.push({ cmd: frame[3], payload: frame.slice(4, total - 1) });
    }
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }
}

function findHeader(b: Uint8Array): number {
  for (let i = 0; i + 1 < b.length; i += 1) {
    if (b[i] === HICI_HEADER[0] && b[i + 1] === HICI_HEADER[1]) return i;
  }
  return -1;
}

// ── Payload layouts (assumed) ───────────────────────────────────────────────

/** Auth: ASCII PIN, zero-padded to 8 bytes. */
export function encodeAuth(pin: string): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < Math.min(8, pin.length); i += 1) out[i] = pin.charCodeAt(i) & 0xff;
  return encodeFrame(HiciCmd.Auth, out);
}

export function encodeSetMaxCurrent(amps: number): Uint8Array {
  const a = Math.max(6, Math.min(63, Math.round(amps)));
  return encodeFrame(HiciCmd.SetMaxCurrent, new Uint8Array([a]));
}

export function encodeSetCableLock(locked: boolean): Uint8Array {
  return encodeFrame(HiciCmd.SetCableLock, new Uint8Array([locked ? 1 : 0]));
}

export function encodeSimple(cmd: number): Uint8Array {
  return encodeFrame(cmd);
}

/**
 * Status payload, little-endian:
 *   0     u8   state code
 *   1     u8   flags: bit0 plugged · bit1 charging · bit2 cable locked
 *   2–3   u16  power, 0.01 kW
 *   4–9   u16×3 current L1..L3, 0.1 A
 *   10–15 u16×3 voltage L1..L3, 0.1 V
 *   16–19 u32  lifetime energy, 0.01 kWh
 *   20–23 u32  session energy, 0.001 kWh
 *   24    u8   applied max current, A
 *   25    i8   temperature, °C
 *   26    u8   fault code (0 = none)
 */
export const STATUS_PAYLOAD_LENGTH = 27;

export function decodeStatus(p: Uint8Array, at = Date.now()): ChargerStatus {
  if (p.length < STATUS_PAYLOAD_LENGTH) {
    throw new Error(`HiCi status payload too short: ${p.length} < ${STATUS_PAYLOAD_LENGTH}`);
  }
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const flags = p[1];
  const fault = p[26];
  const state = STATE_BY_CODE[p[0]] ?? 'Unknown';
  return {
    state,
    plugged: (flags & 0b001) !== 0,
    charging: (flags & 0b010) !== 0,
    cableLocked: (flags & 0b100) !== 0,
    powerKw: v.getUint16(2, true) / 100,
    currentA: [v.getUint16(4, true) / 10, v.getUint16(6, true) / 10, v.getUint16(8, true) / 10],
    voltageV: [v.getUint16(10, true) / 10, v.getUint16(12, true) / 10, v.getUint16(14, true) / 10],
    energyTotalKwh: v.getUint32(16, true) / 100,
    sessionKwh: v.getUint32(20, true) / 1000,
    maxCurrentA: p[24],
    temperatureC: v.getInt8(25),
    faultCode: fault === 0 ? null : `E${String(fault).padStart(2, '0')}`,
    at,
  };
}

/** Inverse of decodeStatus — used by the simulator bridge and tests. */
export function encodeStatus(s: ChargerStatus): Uint8Array {
  const p = new Uint8Array(STATUS_PAYLOAD_LENGTH);
  const v = new DataView(p.buffer);
  p[0] = CODE_BY_STATE[s.state] ?? 0xff;
  p[1] = (s.plugged ? 1 : 0) | (s.charging ? 2 : 0) | (s.cableLocked ? 4 : 0);
  v.setUint16(2, Math.round(s.powerKw * 100), true);
  v.setUint16(4, Math.round(s.currentA[0] * 10), true);
  v.setUint16(6, Math.round(s.currentA[1] * 10), true);
  v.setUint16(8, Math.round(s.currentA[2] * 10), true);
  v.setUint16(10, Math.round(s.voltageV[0] * 10), true);
  v.setUint16(12, Math.round(s.voltageV[1] * 10), true);
  v.setUint16(14, Math.round(s.voltageV[2] * 10), true);
  v.setUint32(16, Math.round(s.energyTotalKwh * 100), true);
  v.setUint32(20, Math.round(s.sessionKwh * 1000), true);
  p[24] = s.maxCurrentA & 0xff;
  v.setInt8(25, Math.round(s.temperatureC ?? 0));
  p[26] = s.faultCode ? Number(s.faultCode.replace(/\D/g, '')) & 0xff : 0;
  return p;
}

/** Info reply: firmware (16 ASCII) · serial (16 ASCII) · rated amps u8 · phases u8. */
export function decodeInfo(p: Uint8Array): {
  firmware: string;
  serial: string;
  ratedAmps: number;
  phases: 1 | 3;
} {
  const ascii = (from: number, len: number) =>
    String.fromCharCode(...p.slice(from, from + len)).replace(/\0+$/g, '');
  return {
    firmware: ascii(0, 16),
    serial: ascii(16, 16),
    ratedAmps: p[32] ?? 32,
    phases: p[33] === 3 ? 3 : 1,
  };
}

export const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
