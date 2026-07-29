// The admin→gateway command bus. The admin app never speaks to the gateway
// directly: it inserts a row, a trigger fires pg_notify, and whichever gateway
// holds the socket acts on it (CLAUDE.md §6).

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closeHarness,
  connectCharger,
  FIXTURES,
  resetChargerState,
  sql,
  startGateway,
  waitFor,
  type RunningGateway,
} from '../support/harness.js';

let gw: RunningGateway;

beforeAll(async () => {
  // Short call timeout so the "charger never answers" case settles in seconds
  // rather than the 30s a real deployment allows a slow charger.
  gw = await startGateway({ CALL_TIMEOUT_MS: '3000' });
});

afterAll(async () => {
  await gw.gateway.stop();
  await closeHarness();
});

afterEach(resetChargerState);

const BOOT = { chargePointVendor: 'Solidstudio', chargePointModel: 'Virtual Charge Point' };

async function queueCommand(action: string, payload: unknown): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.remote_commands (tenant_id, charge_point_id, action, payload)
    values (${FIXTURES.tenantA}, ${FIXTURES.chargePointA}, ${action}, ${sql.json(payload as never)})
    returning id
  `;
  return row.id;
}

async function commandStatus(id: string) {
  return waitFor(
    async () => {
      const [row] = await sql`
        select status, response, error, sent_at, responded_at
        from public.remote_commands where id = ${id}
      `;
      return row && row.status !== 'queued' && row.status !== 'sent' ? row : null;
    },
    { label: `command ${id} to settle` },
  );
}

describe('remote command dispatch', () => {
  it('delivers a RemoteStartTransaction the charger accepts', async () => {
    let received: unknown = null;
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: {
        RemoteStartTransaction: (params) => {
          received = params;
          return { status: 'Accepted' };
        },
      },
    });
    await charger.call('BootNotification', BOOT);

    const id = await queueCommand('RemoteStartTransaction', {
      idTag: FIXTURES.idTag,
      connectorId: 1,
    });
    const settled = await commandStatus(id);

    expect(settled.status).toBe('accepted');
    expect(settled.sent_at).not.toBeNull();
    expect(settled.responded_at).not.toBeNull();
    expect(settled.response).toEqual({ status: 'Accepted' });
    expect(received).toMatchObject({ idTag: FIXTURES.idTag, connectorId: 1 });

    await charger.close();
  });

  it('records a charger refusal as rejected, not failed', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: { Reset: () => ({ status: 'Rejected' }) },
    });
    await charger.call('BootNotification', BOOT);

    const settled = await commandStatus(await queueCommand('Reset', { type: 'Soft' }));
    // The charger answered — the command worked, the charger declined.
    expect(settled.status).toBe('rejected');
    expect(settled.error).toBeNull();

    await charger.close();
  });

  it('treats UnlockConnector "Unlocked" as success despite the non-standard status name', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: { UnlockConnector: () => ({ status: 'Unlocked' }) },
    });
    await charger.call('BootNotification', BOOT);

    const settled = await commandStatus(await queueCommand('UnlockConnector', { connectorId: 1 }));
    expect(settled.status).toBe('accepted');

    await charger.close();
  });

  it('fails a command for a charger that is not connected', async () => {
    const settled = await commandStatus(await queueCommand('ClearCache', {}));
    expect(settled.status).toBe('failed');
    expect(settled.error).toMatch(/not connected/i);
  });

  it('rejects a malformed payload before it reaches the charger', async () => {
    let called = false;
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: {
        RemoteStartTransaction: () => {
          called = true;
          return { status: 'Accepted' };
        },
      },
    });
    await charger.call('BootNotification', BOOT);

    // idTag is required; sending this on would just earn a CALLERROR.
    const settled = await commandStatus(
      await queueCommand('RemoteStartTransaction', { connectorId: 1 }),
    );
    expect(settled.status).toBe('failed');
    expect(settled.error).toMatch(/idTag/i);
    expect(called).toBe(false);

    await charger.close();
  });

  it('drains commands queued while the charger was away, once it connects', async () => {
    // Queued first — nothing is holding this charger's socket yet.
    const id = await queueCommand('ClearCache', {});
    const failed = await commandStatus(id);
    expect(failed.status).toBe('failed');

    // Requeue and connect: the drain-on-connect path is what covers the race
    // between issuing a command and the charger's socket becoming ready.
    await sql`update public.remote_commands set status = 'queued', responded_at = null, error = null where id = ${id}`;

    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: { ClearCache: () => ({ status: 'Accepted' }) },
    });
    await charger.call('BootNotification', BOOT);

    const settled = await commandStatus(id);
    expect(settled.status).toBe('accepted');

    await charger.close();
  });
});

describe('connection registry', () => {
  it('claims the charger for this gateway instance and releases it on close', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await charger.call('BootNotification', BOOT);

    const claimed = await waitFor(
      async () => {
        const rows = await sql`
          select gateway_instance, tenant_id from public.charge_point_connections
          where ocpp_identity = ${FIXTURES.identityA}
        `;
        return rows.length > 0 ? rows : null;
      },
      { label: 'registry claim' },
    );
    expect(claimed[0].gateway_instance).toBe(gw.instance);
    expect(claimed[0].tenant_id).toBe(FIXTURES.tenantA);

    await charger.close();

    await waitFor(
      async () => {
        const rows = await sql`
          select 1 from public.charge_point_connections where ocpp_identity = ${FIXTURES.identityA}
        `;
        return rows.length === 0 ? true : null;
      },
      { label: 'registry release' },
    );
  });
});
