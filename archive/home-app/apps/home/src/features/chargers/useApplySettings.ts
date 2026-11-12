// Reconciles desired settings (Supabase) with the charger (BLE): whenever a
// link is ready and the stored version is newer than the applied one, push
// the limit and cable lock, then report the version back.
import { useEffect, useRef } from 'react';
import type { ChargerConnection } from '@/ble';
import { reportSettingsApplied } from './api';
import type { ChargerSettings } from './types';

export function useApplySettings(
  chargerId: string | null,
  settings: ChargerSettings | null | undefined,
  conn: ChargerConnection,
): void {
  const applying = useRef<number | null>(null);
  useEffect(() => {
    if (!chargerId || !settings || conn.phase !== 'ready') return;
    if (settings.applied_version != null && settings.applied_version >= settings.version) return;
    if (applying.current === settings.version) return;
    applying.current = settings.version;
    (async () => {
      try {
        await conn.setMaxCurrent(settings.max_current_a);
        await conn.setCableLock(settings.cable_locked);
        await reportSettingsApplied(chargerId, settings.version);
      } catch (e) {
        console.warn('apply settings failed', (e as Error).message);
        applying.current = null;
      }
    })();
  }, [chargerId, settings, conn]);
}
