import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

export const KEY = ['drivers'] as const;

export function useDrivers() {
  return useQuery({ queryKey: KEY, queryFn: api.listDrivers });
}

/** Adding a driver changes company and whitelist lists too, so refresh them all. */
export function useAddDriver(target: { billingAccountId?: string; driverGroupId?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contact: string) => api.addDriver(contact, target),
    onSuccess: () => {
      for (const key of [KEY, ['driver-groups'], ['billing-accounts'], ['id-tags']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
