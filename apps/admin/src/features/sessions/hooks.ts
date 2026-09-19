import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeterEvent } from '@voltara/shared';
import { useRealtimeEvent } from '@/shared/realtime';
import * as api from './api';
import type { SessionFilters } from './api';
import type { SessionWithChargePoint } from './types';

const KEY = ['sessions'] as const;

/**
 * Keeps session lists live: a session_update (start, status flip, stop)
 * refetches whichever lists are mounted; meter events patch the live energy
 * figure on the open session so the number moves without a refetch.
 */
export function useLiveSessions() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtimeEvent('session_update', () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: KEY }), 400);
  });

  useRealtimeEvent('meter', (event: MeterEvent) => {
    qc.setQueriesData<SessionWithChargePoint[]>({ queryKey: KEY, exact: false }, (rows) =>
      Array.isArray(rows)
        ? rows.map((s) =>
            s.id === event.sessionId && event.energyWh !== null && s.meter_start_wh !== null
              ? { ...s, energy_wh: Math.max(0, event.energyWh - Number(s.meter_start_wh)) }
              : s,
          )
        : rows,
    );
    qc.setQueryData<
      { session: SessionWithChargePoint | null; livePowerW: number | null } | undefined
    >(['sessions', 'detail', event.sessionId], (d) =>
      d?.session ? { ...d, livePowerW: event.powerW } : d,
    );
  });
}

export function useSessions(filters: SessionFilters) {
  useLiveSessions();
  return useQuery({
    queryKey: ['sessions', 'list', filters],
    queryFn: () => api.listSessions(filters),
    refetchInterval: 60_000,
  });
}

export function useTodaySessions() {
  useLiveSessions();
  return useQuery({
    queryKey: ['sessions', 'today'],
    queryFn: api.listTodayAndOpenSessions,
    refetchInterval: 60_000,
  });
}

export function useSessionDetail(id: string) {
  useLiveSessions();
  return useQuery({
    queryKey: ['sessions', 'detail', id],
    queryFn: async () => ({ session: await api.getSession(id), livePowerW: null as number | null }),
    refetchInterval: 30_000,
  });
}

export function useSessionMinutes(id: string, open: boolean) {
  return useQuery({
    queryKey: ['sessions', 'minutes', id],
    queryFn: () => api.listSessionMinutes(id),
    // The rollup job runs every 5 minutes; poll a live session at that cadence.
    refetchInterval: open ? 60_000 : false,
  });
}
