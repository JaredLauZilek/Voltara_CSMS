// The connection state machine every charger screen uses.
//
//   idle → scanning → connecting → authenticating → ready
//                                                 ↘ disconnected (auto-retry ×3)
//   any → error (message) · unavailable (no radio in this build)
//
// One hook instance owns one link. Unmounting disconnects. Commands are
// serialised through `busy` so a double-tap cannot race the charger.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChargerLink, ChargerProtocol, ChargerStatus } from '@voltara/shared';
import { UNKNOWN_STATUS } from '@voltara/shared';
import { driverFor } from './drivers';
import { BleTransport, BleUnavailableError } from './transport';

export type LinkPhase =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'error'
  | 'unavailable';

export const PHASE_LABEL: Record<LinkPhase, string> = {
  idle: 'Not connected',
  scanning: 'Looking for charger…',
  connecting: 'Connecting…',
  authenticating: 'Pairing…',
  ready: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection failed',
  unavailable: 'Bluetooth unavailable',
};

/** STATUS pill family for a phase. */
export const PHASE_PILL: Record<LinkPhase, string> = {
  idle: 'Disconnected',
  scanning: 'Connecting',
  connecting: 'Connecting',
  authenticating: 'Connecting',
  ready: 'Connected',
  disconnected: 'Disconnected',
  error: 'Offline',
  unavailable: 'Unavailable',
};

export interface ChargerTarget {
  serial: string;
  protocol: ChargerProtocol;
  pin?: string;
  model?: string;
  firmware?: string;
  ratedAmps?: number;
  phases?: 1 | 3;
}

export interface ChargerConnection {
  phase: LinkPhase;
  error: string | null;
  status: ChargerStatus;
  link: ChargerLink | null;
  busy: 'start' | 'stop' | 'current' | 'lock' | null;
  connect: () => void;
  disconnect: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setMaxCurrent: (amps: number) => Promise<void>;
  setCableLock: (locked: boolean) => Promise<void>;
}

const RETRY_DELAYS_MS = [1500, 3000, 6000];

export function useCharger(
  target: ChargerTarget | null,
  opts: { autoConnect?: boolean; transport?: BleTransport } = {},
): ChargerConnection {
  const transport = opts.transport ?? BleTransport.shared;
  const autoConnect = opts.autoConnect ?? true;

  const [phase, setPhase] = useState<LinkPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ChargerStatus>(UNKNOWN_STATUS);
  const [busy, setBusy] = useState<ChargerConnection['busy']>(null);

  const linkRef = useRef<ChargerLink | null>(null);
  const attemptRef = useRef(0);
  const generationRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantConnected = useRef(false);

  const key = target ? `${target.protocol}:${target.serial}:${target.pin ?? ''}` : null;

  const teardownLink = useCallback(async () => {
    const link = linkRef.current;
    linkRef.current = null;
    if (link) {
      try {
        await link.disconnect();
      } catch {
        // already gone
      }
    }
  }, []);

  const doConnect = useCallback(
    async (gen: number) => {
      if (!target) return;
      const driver = driverFor(target.protocol);
      setError(null);
      try {
        if (driver.needsBle) {
          if (!transport.available) {
            setPhase('unavailable');
            setError(
              'This build has no Bluetooth module. Use a development build, or the simulator.',
            );
            return;
          }
          await transport.ensureReady();
        }
        if (gen !== generationRef.current) return;
        setPhase('scanning');
        const deviceId = await driver.discover(transport, target.serial, { timeoutMs: 15_000 });
        if (gen !== generationRef.current) return;
        setPhase('connecting');
        // The driver authenticates inside connect(); surface the phase anyway.
        const authTimer = setTimeout(() => {
          if (gen === generationRef.current) setPhase('authenticating');
        }, 800);
        let link: ChargerLink;
        try {
          link = await driver.connect(
            transport,
            deviceId,
            { serial: target.serial, pin: target.pin },
            {
              model: target.model,
              firmware: target.firmware,
              ratedAmps: target.ratedAmps,
              phases: target.phases,
            },
          );
        } finally {
          clearTimeout(authTimer);
        }
        if (gen !== generationRef.current) {
          await link.disconnect();
          return;
        }
        linkRef.current = link;
        attemptRef.current = 0;
        link.subscribe((s) => {
          if (gen === generationRef.current) setStatus(s);
        });
        link.onDisconnect((reason) => {
          if (gen !== generationRef.current) return;
          linkRef.current = null;
          setPhase('disconnected');
          if (reason) setError(reason);
          if (wantConnected.current) scheduleRetry(gen);
        });
        try {
          setStatus(await link.readStatus());
        } catch {
          // status will arrive by notification
        }
        setPhase('ready');
      } catch (e) {
        if (gen !== generationRef.current) return;
        const msg = e instanceof BleUnavailableError ? e.message : (e as Error).message;
        setError(msg);
        setPhase(e instanceof BleUnavailableError ? 'unavailable' : 'error');
        if (wantConnected.current && !(e instanceof BleUnavailableError)) scheduleRetry(gen);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, transport],
  );

  const scheduleRetry = useCallback(
    (gen: number) => {
      const n = attemptRef.current;
      if (n >= RETRY_DELAYS_MS.length) return;
      attemptRef.current = n + 1;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        if (gen === generationRef.current && wantConnected.current) void doConnect(gen);
      }, RETRY_DELAYS_MS[n]);
    },
    [doConnect],
  );

  const connect = useCallback(() => {
    if (!target) return;
    wantConnected.current = true;
    attemptRef.current = 0;
    generationRef.current += 1;
    const gen = generationRef.current;
    void teardownLink().then(() => doConnect(gen));
  }, [target, doConnect, teardownLink]);

  const disconnect = useCallback(() => {
    wantConnected.current = false;
    generationRef.current += 1;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    void teardownLink();
    setPhase('idle');
    setStatus(UNKNOWN_STATUS);
  }, [teardownLink]);

  // Connect when the target appears / changes; tear down on unmount.
  useEffect(() => {
    if (!key) return;
    if (autoConnect) connect();
    return () => {
      wantConnected.current = false;
      generationRef.current += 1;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      void teardownLink();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoConnect]);

  const guarded = useCallback(
    async (kind: NonNullable<ChargerConnection['busy']>, fn: (l: ChargerLink) => Promise<void>) => {
      const link = linkRef.current;
      if (!link) throw new Error('Not connected');
      if (busy) return;
      setBusy(kind);
      try {
        await fn(link);
        try {
          setStatus(await link.readStatus());
        } catch {
          // notification will catch up
        }
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  return useMemo<ChargerConnection>(
    () => ({
      phase,
      error,
      status,
      link: linkRef.current,
      busy,
      connect,
      disconnect,
      start: () => guarded('start', (l) => l.start()),
      stop: () => guarded('stop', (l) => l.stop()),
      setMaxCurrent: (amps) => guarded('current', (l) => l.setMaxCurrent(amps)),
      setCableLock: (locked) => guarded('lock', (l) => l.setCableLock(locked)),
    }),
    [phase, error, status, busy, connect, disconnect, guarded],
  );
}
