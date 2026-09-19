import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CpStatusEvent } from '@voltara/shared';
import { useAuth } from '@/app/auth';
import { useRealtimeEvent } from '@/shared/realtime';
import * as api from './api';
import type {
  ChargePointUpdate,
  ChargePointWithConnectors,
  RegisterChargerInput,
  RemoteCommand,
  RemoteOpInput,
} from './types';

const KEY = ['charge-points'] as const;

/**
 * Applies a cp_status broadcast to a cached charge point: connection state and,
 * when present, the one connector that changed. Pure, so the same patch serves
 * the board list and the detail cache.
 */
function applyCpStatus(
  cp: ChargePointWithConnectors,
  event: CpStatusEvent,
): ChargePointWithConnectors {
  if (cp.id !== event.chargePointId) return cp;
  const online = event.connectionState === 'online';
  return {
    ...cp,
    connection_state: event.connectionState,
    last_seen_at: online ? event.at : cp.last_seen_at,
    lifecycle: online && cp.lifecycle === 'pending' ? 'active' : cp.lifecycle,
    connectors: cp.connectors.map((c) => {
      if (event.connector && c.ocpp_connector_id === event.connector.ocppConnectorId) {
        return {
          ...c,
          status: event.connector.status,
          status_updated_at: event.at,
          last_error_code: event.connector.errorCode ?? null,
        };
      }
      // The gateway marks every connector Offline when the socket drops.
      if (!online && c.status !== 'Offline') return { ...c, status: 'Offline' };
      return c;
    }),
  };
}

/**
 * Keeps the charge-point caches live from the tenant Broadcast channel: each
 * cp_status event patches the cached rows immediately, and a trailing refetch
 * reconciles anything the event did not carry (a connector the board has never
 * seen, vendor details after a boot). Mount once per screen that shows chargers.
 */
export function useLiveChargePoints() {
  const qc = useQueryClient();
  const reconcile = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtimeEvent('cp_status', (event) => {
    qc.setQueryData<ChargePointWithConnectors[]>(KEY, (rows) =>
      rows ? rows.map((cp) => applyCpStatus(cp, event)) : rows,
    );
    qc.setQueryData<ChargePointWithConnectors | null>(
      ['charge-points', 'detail', event.chargePointId],
      (cp) => (cp ? applyCpStatus(cp, event) : cp),
    );
    // Coalesce bursts (a boot emits several events) into one authoritative refetch.
    if (reconcile.current) clearTimeout(reconcile.current);
    reconcile.current = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['charge-points', 'detail', event.chargePointId] });
      void qc.invalidateQueries({ queryKey: ['charge-points', 'events', event.chargePointId] });
    }, 1_500);
  });

  useEffect(
    () => () => {
      if (reconcile.current) clearTimeout(reconcile.current);
    },
    [],
  );
}

/**
 * The board. Live updates arrive over Broadcast (useLiveChargePoints); the slow
 * interval is only a safety net for a dropped socket.
 */
export function useChargePoints() {
  useLiveChargePoints();
  return useQuery({
    queryKey: KEY,
    queryFn: api.listChargePoints,
    refetchInterval: 60_000,
  });
}

/** Polls a single charge point — used while waiting for a new charger to boot. */
export function useChargePointWatch(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['charge-points', 'watch', id],
    queryFn: () => api.getChargePoint(id!),
    enabled: Boolean(id) && enabled,
    refetchInterval: 3_000,
    staleTime: 0,
  });
}

export function useChargePointDetail(id: string) {
  useLiveChargePoints();
  return useQuery({
    queryKey: ['charge-points', 'detail', id],
    queryFn: () => api.getChargePointDetail(id),
    refetchInterval: 60_000,
  });
}

export function useConnectionEvents(chargePointId: string) {
  return useQuery({
    queryKey: ['charge-points', 'events', chargePointId, 'connection'],
    queryFn: () => api.listConnectionEvents(chargePointId),
    refetchInterval: 30_000,
  });
}

export function useStatusEvents(chargePointId: string) {
  return useQuery({
    queryKey: ['charge-points', 'events', chargePointId, 'status'],
    queryFn: () => api.listStatusEvents(chargePointId),
    refetchInterval: 30_000,
  });
}

export function useRecentFrames(chargePointId: string, enabled = true) {
  return useQuery({
    queryKey: ['charge-points', 'events', chargePointId, 'frames'],
    queryFn: () => api.listRecentFrames(chargePointId),
    // Frames are not broadcast (volume); a short poll while the log is on
    // screen is the honest option.
    refetchInterval: enabled ? 5_000 : false,
    enabled,
  });
}

export function useUptime(windowDays = 30) {
  return useQuery({
    queryKey: ['charge-points', 'uptime', windowDays],
    queryFn: () => api.listUptime(windowDays),
    staleTime: 60_000,
  });
}

export function useRegisterChargePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterChargerInput) => {
      const registered = await api.registerChargePoint(input);
      // The RPC always registers at profile 2; the explicit downgrade is a
      // separate, auditable write rather than a parameter that could default wrong.
      if (input.securityProfile !== 2) {
        await api.updateChargePoint(registered.chargePointId, {
          security_profile: input.securityProfile,
        });
      }
      return registered;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
    },
  });
}

export function useUpdateChargePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ChargePointUpdate }) =>
      api.updateChargePoint(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
    },
  });
}

export function useDeleteChargePoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteChargePoint(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['charge-points'] });
    },
  });
}

// ── Remote operations ───────────────────────────────────────────────────────

const PENDING = new Set(['queued', 'sent']);

/**
 * Commands issued from this browser session, newest first, with their live
 * status. Outcomes arrive over Broadcast (`command_update`, published by a
 * database trigger); while a command is pending the row is also polled, so a
 * dropped socket never leaves a spinner that never resolves.
 */
export function useRemoteOps(chargePointId: string) {
  const { tenantId, session } = useAuth();
  const qc = useQueryClient();
  const [commands, setCommands] = useState<RemoteCommand[]>([]);

  const upsert = useCallback((next: RemoteCommand) => {
    setCommands((list) => {
      const idx = list.findIndex((c) => c.id === next.id);
      if (idx === -1) return [next, ...list].slice(0, 8);
      const copy = [...list];
      copy[idx] = next;
      return copy;
    });
  }, []);

  useRealtimeEvent('command_update', (event) => {
    if (event.chargePointId !== chargePointId) return;
    setCommands((list) =>
      list.map((c) =>
        c.id === event.commandId ? { ...c, status: event.status, error: event.error } : c,
      ),
    );
    if (!PENDING.has(event.status)) {
      // The settled row carries the charger's actual response — fetch it once.
      void api.getRemoteCommand(event.commandId).then((row) => row && upsert(row));
      // A config command changes the stored snapshot; a reset flips the state.
      void qc.invalidateQueries({ queryKey: ['charge-points', 'detail', chargePointId] });
    }
  });

  // Fallback poll for anything still pending.
  const pendingIds = commands.filter((c) => PENDING.has(c.status)).map((c) => c.id);
  useEffect(() => {
    if (pendingIds.length === 0) return;
    const t = setInterval(() => {
      for (const id of pendingIds) {
        void api.getRemoteCommand(id).then((row) => {
          if (row) upsert(row);
          if (row && !PENDING.has(row.status)) {
            void qc.invalidateQueries({ queryKey: ['charge-points', 'detail', chargePointId] });
          }
        });
      }
    }, 2_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds.join(','), chargePointId]);

  const issue = useMutation({
    mutationFn: (op: RemoteOpInput) =>
      api.issueRemoteCommand(tenantId, session.user.id, chargePointId, op),
    onSuccess: upsert,
  });

  const dismiss = useCallback((id: string) => {
    setCommands((list) => list.filter((c) => c.id !== id));
  }, []);

  return { commands, issue, dismiss };
}

export function useRecentCommands(chargePointId: string) {
  return useQuery({
    queryKey: ['charge-points', 'commands', chargePointId],
    queryFn: () => api.listRecentCommands(chargePointId),
    refetchInterval: 15_000,
  });
}
