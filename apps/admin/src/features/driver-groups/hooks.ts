import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import * as api from './api';
import type { DriverGroupInsert } from './types';

const KEY = ['driver-groups'] as const;

export function useDriverGroups() {
  return useQuery({ queryKey: KEY, queryFn: api.listGroups });
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ['driver-groups', 'members', groupId],
    queryFn: () => api.listMembers(groupId!),
    enabled: Boolean(groupId),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
  };
}

export function useCreateGroup() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (row: Omit<DriverGroupInsert, 'tenant_id'>) =>
      api.createGroup({ ...row, tenant_id: tenantId }),
    onSuccess: invalidate,
  });
}

export function useUpdateGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<DriverGroupInsert> }) =>
      api.updateGroup(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.deleteGroup(id), onSuccess: invalidate });
}

export function useAddMember(groupId: string) {
  const { tenantId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (m: { id_tag_id?: string; billing_account_id?: string }) =>
      api.addMember(tenantId, groupId, m),
    onSuccess: invalidate,
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.removeMember(id), onSuccess: invalidate });
}
