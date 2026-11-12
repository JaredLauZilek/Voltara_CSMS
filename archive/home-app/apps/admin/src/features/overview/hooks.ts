import { useQuery } from '@tanstack/react-query';
import * as api from './api';

const KEY = ['overview'] as const;

export function useFleetOverview(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'fleet'],
    queryFn: api.fetchFleetOverview,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useRecentEvents() {
  return useQuery({
    queryKey: [...KEY, 'events'],
    queryFn: () => api.listRecentEvents(),
    refetchInterval: 30_000,
  });
}

export function useOpenTicketCount(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'open-tickets'],
    queryFn: api.countOpenTickets,
    enabled,
    refetchInterval: 60_000,
  });
}
