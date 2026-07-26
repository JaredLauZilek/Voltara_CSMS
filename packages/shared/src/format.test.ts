import { describe, expect, it } from 'vitest';
import { formatDuration, formatKw, formatKwh, formatRM, formatRMShort } from './format';
import { licensingJurisdiction } from './domain';

describe('formatKwh / formatKw', () => {
  it('converts watt-hours to kWh with one decimal', () => {
    expect(formatKwh(7243)).toBe('7.2 kWh');
    expect(formatKwh(0)).toBe('0.0 kWh');
    expect(formatKwh(null)).toBe('—');
  });

  it('converts watts to kW', () => {
    expect(formatKw(7400)).toBe('7.4 kW');
    expect(formatKw(undefined)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('renders seconds, minutes, and hours', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(12 * 60)).toBe('12m');
    expect(formatDuration(84 * 60)).toBe('1h 24m');
  });
});

describe('formatRM', () => {
  it('formats ringgit amounts', () => {
    expect(formatRM(1500)).toBe('RM 1,500');
    expect(formatRMShort(42_100)).toBe('RM 42.1k');
    expect(formatRMShort(1_200_000)).toBe('RM 1.20M');
  });
});

describe('licensingJurisdiction', () => {
  it('maps states to the three regimes', () => {
    expect(licensingJurisdiction('Selangor')).toBe('ST');
    expect(licensingJurisdiction('Sabah')).toBe('ECoS');
    expect(licensingJurisdiction('Labuan')).toBe('ECoS');
    expect(licensingJurisdiction('Sarawak')).toBe('Sarawak');
    expect(licensingJurisdiction(null)).toBe('ST');
  });
});
