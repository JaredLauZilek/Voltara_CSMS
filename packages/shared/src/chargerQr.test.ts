import { describe, expect, it } from 'vitest';
import { chargerQrUrl, parseChargerQr } from './chargerQr';

describe('charger QR codes', () => {
  it('round-trips a charger and gun', () => {
    const url = chargerQrUrl('TEST-01', 2);
    expect(url).toBe('https://voltaracharging.com/c/TEST-01?gun=2');
    expect(parseChargerQr(url)).toEqual({ code: 'TEST-01', connectorId: 2 });
  });

  it('reads a whole-charger code, the app link and a typed ID', () => {
    expect(parseChargerQr(chargerQrUrl('VLT-HQ-02'))).toEqual({
      code: 'VLT-HQ-02',
      connectorId: null,
    });
    expect(parseChargerQr('voltara://c/VLT-HQ-02?gun=1')).toEqual({
      code: 'VLT-HQ-02',
      connectorId: 1,
    });
    expect(parseChargerQr('  ZN04PL188008 ')).toEqual({ code: 'ZN04PL188008', connectorId: null });
  });

  it('keeps IDs with unusual characters intact', () => {
    expect(parseChargerQr(chargerQrUrl('CP:01+A', 1))).toEqual({ code: 'CP:01+A', connectorId: 1 });
  });

  it('rejects codes that are not ours', () => {
    expect(parseChargerQr('https://example.com/c/TEST-01')).toBeNull();
    expect(parseChargerQr('https://voltaracharging.com/other/TEST-01')).toBeNull();
    expect(parseChargerQr('WIFI:S:Cafe;T:WPA;P:secret;;')).toBeNull();
    expect(parseChargerQr('')).toBeNull();
    expect(parseChargerQr('ab')).toBeNull();
  });

  it('ignores a nonsense gun number', () => {
    expect(parseChargerQr('https://voltaracharging.com/c/TEST-01?gun=0')).toEqual({
      code: 'TEST-01',
      connectorId: null,
    });
  });
});
