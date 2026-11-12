import { describe, expect, it } from 'vitest';
import { ChargerSimulator } from './simulator';

describe('ChargerSimulator', () => {
  it('boots Available with no current', () => {
    const sim = new ChargerSimulator({ serial: 'SIM-1', now: () => 0 });
    expect(sim.status.state).toBe('Available');
    expect(sim.status.powerKw).toBe(0);
  });

  it('plug in → Preparing, start → Charging, ramps and accumulates energy', () => {
    let t = 0;
    const sim = new ChargerSimulator({ serial: 'SIM-1', now: () => t, maxCurrentA: 16 });
    sim.plugIn();
    expect(sim.status.state).toBe('Preparing');
    sim.start();
    expect(sim.status.state).toBe('Charging');
    const before = sim.status.energyTotalKwh;
    for (let i = 0; i < 30; i += 1) {
      t += 1000;
      sim.tick(t);
    }
    // 16 A × 230 V ≈ 3.68 kW once ramped.
    expect(sim.status.currentA[0]).toBeGreaterThan(15);
    expect(sim.status.powerKw).toBeGreaterThan(3.4);
    expect(sim.status.energyTotalKwh).toBeGreaterThan(before);
    expect(sim.status.sessionKwh).toBeGreaterThan(0);
  });

  it('refuses to start without a vehicle and clamps current to the rating', () => {
    const sim = new ChargerSimulator({ serial: 'SIM-1', ratedAmps: 32, now: () => 0 });
    expect(() => sim.start()).toThrow(/No vehicle/);
    sim.setMaxCurrent(100);
    expect(sim.status.maxCurrentA).toBe(32);
    sim.setMaxCurrent(1);
    expect(sim.status.maxCurrentA).toBe(6);
  });

  it('fault stops charging and clears back to the plugged state', () => {
    const sim = new ChargerSimulator({ serial: 'SIM-1', now: () => 0 });
    sim.plugIn();
    sim.start();
    sim.injectFault('E07');
    expect(sim.status.state).toBe('Faulted');
    expect(sim.status.charging).toBe(false);
    sim.clearFault();
    expect(sim.status.state).toBe('Preparing');
  });

  it('notifies subscribers on every state change', () => {
    const sim = new ChargerSimulator({ serial: 'SIM-1', now: () => 0 });
    const seen: string[] = [];
    sim.subscribe((s) => seen.push(s.state));
    sim.plugIn();
    sim.start();
    sim.stop();
    sim.unplug();
    expect(seen).toEqual(['Preparing', 'Charging', 'SuspendedEVSE', 'Available']);
  });
});
