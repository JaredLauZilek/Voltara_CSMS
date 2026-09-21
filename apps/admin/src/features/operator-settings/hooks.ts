import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth';
import * as api from './api';
import type { OperatorForm } from './types';

export function useOperatorSettings() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['operator-settings', tenantId],
    queryFn: () => api.getSettings(tenantId),
  });
}

export function useSaveOperatorSettings() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: OperatorForm) => api.saveSettings(tenantId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator-settings'] });
      qc.invalidateQueries({ queryKey: ['tenant'] });
    },
  });
}
