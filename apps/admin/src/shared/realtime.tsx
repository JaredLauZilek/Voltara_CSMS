// Tenant Realtime Broadcast — one private channel per tenant (CLAUDE.md §8).
//
// The shell mounts <TenantRealtimeProvider> once; features subscribe to the
// typed events with useRealtimeEvent() and patch / invalidate their own
// TanStack caches. This file is the ONLY place that opens a Realtime channel.
//
// Never postgres_changes (ADR-0003): the gateway publishes cp_status /
// session_update / meter, and a database trigger publishes command_update.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { BROADCAST_EVENTS, tenantChannel } from '@voltara/shared';
import type { BroadcastEvent, BroadcastPayloads } from '@voltara/shared';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/app/auth';

type Handler<E extends BroadcastEvent> = (payload: BroadcastPayloads[E]) => void;

interface RealtimeApi {
  /** 'live' once the channel is joined; 'connecting' before; 'error' if refused. */
  status: 'connecting' | 'live' | 'error';
  subscribe: <E extends BroadcastEvent>(event: E, handler: Handler<E>) => () => void;
}

const RealtimeContext = createContext<RealtimeApi | null>(null);

export function TenantRealtimeProvider({ children }: { children: ReactNode }) {
  const { tenantId, session } = useAuth();
  const [status, setStatus] = useState<RealtimeApi['status']>('connecting');
  // Listeners live in a ref so the channel subscription never re-runs when a
  // feature mounts or unmounts a handler.
  const listeners = useRef(new Map<string, Set<(payload: unknown) => void>>());

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      // Private channels are authorised by RLS on realtime.messages, evaluated
      // against the JWT — so the socket must carry the user's token.
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase.channel(tenantChannel(tenantId), { config: { private: true } });
      for (const event of Object.values(BROADCAST_EVENTS)) {
        channel.on('broadcast', { event }, (msg: { payload: unknown }) => {
          const set = listeners.current.get(event);
          if (!set) return;
          for (const fn of set) fn(msg.payload);
        });
      }
      channel.subscribe((state) => {
        if (state === 'SUBSCRIBED') setStatus('live');
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setStatus('error');
        else if (state === 'CLOSED') setStatus('connecting');
      });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, session.access_token]);

  const api = useMemo<RealtimeApi>(
    () => ({
      status,
      subscribe: (event, handler) => {
        const set = listeners.current.get(event) ?? new Set();
        set.add(handler as (payload: unknown) => void);
        listeners.current.set(event, set);
        return () => {
          set.delete(handler as (payload: unknown) => void);
        };
      },
    }),
    [status],
  );

  return <RealtimeContext.Provider value={api}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeStatus(): RealtimeApi['status'] {
  const ctx = useContext(RealtimeContext);
  return ctx?.status ?? 'connecting';
}

/**
 * Subscribe to one broadcast event for the lifetime of the component. The
 * handler is read through a ref so callers may pass an inline closure.
 */
export function useRealtimeEvent<E extends BroadcastEvent>(event: E, handler: Handler<E>): void {
  const ctx = useContext(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(event, (payload) => latest.current(payload));
  }, [ctx, event]);
}
