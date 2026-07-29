// A charger that holds its socket open but never answers.
//
// Kept in its own file deliberately. ocpp-rpc serialises outbound calls per
// socket, and this scenario parks a call for the full call-timeout window — run
// alongside the other command tests it queues behind their traffic and the
// timing assertion stops meaning anything. One file, one gateway, one charger.

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
  // Two seconds instead of the production thirty, so the suite does not spend
  // half a minute proving a timer works.
  gw = await startGateway({ CALL_TIMEOUT_MS: '2000' });
});

afterAll(async () => {
  await gw.gateway.stop();
  await closeHarness();
});

afterEach(resetChargerState);

describe('unresponsive charger', () => {
  it('settles the command as timeout rather than leaving it pending', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: {
        // Never resolves: the socket is open, the charger is wedged.
        Reset: () => new Promise(() => {}),
      },
    });
    await charger.call('BootNotification', {
      chargePointVendor: 'Solidstudio',
      chargePointModel: 'Virtual Charge Point',
    });

    const [{ id }] = await sql<{ id: string }[]>`
      insert into public.remote_commands (tenant_id, charge_point_id, action, payload)
      values (${FIXTURES.tenantA}, ${FIXTURES.chargePointA}, 'Reset', ${sql.json({ type: 'Hard' })})
      returning id
    `;

    const settled = await waitFor(
      async () => {
        const [row] = await sql`select status, error from public.remote_commands where id = ${id}`;
        return row && !['queued', 'sent'].includes(row.status as string) ? row : null;
      },
      { timeoutMs: 12_000, label: 'command to time out' },
    );

    expect(settled.status).toBe('timeout');
    expect(settled.error).toMatch(/timeout/i);

    await charger.close();
  }, 20_000);
});
