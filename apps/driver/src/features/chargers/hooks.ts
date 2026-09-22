import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as api from './api';

/** Device position, or null when denied — discovery still works, just unsorted. */
export function useCoords() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return void (!cancelled && setCoords(null));
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        if (!cancelled) setCoords(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return coords;
}

export function useNearbyChargers(coords: { lat: number; lng: number } | null | undefined) {
  return useQuery({
    queryKey: ['chargers', 'nearby', coords ?? null],
    queryFn: () => api.nearbyChargers(coords?.lat ?? null, coords?.lng ?? null),
    enabled: coords !== undefined,
    refetchInterval: 15_000,
  });
}

export function useSiteContext(locationId: string | null) {
  return useQuery({
    queryKey: ['site', locationId],
    queryFn: () => api.siteContext(locationId!),
    enabled: Boolean(locationId),
  });
}

export function useJoinSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.joinSite(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site'] });
      qc.invalidateQueries({ queryKey: ['chargers'] });
    },
  });
}

/** Issues a start and polls the command until the charger answers. */
export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      chargePointId,
      connectorId,
    }: {
      chargePointId: string;
      connectorId: number;
    }) => {
      const { command_id } = await api.startSession(chargePointId, connectorId);
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        const c = await api.commandStatus(command_id);
        if (c && c.status !== 'queued' && c.status !== 'sent') {
          if (c.status !== 'accepted') throw new Error(c.error ?? `Charger answered ${c.status}`);
          return command_id;
        }
        await new Promise((r) => setTimeout(r, 1_000));
      }
      throw new Error('The charger did not answer in time');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['chargers'] });
    },
  });
}

export function useStopSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { command_id } = await api.stopSession(sessionId);
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        const c = await api.commandStatus(command_id);
        if (c && c.status !== 'queued' && c.status !== 'sent') {
          if (c.status !== 'accepted') throw new Error(c.error ?? `Charger answered ${c.status}`);
          return command_id;
        }
        await new Promise((r) => setTimeout(r, 1_000));
      }
      throw new Error('The charger did not answer in time');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['chargers'] });
    },
  });
}
