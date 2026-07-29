import type { Db } from './client.js';

export const COMMAND_CHANNEL = 'voltara_remote_commands';

export interface RemoteCommandRow {
  id: string;
  tenant_id: string;
  charge_point_id: string;
  action: string;
  payload: Record<string, unknown>;
  status: string;
}

export async function fetchCommand(db: Db, id: string): Promise<RemoteCommandRow | null> {
  const rows = await db<RemoteCommandRow[]>`
    select id, tenant_id, charge_point_id, action, payload, status
    from public.remote_commands
    where id = ${id}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Claims a command for dispatch. The `status = 'queued'` guard makes this a
 * compare-and-set: if two gateway instances are notified for the same command,
 * only one gets a row back and only one charger call is made.
 */
export async function claimCommand(db: Db, id: string): Promise<RemoteCommandRow | null> {
  const rows = await db<RemoteCommandRow[]>`
    update public.remote_commands
    set status = 'sent', sent_at = now()
    where id = ${id} and status = 'queued'
    returning id, tenant_id, charge_point_id, action, payload, status
  `;
  return rows[0] ?? null;
}

export async function completeCommand(
  db: Db,
  id: string,
  outcome: 'accepted' | 'rejected' | 'timeout' | 'failed',
  detail: { response?: unknown; error?: string },
): Promise<void> {
  await db`
    update public.remote_commands set
      status = ${outcome},
      responded_at = now(),
      response = ${detail.response === undefined ? null : db.json(detail.response as never)},
      error = ${detail.error ?? null}
    where id = ${id}
  `;
}

/** Commands still queued for a charger that has just (re)connected. */
export async function listQueuedForChargePoint(
  db: Db,
  chargePointId: string,
): Promise<RemoteCommandRow[]> {
  return db<RemoteCommandRow[]>`
    select id, tenant_id, charge_point_id, action, payload, status
    from public.remote_commands
    where charge_point_id = ${chargePointId} and status = 'queued'
    order by created_at asc
    limit 50
  `;
}

/**
 * Fails commands stranded by a restart. Without this a gateway crash leaves
 * rows sitting in 'queued'/'sent' forever and the UI shows a spinner that never
 * resolves.
 */
export async function expireStrandedCommands(db: Db, olderThanMinutes = 10): Promise<number> {
  const rows = await db`
    update public.remote_commands
    set status = 'timeout',
        responded_at = now(),
        error = 'Gateway restarted before the charger answered'
    where status in ('queued', 'sent')
      and created_at < now() - (${olderThanMinutes}::text || ' minutes')::interval
    returning id
  `;
  return rows.length;
}
