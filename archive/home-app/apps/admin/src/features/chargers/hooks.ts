import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { CommissionInput, RegisterChargerInput } from './types';

const KEY = ['chargers'] as const;

/** The fleet, one row per charger. Polled slowly: "last seen" only needs to be roughly right. */
export function useChargers() {
  return useQuery({ queryKey: KEY, queryFn: api.listChargers, refetchInterval: 60_000 });
}

export function useCharger(id: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => api.getCharger(id),
    enabled: id.length > 0,
    refetchInterval: 60_000,
  });
}

export function useChargerModels() {
  return useQuery({
    queryKey: [...KEY, 'models'],
    queryFn: api.listChargerModels,
    staleTime: 300_000,
  });
}

export function useDealerOptions(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'dealer-options'],
    queryFn: api.listDealerOptions,
    enabled,
    staleTime: 300_000,
  });
}

export function useDailyEnergy(chargerId: string, days = 30) {
  return useQuery({
    queryKey: [...KEY, 'energy', chargerId, days],
    queryFn: () => api.listDailyEnergy(chargerId, days),
  });
}

export function useReadings(chargerId: string, hours = 24) {
  return useQuery({
    queryKey: [...KEY, 'readings', chargerId, hours],
    queryFn: () => api.listReadings(chargerId, hours),
    refetchInterval: 60_000,
  });
}

export function useSessions(chargerId: string) {
  return useQuery({
    queryKey: [...KEY, 'sessions', chargerId],
    queryFn: () => api.listSessions(chargerId),
  });
}

export function useChargerEvents(chargerId: string) {
  return useQuery({
    queryKey: [...KEY, 'events', chargerId],
    queryFn: () => api.listEvents(chargerId),
    refetchInterval: 60_000,
  });
}

export function useHousehold(chargerId: string) {
  return useQuery({
    queryKey: [...KEY, 'household', chargerId],
    queryFn: () => api.listHousehold(chargerId),
  });
}

export function useRegisterCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterChargerInput) => api.registerCharger(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useCommissionCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CommissionInput) => api.commissionCharger(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDecommissionCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.decommissionCharger(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useReleaseCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.releaseCharger(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
