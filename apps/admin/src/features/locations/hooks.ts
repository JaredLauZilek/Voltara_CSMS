import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { LocationInsert, LocationUpdate } from './types';

const KEY = ['locations'] as const;

export function useLocations() {
  return useQuery({ queryKey: KEY, queryFn: api.listLocations });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: LocationInsert) => api.createLocation(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LocationUpdate }) =>
      api.updateLocation(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteLocation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}
