import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export function useSessions() {
  return useQuery({ queryKey: ['sessions', 'list'], queryFn: api.listSessions });
}

export function useActiveSession() {
  return useQuery({ queryKey: ['sessions', 'active'], queryFn: api.activeSession, refetchInterval: 5_000 });
}

export function useSession(id: string) {
  return useQuery({ queryKey: ['sessions', 'detail', id], queryFn: () => api.getSession(id), refetchInterval: 5_000 });
}

export function useSessionCdr(sessionId: string, enabled: boolean) {
  return useQuery({ queryKey: ['sessions', 'cdr', sessionId], queryFn: () => api.getCdr(sessionId), enabled, refetchInterval: enabled ? 3_000 : false });
}

export function useReceipt(cdrId: string | null) {
  return useQuery({ queryKey: ['sessions', 'receipt', cdrId], queryFn: () => api.getReceipt(cdrId!), enabled: Boolean(cdrId) });
}

export function useSessionMinutes(sessionId: string, live: boolean) {
  return useQuery({ queryKey: ['sessions', 'minutes', sessionId], queryFn: () => api.sessionMinutes(sessionId), refetchInterval: live ? 30_000 : false });
}
