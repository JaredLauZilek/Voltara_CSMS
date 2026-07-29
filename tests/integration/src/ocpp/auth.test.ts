// Connection-time security: who may hold a socket, and what the gateway does
// with input it should not trust.

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
  gw = await startGateway();
});

afterAll(async () => {
  await gw.gateway.stop();
  await closeHarness();
});

afterEach(resetChargerState);

describe('Security Profile 2 handshake', () => {
  it('accepts a charger presenting the right key', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    const boot = await charger.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'Solidstudio',
      chargePointModel: 'Virtual Charge Point',
    });
    expect(boot.status).toBe('Accepted');
    await charger.close();
  });

  it('rejects a wrong key', async () => {
    await expect(
      connectCharger(gw.port, FIXTURES.identityA, 'not-the-right-key'),
    ).rejects.toThrow();

    const rejections = await waitFor(
      async () => {
        const rows = await sql`
          select event, close_reason from public.charge_point_connection_log
          where charge_point_id = ${FIXTURES.chargePointA} and event = 'rejected'
        `;
        return rows.length > 0 ? rows : null;
      },
      { label: 'rejection to be logged' },
    );
    expect(rejections[0].close_reason).toBe('bad credentials');
  });

  it('rejects an unknown identity', async () => {
    await expect(connectCharger(gw.port, 'VCP-DOES-NOT-EXIST', 'whatever')).rejects.toThrow();
  });

  it('rejects a decommissioned charge point even with a valid key', async () => {
    await expect(
      connectCharger(gw.port, FIXTURES.retiredIdentity, FIXTURES.keyRetired),
    ).rejects.toThrow();

    const rejections = await waitFor(
      async () => {
        const rows = await sql`
          select close_reason from public.charge_point_connection_log
          where charge_point_id = ${FIXTURES.retiredChargePoint} and event = 'rejected'
        `;
        return rows.length > 0 ? rows : null;
      },
      { label: 'decommissioned rejection to be logged' },
    );
    expect(rejections[0].close_reason).toBe('decommissioned');
  });

  it('resolves the owning tenant from the charger identity', async () => {
    // Same gateway, different tenant: everything this charger writes must be
    // stamped with tenant B, never the tenant of the previous connection.
    const charger = await connectCharger(gw.port, FIXTURES.identityB, FIXTURES.keyB);
    await charger.call('BootNotification', {
      chargePointVendor: 'Solidstudio',
      chargePointModel: 'Virtual Charge Point',
    });
    await charger.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
    });

    const logs = await sql`
      select distinct tenant_id from public.charge_point_status_log
      where charge_point_id = ${FIXTURES.chargePointB}
    `;
    expect(logs).toHaveLength(1);
    expect(logs[0].tenant_id).toBe(FIXTURES.tenantB);

    await charger.close();
  });
});

describe('untrusted input', () => {
  it('answers a malformed payload with a CALLERROR and stays connected', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);

    // meterStart is required and must be an integer.
    await expect(
      charger.call('StartTransaction', { connectorId: 1, idTag: FIXTURES.idTag }),
    ).rejects.toThrow();

    // The socket survives: one bad frame must not cost us the charger.
    const boot = await charger.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'Solidstudio',
      chargePointModel: 'Virtual Charge Point',
    });
    expect(boot.status).toBe('Accepted');

    const errors = await waitFor(
      async () => {
        const rows = await sql`
          select message_type, error_code from public.ocpp_messages
          where charge_point_id = ${FIXTURES.chargePointA} and message_type = 4
        `;
        return rows.length > 0 ? rows : null;
      },
      { label: 'CALLERROR to be logged' },
    );
    expect(errors[0].error_code).toBeTruthy();

    await charger.close();
  });

  it('answers an unsupported action with NotImplemented', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await expect(
      charger.call('DiagnosticsStatusNotification', { status: 'Idle' }),
    ).rejects.toThrow();
    await charger.close();
  });

  it('never persists an AuthorizationKey value in the frame log', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      handlers: { ChangeConfiguration: () => ({ status: 'Accepted' }) },
    });
    await charger.call('BootNotification', {
      chargePointVendor: 'Solidstudio',
      chargePointModel: 'Virtual Charge Point',
    });

    const secret = 'super-secret-rotation-key';
    await sql`
      insert into public.remote_commands (tenant_id, charge_point_id, action, payload)
      values (${FIXTURES.tenantA}, ${FIXTURES.chargePointA}, 'ChangeConfiguration',
              ${sql.json({ key: 'AuthorizationKey', value: secret })})
    `;

    await waitFor(
      async () => {
        const rows = await sql`
          select payload from public.ocpp_messages
          where charge_point_id = ${FIXTURES.chargePointA} and action = 'ChangeConfiguration'
        `;
        return rows.length > 0 ? rows : null;
      },
      { label: 'ChangeConfiguration frame to be logged' },
    );

    const leaked = await sql`
      select count(*)::int as n from public.ocpp_messages
      where charge_point_id = ${FIXTURES.chargePointA}
        and payload::text like ${'%' + secret + '%'}
    `;
    expect(leaked[0].n).toBe(0);

    const [frame] = await sql`
      select payload from public.ocpp_messages
      where charge_point_id = ${FIXTURES.chargePointA} and action = 'ChangeConfiguration'
        and direction = 'out'
      limit 1
    `;
    expect((frame.payload as { value: string }).value).toBe('[redacted]');

    await charger.close();
  });
});
