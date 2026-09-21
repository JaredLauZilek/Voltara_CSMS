import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import * as api from './api';
import type {
  NewAssignmentInput,
  NewVersionInput,
  TariffInsert,
  TariffUpdate,
  TaxProfileInsert,
} from './types';

const KEY = ['tariffs'] as const;

export function useTariffs() {
  return useQuery({ queryKey: KEY, queryFn: api.listTariffs });
}

export function useTariff(id: string) {
  return useQuery({ queryKey: ['tariffs', 'detail', id], queryFn: () => api.getTariff(id) });
}

export function useTaxProfiles() {
  return useQuery({ queryKey: ['tariffs', 'tax-profiles'], queryFn: api.listTaxProfiles });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
  };
}

export function useCreateTariff() {
  const { tenantId, session } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      tariff,
      version,
    }: {
      tariff: Omit<TariffInsert, 'tenant_id'>;
      version: NewVersionInput;
    }) => {
      const created = await api.createTariff({ ...tariff, tenant_id: tenantId });
      await api.createVersion(tenantId, session.user.id, created.id, version);
      return created;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTariff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TariffUpdate }) => api.updateTariff(id, patch),
    onSuccess: invalidate,
  });
}

export function useCreateVersion(tariffId: string) {
  const { tenantId, session } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: NewVersionInput) =>
      api.createVersion(tenantId, session.user.id, tariffId, input),
    onSuccess: invalidate,
  });
}

export function useCreateAssignment(tariffId: string) {
  const { tenantId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: NewAssignmentInput) => api.createAssignment(tenantId, tariffId, input),
    onSuccess: invalidate,
  });
}

export function useEndAssignment() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.endAssignment(id), onSuccess: invalidate });
}

export function useDeleteAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteAssignment(id),
    onSuccess: invalidate,
  });
}

export function useUpsertTaxProfile() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (row: Omit<TaxProfileInsert, 'tenant_id'> & { id?: string }) =>
      api.upsertTaxProfile({ ...row, tenant_id: tenantId }),
    onSuccess: invalidate,
  });
}
