import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import * as api from './api';
import type { BillingAccountInsert, BillingAccountUpdate, SiteHostAgreementInsert } from './types';

const KEY = ['billing-accounts'] as const;

export function useBillingAccounts() {
  return useQuery({ queryKey: KEY, queryFn: api.listAccounts });
}

export function useAgreements(hostAccountId: string | null) {
  return useQuery({
    queryKey: ['billing-accounts', 'agreements', hostAccountId],
    queryFn: () => api.listAgreements(hostAccountId!),
    enabled: Boolean(hostAccountId),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['id-tags'] });
  };
}

export function useCreateAccount() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (row: Omit<BillingAccountInsert, 'tenant_id'>) =>
      api.createAccount({ ...row, tenant_id: tenantId }),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BillingAccountUpdate }) =>
      api.updateAccount(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.deleteAccount(id), onSuccess: invalidate });
}

export function useUpsertAgreement() {
  const { tenantId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (row: Omit<SiteHostAgreementInsert, 'tenant_id'> & { id?: string }) =>
      api.upsertAgreement({ ...row, tenant_id: tenantId }),
    onSuccess: invalidate,
  });
}

export function useDeleteAgreement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.deleteAgreement(id),
    onSuccess: invalidate,
  });
}
