import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { DealerInsert, DealerUpdate, InviteInput } from './types';

const KEY = ['dealers'] as const;

export function useDealers() {
  return useQuery({ queryKey: KEY, queryFn: api.listDealers });
}

export function useDealer(id: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => api.getDealer(id),
    enabled: id.length > 0,
  });
}

export function useDealerPeople(dealerId: string) {
  return useQuery({
    queryKey: [...KEY, 'people', dealerId],
    queryFn: () => api.listDealerPeople(dealerId),
    enabled: dealerId.length > 0,
  });
}

export function useDealerMemberships() {
  return useQuery({ queryKey: [...KEY, 'memberships'], queryFn: api.listDealerMemberships });
}

export function useCreateDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: DealerInsert) => api.createDealer(row),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateDealer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DealerUpdate }) => api.updateDealer(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useRemoveDealerMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, userId }: { dealerId: string; userId: string }) =>
      api.removeDealerMember(dealerId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

export function useInviteDealerMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInput) => api.inviteDealerMember(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}
