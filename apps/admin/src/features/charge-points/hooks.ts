import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { ChargePointUpdate, RegisterChargerInput } from './types';

const KEY = ['charge-points'] as const;

/**
 * The board refetches on an interval because charger state changes without the
 * operator doing anything — a charger boots, a driver plugs in, a unit drops
 * off the network. Phase 2 replaces the poll with the Realtime Broadcast events
 * the gateway already publishes; until the channel subscription lands, a short
 * poll is the honest way to avoid showing stale hardware state.
 */
export function useChargePoints() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.listChargePoints,
    refetchInterval: 10_000,
  });
}

/** Polls a single charge point — used while waiting for a new charger to boot. */
export function useChargePointWatch(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['charge-points', 'watch', id],
    queryFn: () => api.getChargePoint(id!),
    enabled: Boolean(id) && enabled,
    refetchInterval: 3_000,
    staleTime: 0,
  });
}

/**
 * Detail + logs poll while the page is open: during commissioning the whole
 * point is watching state change without touching anything. (Realtime
 * Broadcast replaces the polls in the next slice.)
 */
export function useChargePointDetail(id: string) {
  return useQuery({
    queryKey: ['charge-points', 'detail', id],
    queryFn: () => api.getChargePointDetail(id),
    refetchInterval: 5_000,
  });
}

export function useConnectionEvents(chargePointId: string) {
  return useQuery({
    queryKey: ['charge-points', 'connection-events', chargePointId],
    queryFn: () => api.listConnectionEvents(chargePointId),
    refetchInterval: 5_000,
  });
}

export function useRecentFrames(chargePointId: string) {
  return useQuery({
    queryKey: ['charge-points', 'frames', chargePointId],
    queryFn: () => api.listRecentFrames(chargePointId),
    refetchInterval: 5_000,
  });
}

export function useRegisterChargePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterChargerInput) => {
      const registered = await api.registerChargePoint(input);
      // The RPC always registers at profile 2; the explicit downgrade is a
      // separate, auditable write rather than a parameter that could default wrong.
      if (input.allowInsecure) {
        await api.updateChargePoint(registered.chargePointId, { security_profile: 1 });
      }
      return registered;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
    },
  });
}

export function useUpdateChargePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ChargePointUpdate }) =>
      api.updateChargePoint(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
    },
  });
}

export function useDeleteChargePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteChargePoint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
    },
  });
}
