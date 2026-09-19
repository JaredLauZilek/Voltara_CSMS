import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { IssueInsert, IssueUpdate } from './types';

const KEY = ['issues'] as const;

export function useIssues() {
  return useQuery({ queryKey: KEY, queryFn: api.listIssues });
}

export function useChargePointIssues(chargePointId: string) {
  return useQuery({
    queryKey: ['issues', 'charge-point', chargePointId],
    queryFn: () => api.listIssuesForChargePoint(chargePointId),
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: IssueInsert) => api.createIssue(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: IssueUpdate }) => api.updateIssue(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteIssue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
