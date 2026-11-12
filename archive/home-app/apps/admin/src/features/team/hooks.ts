import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import * as api from './api';
import type { InviteInput } from './types';

const KEY = ['team'] as const;

/** Staff see the staff roster; dealer members see their own dealer's people. */
export function useTeam() {
  const { isStaff, actor } = useAuth();
  const dealerId = actor.dealer_id ?? '';
  return useQuery({
    queryKey: isStaff ? [...KEY, 'staff'] : [...KEY, 'dealer', dealerId],
    queryFn: () => (isStaff ? api.listStaff() : api.listDealerPeople(dealerId)),
    enabled: isStaff || dealerId.length > 0,
  });
}

export function useSetStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.setStaffRole(userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useRemoveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeStaff(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInput) => api.invite(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['dealers'] });
    },
  });
}
