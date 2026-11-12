import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { ChargerSettings } from './types';

export const CHARGERS_KEY = ['chargers'] as const;

export function useMyChargers() {
  return useQuery({ queryKey: CHARGERS_KEY, queryFn: api.listMyChargers });
}

export function useCharger(id: string | null) {
  return useQuery({
    queryKey: [...CHARGERS_KEY, id],
    queryFn: () => api.getCharger(id!),
    enabled: !!id,
  });
}

export function useSettings(chargerId: string | null) {
  return useQuery({
    queryKey: ['charger-settings', chargerId],
    queryFn: () => api.getSettings(chargerId!),
    enabled: !!chargerId,
  });
}

export function useUpdateSettings(chargerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.updateSettings>[1]) =>
      api.updateSettings(chargerId, patch),
    onSuccess: (row: ChargerSettings) => {
      qc.setQueryData(['charger-settings', chargerId], row);
      void qc.invalidateQueries({ queryKey: CHARGERS_KEY });
    },
  });
}

export function useRenameCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameCharger(id, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHARGERS_KEY }),
  });
}

export function useClaimCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serial, code, name }: { serial: string; code: string; name?: string }) =>
      api.claimCharger(serial, code, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHARGERS_KEY }),
  });
}

export function useReleaseCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.releaseCharger(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHARGERS_KEY }),
  });
}

export function useMembers(chargerId: string | null) {
  return useQuery({
    queryKey: ['charger-members', chargerId],
    queryFn: () => api.listMembers(chargerId!),
    enabled: !!chargerId,
  });
}

export function useRemoveMember(chargerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(chargerId, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charger-members', chargerId] }),
  });
}

export function useEvents(chargerId: string | null) {
  return useQuery({
    queryKey: ['charger-events', chargerId],
    queryFn: () => api.listEvents(chargerId!),
    enabled: !!chargerId,
  });
}

export function useModels() {
  return useQuery({ queryKey: ['charger-models'], queryFn: api.listModels, staleTime: 300_000 });
}

export function useInviteMember(chargerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: 'member' | 'guest' }) =>
      api.inviteMember(chargerId, email, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charger-members', chargerId] }),
  });
}
