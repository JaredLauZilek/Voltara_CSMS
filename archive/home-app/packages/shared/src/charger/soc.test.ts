import { describe, expect, it } from 'vitest';
import { estimateSoc, formatEta, kwhToTarget, minutesToTarget } from './soc';

const car = { batteryKwh: 60, startSocPct: 20, targetSocPct: 80, efficiency: 0.9 };

describe('soc estimate', () => {
  it('starts at the plug-in level and grows with energy delivered', () => {
    expect(estimateSoc(car, 0)).toBe(20);
    // 10 kWh at the wall → 9 kWh in the pack → +15 % of 60 kWh
    expect(estimateSoc(car, 10)).toBeCloseTo(35, 5);
  });
  it('never exceeds 100 %', () => {
    expect(estimateSoc(car, 500)).toBe(100);
  });
  it('knows how much is left to the target and how long it takes', () => {
    // 60 % gap of 60 kWh = 36 kWh in the pack = 40 kWh at the wall
    expect(kwhToTarget(car, 20)).toBeCloseTo(40, 5);
    expect(minutesToTarget(car, 20, 7.2)).toBe(Math.round((40 / 7.2) * 60));
    expect(minutesToTarget(car, 20, 0)).toBeNull();
    expect(minutesToTarget(car, 85, 7.2)).toBe(0);
  });
  it('formats an ETA in the house style', () => {
    expect(formatEta(null)).toBe('–');
    expect(formatEta(0)).toBe('Done');
    expect(formatEta(45)).toBe('45 min');
    expect(formatEta(125)).toBe('2 h 05 min');
  });
});
