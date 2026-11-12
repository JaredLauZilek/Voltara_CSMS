// The owner's car, per charger: battery size, charge level when plugged in,
// target. Lives on the phone (AsyncStorage) — it is the owner's estimate,
// not charger state, and nothing else needs it yet.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_VEHICLE } from '@voltara/shared';
import type { VehicleProfile } from '@voltara/shared';

const key = (chargerId: string) => `voltara.vehicle.${chargerId}`;

export function useVehicleProfile(chargerId: string | null) {
  const [profile, setProfile] = useState<VehicleProfile>(DEFAULT_VEHICLE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!chargerId) return;
    let alive = true;
    AsyncStorage.getItem(key(chargerId))
      .then((raw) => {
        if (!alive) return;
        if (raw)
          setProfile({ ...DEFAULT_VEHICLE, ...(JSON.parse(raw) as Partial<VehicleProfile>) });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, [chargerId]);

  const update = useCallback(
    (patch: Partial<VehicleProfile>) => {
      setProfile((prev) => {
        const next = { ...prev, ...patch };
        if (chargerId) void AsyncStorage.setItem(key(chargerId), JSON.stringify(next));
        return next;
      });
    },
    [chargerId],
  );

  return { profile, update, loaded };
}
