import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHARGERS_KEY } from '@/features/chargers/hooks';
import * as api from './api';

export function useDealerChargers(enabled: boolean) {
  return useQuery({ queryKey: ['dealer-chargers'], queryFn: api.listDealerChargers, enabled });
}

export function useRegisterCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.registerCharger,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealer-chargers'] });
      void qc.invalidateQueries({ queryKey: CHARGERS_KEY });
    },
  });
}

export function useCommissionCharger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.commissionCharger,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dealer-chargers'] });
      void qc.invalidateQueries({ queryKey: CHARGERS_KEY });
      void qc.invalidateQueries({ queryKey: ['charger-settings'] });
    },
  });
}
