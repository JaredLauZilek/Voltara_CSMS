import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { ChargerModelInsert, ChargerModelUpdate, FirmwareReleaseInsert } from './types';

const KEY = ['models'] as const;

export function useModels() {
  return useQuery({ queryKey: KEY, queryFn: api.listModels });
}

export function useFirmware(modelId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'firmware', modelId],
    queryFn: () => api.listFirmware(modelId!),
    enabled: !!modelId,
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: ChargerModelInsert) => api.createModel(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['chargers', 'models'] });
    },
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ChargerModelUpdate }) =>
      api.updateModel(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['chargers', 'models'] });
    },
  });
}

export function useCreateFirmware() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: FirmwareReleaseInsert) => api.createFirmware(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'firmware'] });
    },
  });
}
