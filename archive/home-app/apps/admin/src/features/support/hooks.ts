import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { TicketUpdate } from './types';

const KEY = ['support'] as const;

export function useTickets() {
  return useQuery({
    queryKey: [...KEY, 'tickets'],
    queryFn: api.listTickets,
    refetchInterval: 60_000,
  });
}

export function useProfiles(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: [...KEY, 'profiles', key.join(',')],
    queryFn: () => api.listProfiles(key),
    enabled: key.length > 0,
    staleTime: 300_000,
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TicketUpdate }) => api.updateTicket(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}
