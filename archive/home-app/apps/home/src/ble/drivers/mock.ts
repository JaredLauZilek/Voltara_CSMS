// The simulator as a driver. One ChargerSimulator per serial lives for the
// app session so the dev bench screen can poke the same unit a live screen
// is watching. No radio involved.

import { ChargerSimulator, SimulatedLink } from '@voltara/shared';
import type { ChargerInfo, ChargerLink } from '@voltara/shared';
import type { ChargerDriver } from './types';

const sims = new Map<string, ChargerSimulator>();
const links = new Map<string, SimulatedLink>();

export function getSimulator(serial: string, hint: Partial<ChargerInfo> = {}): ChargerSimulator {
  let sim = sims.get(serial);
  if (!sim) {
    sim = new ChargerSimulator({
      serial,
      ratedAmps: hint.ratedAmps ?? 32,
      phases: hint.phases ?? 1,
      firmware: hint.firmware ?? 'sim-1.0.0',
      initialEnergyKwh: 1375.5,
      vehicleDemandA: 32,
    });
    sims.set(serial, sim);
    // Demo feel: a car is already plugged in and charging when the screen
    // opens. The bench can unplug it.
    const demo = sim;
    setTimeout(() => demo.plugIn(), 900);
    setTimeout(() => {
      try {
        demo.start();
      } catch {
        // unplugged meanwhile
      }
    }, 2200);
  }
  return sim;
}

/** Live link for a serial, if a screen currently holds one (bench "drop link"). */
export function getSimulatedLink(serial: string): SimulatedLink | undefined {
  return links.get(serial);
}

export const mockDriver: ChargerDriver = {
  protocol: 'mock',
  needsBle: false,
  async discover(_transport, serial) {
    await new Promise((r) => setTimeout(r, 400)); // feel like a scan
    return `mock:${serial}`;
  },
  async connect(_transport, _deviceId, credentials, hint) {
    await new Promise((r) => setTimeout(r, 600));
    const sim = getSimulator(credentials.serial, hint);
    const link: ChargerLink = new SimulatedLink(sim);
    links.set(credentials.serial, link as SimulatedLink);
    link.onDisconnect(() => links.delete(credentials.serial));
    return link;
  },
};
