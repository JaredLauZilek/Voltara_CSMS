// The transaction lifecycle: the behaviour the whole platform bills on.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

beforeEach(resetChargerState);
afterEach(resetChargerState);

const BOOT = {
  chargePointVendor: 'Solidstudio',
  chargePointModel: 'Virtual Charge Point',
  firmwareVersion: '1.2.3',
  chargePointSerialNumber: 'SIM-0001',
};

describe('happy path: boot → status → authorize → start → meter → stop', () => {
  it('records the full session with energy from the meter register', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);

    // Boot
    const boot = await charger.call<{ status: string; interval: number; currentTime: string }>(
      'BootNotification',
      BOOT,
    );
    expect(boot.status).toBe('Accepted');
    expect(boot.interval).toBeGreaterThan(0);
    expect(Date.parse(boot.currentTime)).not.toBeNaN();

    const [cp] = await sql`
      select connection_state, vendor_reported, model_reported, firmware_version, lifecycle
      from public.charge_points where id = ${FIXTURES.chargePointA}
    `;
    expect(cp.connection_state).toBe('online');
    expect(cp.vendor_reported).toBe('Solidstudio');
    expect(cp.firmware_version).toBe('1.2.3');

    // Connector becomes available
    await charger.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
    });
    const [available] = await sql`
      select status from public.connectors where charge_point_id = ${FIXTURES.chargePointA}
    `;
    expect(available.status).toBe('Available');

    // Authorize
    const auth = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: FIXTURES.idTag,
    });
    expect(auth.idTagInfo.status).toBe('Accepted');

    // Start
    const start = await charger.call<{ transactionId: number; idTagInfo: { status: string } }>(
      'StartTransaction',
      {
        connectorId: 1,
        idTag: FIXTURES.idTag,
        meterStart: 1_000,
        timestamp: new Date().toISOString(),
      },
    );
    expect(start.idTagInfo.status).toBe('Accepted');
    expect(start.transactionId).toBeGreaterThan(0);

    const [session] = await sql`
      select id, status, meter_start_wh, offline, tenant_id, start_source
      from public.charging_sessions where ocpp_transaction_id = ${start.transactionId}
    `;
    expect(session.status).toBe('active');
    expect(Number(session.meter_start_wh)).toBe(1_000);
    expect(session.offline).toBe(false);
    expect(session.tenant_id).toBe(FIXTURES.tenantA);

    // Charging
    await charger.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Charging',
    });

    // Meter values — mixed units on purpose: kWh must be normalised to Wh.
    await charger.call('MeterValues', {
      connectorId: 1,
      transactionId: start.transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: '5.5', measurand: 'Energy.Active.Import.Register', unit: 'kWh' },
            { value: '7400', measurand: 'Power.Active.Import', unit: 'W' },
            { value: '62', measurand: 'SoC', unit: 'Percent' },
          ],
        },
      ],
    });

    const samples = await waitFor(
      async () => {
        const rows = await sql`
          select measurand, value, unit from public.meter_values
          where charging_session_id = ${session.id} order by measurand
        `;
        return rows.length >= 3 ? rows : null;
      },
      { label: 'meter values to be written' },
    );

    const energy = samples.find((s) => s.measurand === 'Energy.Active.Import.Register');
    expect(Number(energy!.value)).toBe(5_500); // 5.5 kWh → Wh
    expect(energy!.unit).toBe('Wh');
    const soc = samples.find((s) => s.measurand === 'SoC');
    expect(Number(soc!.value)).toBe(62);

    // Stop
    const stop = await charger.call<{ idTagInfo?: { status: string } }>('StopTransaction', {
      transactionId: start.transactionId,
      meterStop: 12_500,
      timestamp: new Date().toISOString(),
      idTag: FIXTURES.idTag,
      reason: 'Local',
    });
    expect(stop.idTagInfo?.status).toBe('Accepted');

    const [closed] = await sql`
      select status, energy_wh, meter_stop_wh, stop_reason, ended_at
      from public.charging_sessions where id = ${session.id}
    `;
    expect(closed.status).toBe('completed');
    // Energy comes from the register (12500 − 1000), not accumulated samples.
    expect(Number(closed.energy_wh)).toBe(11_500);
    expect(closed.stop_reason).toBe('Local');
    expect(closed.ended_at).not.toBeNull();

    await charger.close();
  });

  it('writes every frame in both directions to the log', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await charger.call('BootNotification', BOOT);
    await charger.call('Heartbeat', {});
    await charger.close();

    const frames = await waitFor(
      async () => {
        const rows = await sql`
          select direction, message_type, action from public.ocpp_messages
          where charge_point_id = ${FIXTURES.chargePointA}
          order by id
        `;
        return rows.length >= 4 ? rows : null;
      },
      { label: 'frames to be flushed' },
    );

    const inbound = frames.filter((f) => f.direction === 'in');
    const outbound = frames.filter((f) => f.direction === 'out');
    expect(inbound.map((f) => f.action)).toEqual(
      expect.arrayContaining(['BootNotification', 'Heartbeat']),
    );
    // Replies are labelled with the action they answer, via message-id
    // correlation — otherwise the log viewer shows unlabelled rows.
    expect(outbound.every((f) => f.message_type === 3)).toBe(true);
    expect(outbound.map((f) => f.action)).toEqual(
      expect.arrayContaining(['BootNotification', 'Heartbeat']),
    );
  });
});

describe('authorization outcomes', () => {
  it('refuses an unknown tag and creates no session', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await charger.call('BootNotification', BOOT);

    const auth = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: 'NOT-A-REAL-TAG',
    });
    expect(auth.idTagInfo.status).toBe('Invalid');

    const start = await charger.call<{ transactionId: number; idTagInfo: { status: string } }>(
      'StartTransaction',
      {
        connectorId: 1,
        idTag: 'NOT-A-REAL-TAG',
        meterStart: 0,
        timestamp: new Date().toISOString(),
      },
    );
    expect(start.idTagInfo.status).toBe('Invalid');
    expect(start.transactionId).toBe(0);

    const sessions = await sql`select id from public.charging_sessions`;
    expect(sessions).toHaveLength(0);

    await charger.close();
  });

  it('reports a blocked tag as Blocked, not Invalid', async () => {
    await sql`update public.id_tags set status = 'blocked' where tag = ${FIXTURES.idTag}`;
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);

    const auth = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: FIXTURES.idTag,
    });
    expect(auth.idTagInfo.status).toBe('Blocked');

    await charger.close();
  });

  it('reports an expired tag as Expired', async () => {
    await sql`update public.id_tags set expires_at = now() - interval '1 day' where tag = ${FIXTURES.idTag}`;
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);

    const auth = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: FIXTURES.idTag,
    });
    expect(auth.idTagInfo.status).toBe('Expired');

    await charger.close();
  });
});

describe('resilience', () => {
  it('flags a transaction replayed from the charger buffer as offline', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await charger.call('BootNotification', BOOT);

    // Timestamp well in the past: the charger buffered this while unreachable.
    const startedAt = new Date(Date.now() - 60 * 60 * 1000);
    const start = await charger.call<{ transactionId: number }>('StartTransaction', {
      connectorId: 1,
      idTag: FIXTURES.idTag,
      meterStart: 500,
      timestamp: startedAt.toISOString(),
    });

    const [session] = await sql`
      select offline, started_at from public.charging_sessions
      where ocpp_transaction_id = ${start.transactionId}
    `;
    expect(session.offline).toBe(true);
    // The historical timestamp is preserved, not replaced with receive time.
    expect(new Date(session.started_at).getTime()).toBeCloseTo(startedAt.getTime(), -3);

    await charger.close();
  });

  it('records a stop for an unknown transaction as orphaned rather than losing it', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await charger.call('BootNotification', BOOT);

    await charger.call('StopTransaction', {
      transactionId: 987_654,
      meterStop: 9_000,
      timestamp: new Date().toISOString(),
      reason: 'PowerLoss',
    });

    const [orphan] = await sql`
      select status, meter_stop_wh, offline from public.charging_sessions
      where ocpp_transaction_id = 987654
    `;
    expect(orphan.status).toBe('orphaned');
    expect(Number(orphan.meter_stop_wh)).toBe(9_000);

    await charger.close();
  });

  it('closes a session started before a gateway restart', async () => {
    const first = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await first.call('BootNotification', BOOT);
    const start = await first.call<{ transactionId: number }>('StartTransaction', {
      connectorId: 1,
      idTag: FIXTURES.idTag,
      meterStart: 2_000,
      timestamp: new Date().toISOString(),
    });
    await first.close();

    // Restart the gateway: session state lives in Postgres, not in the process.
    await gw.gateway.stop();
    gw = await startGateway();

    const second = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await second.call('BootNotification', BOOT);
    await second.call('StopTransaction', {
      transactionId: start.transactionId,
      meterStop: 8_000,
      timestamp: new Date().toISOString(),
      reason: 'Remote',
    });

    const [closed] = await sql`
      select status, energy_wh from public.charging_sessions
      where ocpp_transaction_id = ${start.transactionId}
    `;
    expect(closed.status).toBe('completed');
    expect(Number(closed.energy_wh)).toBe(6_000);

    await second.close();
  });

  it('marks the charger offline and its connectors Offline on disconnect', async () => {
    const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
    await charger.call('BootNotification', BOOT);
    await charger.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
    });
    await charger.close();

    const state = await waitFor(
      async () => {
        const [cp] = await sql`
          select connection_state from public.charge_points where id = ${FIXTURES.chargePointA}
        `;
        return cp.connection_state === 'offline' ? cp : null;
      },
      { label: 'charge point to go offline' },
    );
    expect(state.connection_state).toBe('offline');

    const [connector] = await sql`
      select status from public.connectors where charge_point_id = ${FIXTURES.chargePointA}
    `;
    expect(connector.status).toBe('Offline');

    const events = await sql`
      select event from public.charge_point_connection_log
      where charge_point_id = ${FIXTURES.chargePointA} order by id
    `;
    expect(events.map((e) => e.event)).toEqual(['connected', 'disconnected']);
  });
});
