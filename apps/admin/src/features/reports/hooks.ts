import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export function useRevenueSummary(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'revenue', from, to],
    queryFn: () => api.revenueSummary(from, to),
  });
}
