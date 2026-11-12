// Estimated state of charge. An AC wallbox cannot read the car's battery
// (that needs ISO 15118, which basic AC units do not speak), so the app
// estimates from energy delivered this session against the car's battery
// size — the same approach Ohme and Hypervolt take. Always labelled
// "estimated" in the UI.

export interface VehicleProfile {
  /** Usable battery capacity, kWh. */
  batteryKwh: number;
  /** Charge level when the cable went in, percent. */
  startSocPct: number;
  /** Where the owner wants to stop, percent. */
  targetSocPct: number;
  /** AC → battery efficiency (losses in the onboard charger). */
  efficiency?: number;
}

export const DEFAULT_VEHICLE: VehicleProfile = {
  batteryKwh: 60,
  startSocPct: 35,
  targetSocPct: 80,
  efficiency: 0.9,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Percent, 0–100, after `sessionKwh` has been delivered. */
export function estimateSoc(profile: VehicleProfile, sessionKwh: number): number {
  const eff = profile.efficiency ?? 0.9;
  if (!(profile.batteryKwh > 0)) return clamp(profile.startSocPct, 0, 100);
  const added = (Math.max(0, sessionKwh) * eff) / profile.batteryKwh;
  return clamp(profile.startSocPct + added * 100, 0, 100);
}

/** kWh still needed at the wall to reach the target from `socPct`. */
export function kwhToTarget(profile: VehicleProfile, socPct: number): number {
  const eff = profile.efficiency ?? 0.9;
  const gap = Math.max(0, profile.targetSocPct - socPct) / 100;
  return (gap * profile.batteryKwh) / eff;
}

/** Minutes to target at the current power, or null when not charging. */
export function minutesToTarget(
  profile: VehicleProfile,
  socPct: number,
  powerKw: number,
): number | null {
  if (!(powerKw > 0.1)) return null;
  const kwh = kwhToTarget(profile, socPct);
  if (kwh <= 0) return 0;
  return Math.round((kwh / powerKw) * 60);
}

export function formatEta(minutes: number | null): string {
  if (minutes == null) return '–';
  if (minutes <= 0) return 'Done';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}
