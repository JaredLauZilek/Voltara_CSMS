import { useQuery } from '@tanstack/react-query';
import * as api from './api';

const KEY = ['audit-log'] as const;

export function useAuditLog() {
  return useQuery({ queryKey: KEY, queryFn: () => api.listAuditLog(), refetchInterval: 60_000 });
}

export function useAuditPeople() {
  return useQuery({ queryKey: [...KEY, 'people'], queryFn: api.listPeople, staleTime: 300_000 });
}
