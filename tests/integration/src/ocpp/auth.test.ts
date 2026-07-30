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
    expect(rejections[0].close_reason).toMatch(/bad credentials \(password length \d+/);
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

describe('per-charger TLS enforcement (x-forwarded-proto from the edge proxy)', () => {
  it('refuses plaintext ws:// for a profile-2 charger, with a recorded reason', async () => {
    await expect(
      connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
        headers: { 'x-forwarded-proto': 'http' },
      }),
    ).rejects.toThrow();

    const rejections = await waitFor(
      async () => {
        const rows = await sql`
          select close_reason from public.charge_point_connection_log
          where charge_point_id = ${FIXTURES.chargePointA} and event = 'rejected'
          order by id desc limit 1
        `;
        return rows.length > 0 ? rows : null;
      },
      { label: 'tls rejection to be logged' },
    );
    expect(rejections[0].close_reason).toMatch(/tls required/i);
  });

  it('accepts plaintext for a charger explicitly flagged security profile 1', async () => {
    await sql`update public.charge_points set security_profile = 1 where id = ${FIXTURES.chargePointA}`;

    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      headers: { 'x-forwarded-proto': 'http' },
    });
    const boot = await charger.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'Legacy',
      chargePointModel: 'PlaintextUnit',
    });
    expect(boot.status).toBe('Accepted');
    await charger.close();
  });

  it('is indifferent to the header when TLS was used', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    const boot = await charger.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'Solidstudio',
      chargePointModel: 'Virtual Charge Point',
    });
    expect(boot.status).toBe('Accepted');
    await charger.close();
  });
});

describe('authentication failure diagnostics', () => {
  it('names the case where no credentials were presented at all', async () => {
    // Firmware that ties its auth fields to a TLS toggle sends nothing when
    // TLS is off — the most common real-world commissioning failure.
    await expect(
      connectCharger(gw.port, FIXTURES.identityA, undefined as unknown as string),
    ).rejects.toThrow();

    const rows = await waitFor(
      async () => {
        const r = await sql`
          select close_reason from public.charge_point_connection_log
          where charge_point_id = ${FIXTURES.chargePointA} and event = 'rejected'
          order by id desc limit 1
        `;
        return r.length > 0 ? r : null;
      },
      { label: 'no-credentials rejection to be logged' },
    );
    expect(rows[0].close_reason).toBe('no credentials presented');
  });

  it('names the case where the auth username does not match the charge point id', async () => {
    const wrongUser = Buffer.from(`NOT-THE-ID:${FIXTURES.keyA}`).toString('base64');
    await expect(
      connectCharger(gw.port, FIXTURES.identityA, undefined as unknown as string, {
        headers: { authorization: `Basic ${wrongUser}` },
      }),
    ).rejects.toThrow();

    const rows = await waitFor(
      async () => {
        const r = await sql`
          select close_reason from public.charge_point_connection_log
          where charge_point_id = ${FIXTURES.chargePointA} and event = 'rejected'
          order by id desc limit 1
        `;
        return r[0]?.close_reason?.includes('username') ? r : null;
      },
      { label: 'username-mismatch rejection to be logged' },
    );
    expect(rows[0].close_reason).toBe('auth username does not match the charge point id');
  });

  it('reveals the length (never the value) of a wrong password', async () => {
    await expect(connectCharger(gw.port, FIXTURES.identityA, 'short-key')).rejects.toThrow();

    const rows = await waitFor(
      async () => {
        const r = await sql`
          select close_reason from public.charge_point_connection_log
          where charge_point_id = ${FIXTURES.chargePointA} and event = 'rejected'
          order by id desc limit 1
        `;
        return r[0]?.close_reason?.includes('length') ? r : null;
      },
      { label: 'length-revealing rejection to be logged' },
    );
    expect(rows[0].close_reason).toBe('bad credentials (password length 9, expected 32)');
    expect(rows[0].close_reason).not.toContain('short-key');
  });
});

describe('security profile 0 — identity-only connections', () => {
  it('accepts a charger presenting nothing but its ID', async () => {
    await sql`update public.charge_points set security_profile = 0 where id = ${FIXTURES.chargePointA}`;

    const charger = await connectCharger(
      gw.port,
      FIXTURES.identityA,
      undefined as unknown as string,
    );
    const boot = await charger.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'OpenMode',
      chargePointModel: 'IdentityOnly',
    });
    expect(boot.status).toBe('Accepted');
    await charger.close();
  });

  it('ignores whatever credentials an open-mode charger happens to send', async () => {
    await sql`update public.charge_points set security_profile = 0 where id = ${FIXTURES.chargePointA}`;

    const charger = await connectCharger(gw.port, FIXTURES.identityA, 'total-nonsense-key');
    const boot = await charger.call<{ status: string }>('BootNotification', {
      chargePointVendor: 'OpenMode',
      chargePointModel: 'IdentityOnly',
    });
    expect(boot.status).toBe('Accepted');
    await charger.close();
  });

  it('still requires the password at profile 1 and above', async () => {
    // resetChargerState restores profile 2; drop to 1 to isolate the auth check.
    await sql`update public.charge_points set security_profile = 1 where id = ${FIXTURES.chargePointA}`;
    await expect(
      connectCharger(gw.port, FIXTURES.identityA, undefined as unknown as string),
    ).rejects.toThrow();
  });
});
