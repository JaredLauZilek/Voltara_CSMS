import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { IdTagInsert, IdTagUpdate } from './types';

const KEY = ['id-tags'] as const;

export function useIdTags() {
  return useQuery({ queryKey: KEY, queryFn: api.listIdTags });
}

export function useCreateIdTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: IdTagInsert) => api.createIdTag(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateIdTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IdTagUpdate }) => api.updateIdTag(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteIdTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteIdTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
