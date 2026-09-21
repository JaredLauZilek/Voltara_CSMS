import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeEvent } from '@/shared/realtime';
import * as api from './api';
import type { CdrFilters } from './types';

const KEY = ['cdrs'] as const;

/** A completed session means a new CDR; refetch whichever lists are mounted. */
function useLiveCdrs() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeEvent('session_update', (e) => {
    if (e.status !== 'completed') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: KEY }), 800);
  });
}

export function useCdrs(filters: CdrFilters) {
  useLiveCdrs();
  return useQuery({ queryKey: ['cdrs', 'list', filters], queryFn: () => api.listCdrs(filters) });
}

export function useCdr(id: string) {
  return useQuery({ queryKey: ['cdrs', 'detail', id], queryFn: () => api.getCdr(id) });
}

export function useSessionCdr(sessionId: string) {
  useLiveCdrs();
  return useQuery({
    queryKey: ['cdrs', 'session', sessionId],
    queryFn: () => api.getCdrForSession(sessionId),
  });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cdrId: string) => api.createReceipt(cdrId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
