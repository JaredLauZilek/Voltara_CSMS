// Turns a charger row into what useCharger (BLE) needs, including the PIN
// from the keychain.
import { useEffect, useState } from 'react';
import type { ChargerTarget } from '@/ble';
import type { ChargerProtocol } from '@voltara/shared';
import { loadPin } from '@/lib/pins';
import type { ChargerRow } from './types';

export function useChargerTarget(charger: ChargerRow | null | undefined): ChargerTarget | null {
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!charger) return;
    let alive = true;
    loadPin(charger.serial).then((p) => alive && setPin(p));
    return () => {
      alive = false;
    };
  }, [charger?.serial]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!charger || pin === undefined) return null;
  return {
    serial: charger.serial,
    protocol: charger.protocol as ChargerProtocol,
    pin: pin ?? undefined,
    model: charger.model_name ?? undefined,
    firmware: charger.firmware_version ?? undefined,
    ratedAmps: charger.rated_current_a ?? undefined,
    phases: (charger.phases === 3 ? 3 : 1) as 1 | 3,
  };
}
