import { describe, expect, it } from 'vitest';
import {
  FrameParser,
  HiciCmd,
  decodeStatus,
  encodeAuth,
  encodeFrame,
  encodeSetMaxCurrent,
  encodeStatus,
  xorChecksum,
} from './codec';
import type { ChargerStatus } from '../types';

const sample: ChargerStatus = {
  state: 'Charging',
  plugged: true,
  charging: true,
  powerKw: 7.36,
  currentA: [32, 0, 0],
  voltageV: [230.1, 0, 0],
  energyTotalKwh: 1234.56,
  sessionKwh: 4.321,
  maxCurrentA: 32,
  temperatureC: 34,
  cableLocked: true,
  faultCode: null,
  at: 0,
};

describe('HiCi codec', () => {
  it('frames carry header, length, command and a valid checksum', () => {
    const f = encodeSetMaxCurrent(16);
    expect(Array.from(f.slice(0, 4))).toEqual([0x5a, 0xa5, 2, HiciCmd.SetMaxCurrent]);
    expect(f[4]).toBe(16);
    expect(f[f.length - 1]).toBe(xorChecksum(f, 2, f.length - 1));
  });

  it('status round-trips through encode/decode', () => {
    const decoded = decodeStatus(encodeStatus(sample), 0);
    expect(decoded).toEqual(sample);
  });

  it('parser reassembles frames split across notifications and skips garbage', () => {
    const frame = encodeFrame(HiciCmd.StatusPush, encodeStatus(sample));
    const stream = new Uint8Array([0x00, 0x13, ...frame, ...encodeAuth('1234')]);
    const parser = new FrameParser();
    const out = [
      ...parser.push(stream.slice(0, 7)),
      ...parser.push(stream.slice(7, 20)),
      ...parser.push(stream.slice(20)),
    ];
    expect(out.map((f) => f.cmd)).toEqual([HiciCmd.StatusPush, HiciCmd.Auth]);
    expect(decodeStatus(out[0].payload, 0)).toEqual(sample);
  });

  it('parser drops a frame with a bad checksum but keeps the next one', () => {
    const good = encodeFrame(HiciCmd.Ack);
    const bad = encodeFrame(HiciCmd.Nak);
    bad[bad.length - 1] ^= 0xff;
    const parser = new FrameParser();
    const out = parser.push(new Uint8Array([...bad, ...good]));
    expect(out.map((f) => f.cmd)).toEqual([HiciCmd.Ack]);
  });

  it('fault codes decode to Exx', () => {
    const faulted = encodeStatus({
      ...sample,
      state: 'Faulted',
      faultCode: 'E07',
      charging: false,
    });
    expect(decodeStatus(faulted, 0).faultCode).toBe('E07');
  });
});
