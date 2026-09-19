import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeEvent } from '@/shared/realtime';
import * as api from './api';

export function useRecentActivity() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A status change is exactly what this feed shows; refetch shortly after.
  useRealtimeEvent('cp_status', () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void qc.invalidateQueries({ queryKey: ['overview', 'activity'] }),
      600,
    );
  });
  return useQuery({
    queryKey: ['overview', 'activity'],
    queryFn: () => api.listRecentActivity(),
    refetchInterval: 60_000,
  });
}
