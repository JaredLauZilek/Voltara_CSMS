import type { ChargerProtocol } from '@voltara/shared';
import { hiciDriver } from './hici';
import { mockDriver } from './mock';
import type { ChargerDriver } from './types';

const DRIVERS: Record<ChargerProtocol, ChargerDriver> = {
  'hici-v1': hiciDriver,
  mock: mockDriver,
};

export function driverFor(protocol: ChargerProtocol): ChargerDriver {
  const d = DRIVERS[protocol];
  if (!d) throw new Error(`No driver for protocol ${protocol}`);
  return d;
}

export type { ChargerDriver } from './types';
export { getSimulator, getSimulatedLink } from './mock';
