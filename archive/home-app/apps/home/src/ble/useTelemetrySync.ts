// Forwards what the phone sees over BLE to Supabase so the admin portal and
// history work. Readings are sampled at ≥5 s (plus every state change) and
// flushed in batches; sessions open when charging starts and close when it
// stops or the cable is pulled. Everything is best-effort: a failed upload is
// retried on the next flush and never blocks the UI.

import { useEffect, useRef } from 'react';
import type { ChargerStatus, ReadingRow } from '@voltara/shared';
import { toReadingRow } from '@voltara/shared';
import { closeSession, ingestReadings, openSession } from '@/features/sessions/api';
import type { ChargerConnection } from './useCharger';

const SAMPLE_MS = 5_000;
const FLUSH_MS = 15_000;
const MAX_BUFFER = 600;

export function useTelemetrySync(
  chargerId: string | null,
  conn: ChargerConnection,
  source: ReadingRow['source'],
): void {
  const buffer = useRef<ReadingRow[]>([]);
  const lastSampleAt = useRef(0);
  const lastState = useRef<ChargerStatus['state']>('Unknown');
  const sessionId = useRef<string | null>(null);
  const maxPower = useRef(0);
  const flushing = useRef(false);

  // Sample.
  useEffect(() => {
    if (!chargerId || conn.phase !== 'ready' || conn.status.state === 'Unknown') return;
    const s = conn.status;
    const stateChanged = s.state !== lastState.current;
    if (!stateChanged && s.at - lastSampleAt.current < SAMPLE_MS) return;
    lastSampleAt.current = s.at;
    lastState.current = s.state;
    buffer.current.push(toReadingRow(s, source));
    if (buffer.current.length > MAX_BUFFER)
      buffer.current.splice(0, buffer.current.length - MAX_BUFFER);
    if (s.powerKw > maxPower.current) maxPower.current = s.powerKw;

    // Session boundaries.
    if (s.state === 'Charging' && !sessionId.current) {
      openSession(chargerId, new Date(s.at).toISOString(), s.energyTotalKwh, source)
        .then((id) => {
          sessionId.current = id;
          maxPower.current = s.powerKw;
        })
        .catch((e) => console.warn('open_session failed', e.message));
    } else if (
      sessionId.current &&
      (s.state === 'Available' || s.state === 'Finishing' || s.state === 'Faulted' || !s.plugged)
    ) {
      const id = sessionId.current;
      sessionId.current = null;
      closeSession(
        id,
        new Date(s.at).toISOString(),
        s.energyTotalKwh,
        maxPower.current,
        s.state,
      ).catch((e) => console.warn('close_session failed', e.message));
    }
  }, [chargerId, conn.phase, conn.status, source]);

  // Flush.
  useEffect(() => {
    if (!chargerId) return;
    const flush = async () => {
      if (flushing.current || buffer.current.length === 0) return;
      flushing.current = true;
      const rows = buffer.current.splice(0, buffer.current.length);
      try {
        await ingestReadings(chargerId, rows);
      } catch (e) {
        buffer.current.unshift(...rows);
        console.warn('ingest_readings failed', (e as Error).message);
      } finally {
        flushing.current = false;
      }
    };
    const timer = setInterval(flush, FLUSH_MS);
    return () => {
      clearInterval(timer);
      void flush();
    };
  }, [chargerId]);
}
