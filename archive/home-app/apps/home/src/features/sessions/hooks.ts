import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export function useSessions(chargerId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['sessions', chargerId ?? 'all'],
    queryFn: () => api.listSessions(chargerId),
    enabled,
  });
}

export function useDailyEnergy(chargerId: string | null, days = 30) {
  return useQuery({
    queryKey: ['daily-energy', chargerId, days],
    queryFn: () => api.listDailyEnergy(chargerId!, days),
    enabled: !!chargerId,
  });
}
