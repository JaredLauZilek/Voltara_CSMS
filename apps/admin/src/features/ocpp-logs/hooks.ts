import { useInfiniteQuery } from '@tanstack/react-query';
import * as api from './api';
import type { LogFilters } from './types';

export function useOcppLog(filters: LogFilters) {
  return useInfiniteQuery({
    queryKey: ['ocpp-logs', filters],
    queryFn: ({ pageParam }) => api.listMessages(filters, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length < api.PAGE ? undefined : last[last.length - 1].id),
    // The first page refreshes on a short poll while the viewer is open —
    // frames are too high-volume to broadcast (CLAUDE.md §8).
    refetchInterval: 10_000,
  });
}
