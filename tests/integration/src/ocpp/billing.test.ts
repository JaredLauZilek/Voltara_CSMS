// Phase 3 — the gateway prices sessions. Tariff frozen at StartTransaction,
// CDR written in the same transaction as the close, idle tracked from status
// notifications, webhooks signed and delivered.

import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '@voltara/ocpp-gateway/webhooks';
import {
  closeHarness,
  connectCharger,
  FIXTURES,
  resetChargerState,
  sql,
  startGateway,
  waitFor,
  type RunningGateway,
  type ScriptedCharger,
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

const BOOT = { chargePointVendor: 'Solidstudio', chargePointModel: 'Virtual Charge Point' };
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

async function bootedCharger(): Promise<ScriptedCharger> {
  const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
  await charger.call('BootNotification', BOOT);
  return charger;
}

/** Start → (optional status) → stop, returning the CDR the gateway wrote. */
async function runSession(
  charger: ScriptedCharger,
  opts: {
    meterStart?: number;
    meterStop?: number;
    startedAgoMs?: number;
    finishingAgoMs?: number | null;
  } = {},
) {
  const meterStart = opts.meterStart ?? 1_000;
  const meterStop = opts.meterStop ?? 8_400; // 7.4 kWh
  const start = await charger.call<{ transactionId: number; idTagInfo: { status: string } }>(
    'StartTransaction',
    { connectorId: 1, idTag: FIXTURES.idTag, meterStart, timestamp: iso(opts.startedAgoMs ?? 0) },
  );
  expect(start.idTagInfo.status).toBe('Accepted');
  await charger.call('StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Charging',
    timestamp: iso(opts.startedAgoMs ?? 0),
  });
  if (opts.finishingAgoMs != null) {
    await charger.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Finishing',
      timestamp: iso(opts.finishingAgoMs),
    });
  }
  await charger.call('StopTransaction', {
    transactionId: start.transactionId,
    meterStop,
    timestamp: iso(0),
    reason: 'Local',
  });
  const cdr = await waitFor(
    async () => {
      const [row] = await sql`
        select c.*, s.idle_seconds, s.amount_gross, s.amount_tax, s.tariff_version_id as session_version
        from public.cdrs c join public.charging_sessions s on s.id = c.charging_session_id
        where s.ocpp_transaction_id = ${start.transactionId}
      `;
      return row ?? null;
    },
    { label: 'CDR' },
  );
  return { cdr, transactionId: start.transactionId };
}

describe('pricing at StopTransaction', () => {
  it('writes a billable CDR from the frozen tariff: 7.4 kWh at RM 1.20 = RM 8.88', async () => {
    const charger = await bootedCharger();
    const { cdr } = await runSession(charger);

    expect(cdr.billable).toBe(true);
    expect(Number(cdr.total_energy_wh)).toBe(7_400);
    expect(Number(cdr.total_energy_cost_sen)).toBe(888);
    expect(Number(cdr.total_sen)).toBe(888);
    expect(Number(cdr.tax_sen)).toBe(0);
    expect(cdr.tariff_version_id).toBe(FIXTURES.tariffVersionA);
    expect(cdr.tariff_id).toBe(FIXTURES.tariffA);
    expect(cdr.ocpp_identity).toBe(FIXTURES.identityA);
    expect(cdr.id_tag).toBe(FIXTURES.idTag);
    expect((cdr.tariff_snapshot as { name: string }).name).toBe('Standard');
    expect((cdr.lines as unknown[]).length).toBe(1);
    // Stamped back on the session for list views.
    expect(Number(cdr.amount_gross)).toBeCloseTo(8.88, 2);
    expect(cdr.session_version).toBe(FIXTURES.tariffVersionA);

    await charger.close();
  });

  it('keeps the price of a running session when the tariff changes mid-session', async () => {
    const charger = await bootedCharger();
    const start = await charger.call<{ transactionId: number }>('StartTransaction', {
      connectorId: 1,
      idTag: FIXTURES.idTag,
      meterStart: 0,
      timestamp: iso(0),
    });
    // Operator publishes version 2 at RM 2.00/kWh while the car is charging.
    await sql`
      insert into public.tariff_versions (tenant_id, tariff_id, version, elements, tax_included, tax_profile_id)
      values (${FIXTURES.tenantA}, ${FIXTURES.tariffA}, 2,
              ${sql.json([{ price_components: [{ type: 'ENERGY', price_sen: 200, step_size: 1 }] }] as never)},
              true, ${FIXTURES.taxProfileA})
    `;
    await charger.call('StopTransaction', {
      transactionId: start.transactionId,
      meterStop: 10_000,
      timestamp: iso(0),
    });

    const cdr = await waitFor(async () => (await sql`select * from public.cdrs`)[0] ?? null, {
      label: 'CDR',
    });
    expect(Number(cdr.total_sen)).toBe(1200); // 10 kWh at the FROZEN RM 1.20, not RM 2.00
    expect(cdr.tariff_version_id).toBe(FIXTURES.tariffVersionA);

    // A session started AFTER the edit sees version 2.
    const next = await runSession(charger, { meterStart: 0, meterStop: 10_000 });
    expect(Number(next.cdr.total_sen)).toBe(2000);
    expect(next.cdr.tariff_version_id).not.toBe(FIXTURES.tariffVersionA);

    await charger.close();
  });

  it('prices a whitelisted driver by their group tariff and attributes the payer', async () => {
    const [account] = await sql`
      insert into public.billing_accounts (tenant_id, kind, name) values (${FIXTURES.tenantA}, 'individual', 'Resident 12-3') returning id
    `;
    await sql`update public.id_tags set billing_account_id = ${account.id} where tag = ${FIXTURES.idTag}`;
    const [group] = await sql`
      insert into public.driver_groups (tenant_id, name, kind) values (${FIXTURES.tenantA}, 'Residents', 'residents') returning id
    `;
    await sql`
      insert into public.driver_group_members (tenant_id, driver_group_id, id_tag_id)
      select ${FIXTURES.tenantA}, ${group.id}, id from public.id_tags where tag = ${FIXTURES.idTag}
    `;
    const [tariff] = await sql`
      insert into public.tariffs (tenant_id, name) values (${FIXTURES.tenantA}, 'Resident rate') returning id
    `;
    await sql`
      insert into public.tariff_versions (tenant_id, tariff_id, version, elements, tax_included, tax_profile_id)
      values (${FIXTURES.tenantA}, ${tariff.id}, 1,
              ${sql.json([{ price_components: [{ type: 'ENERGY', price_sen: 80, step_size: 1 }] }] as never)},
              true, ${FIXTURES.taxProfileA})
    `;
    // Same scope (tenant) as the seeded 'all' assignment: audience 'group' wins.
    await sql`
      insert into public.tariff_assignments (tenant_id, tariff_id, scope_type, audience, driver_group_id)
      values (${FIXTURES.tenantA}, ${tariff.id}, 'tenant', 'group', ${group.id})
    `;

    const charger = await bootedCharger();
    const { cdr } = await runSession(charger, { meterStart: 0, meterStop: 10_000 });
    expect(Number(cdr.total_sen)).toBe(800);
    expect(cdr.driver_group_id).toBe(group.id);
    expect(cdr.billing_account_id).toBe(account.id);
    expect(
      (cdr.tariff_snapshot as { resolved_by: { audience: string } }).resolved_by.audience,
    ).toBe('group');

    await charger.close();
  });

  it('a charge-point-scoped assignment beats the tenant default', async () => {
    const [tariff] = await sql`
      insert into public.tariffs (tenant_id, name) values (${FIXTURES.tenantA}, 'HQ special') returning id
    `;
    await sql`
      insert into public.tariff_versions (tenant_id, tariff_id, version, elements, tax_included, tax_profile_id)
      values (${FIXTURES.tenantA}, ${tariff.id}, 1,
              ${sql.json([{ price_components: [{ type: 'ENERGY', price_sen: 50, step_size: 1 }] }] as never)},
              true, ${FIXTURES.taxProfileA})
    `;
    await sql`
      insert into public.tariff_assignments (tenant_id, tariff_id, scope_type, audience, charge_point_id)
      values (${FIXTURES.tenantA}, ${tariff.id}, 'charge_point', 'all', ${FIXTURES.chargePointA})
    `;
    const charger = await bootedCharger();
    const { cdr } = await runSession(charger, { meterStart: 0, meterStop: 10_000 });
    expect(Number(cdr.total_sen)).toBe(500);
    expect(
      (cdr.tariff_snapshot as { resolved_by: { scope_type: string } }).resolved_by.scope_type,
    ).toBe('charge_point');
    await charger.close();
  });

  it('bills idle time beyond the grace period from the Finishing status timestamp', async () => {
    // Tariff with no grace so a short test session shows idle cost: RM 1/min, 60 s steps.
    const [tariff] = await sql`
      insert into public.tariffs (tenant_id, name) values (${FIXTURES.tenantA}, 'Idle test') returning id
    `;
    await sql`
      insert into public.tariff_versions (tenant_id, tariff_id, version, elements, tax_included, tax_profile_id)
      values (${FIXTURES.tenantA}, ${tariff.id}, 1, ${sql.json([
        { price_components: [{ type: 'ENERGY', price_sen: 100, step_size: 1 }] },
        {
          price_components: [{ type: 'PARKING_TIME', price_sen: 6000, step_size: 60 }],
          restrictions: { grace_period_s: 0 },
        },
      ] as never)}, true, ${FIXTURES.taxProfileA})
    `;
    await sql`
      insert into public.tariff_assignments (tenant_id, tariff_id, scope_type, audience, charge_point_id, priority)
      values (${FIXTURES.tenantA}, ${tariff.id}, 'charge_point', 'all', ${FIXTURES.chargePointA}, 10)
    `;
    const charger = await bootedCharger();
    // Started 90 s ago, stopped charging 40 s ago, unplugged now → 40 s idle → 1 billable minute.
    const { cdr } = await runSession(charger, {
      meterStart: 0,
      meterStop: 2_000,
      startedAgoMs: 90_000,
      finishingAgoMs: 40_000,
    });
    expect(Number(cdr.idle_seconds)).toBeGreaterThanOrEqual(39);
    expect(Number(cdr.idle_seconds)).toBeLessThanOrEqual(42);
    expect(Number(cdr.total_parking_cost_sen)).toBe(100);
    expect(Number(cdr.total_energy_cost_sen)).toBe(200);
    expect(Number(cdr.total_sen)).toBe(300);
    await charger.close();
  });

  it('records an unbillable CDR when no tariff applies, and still closes the session', async () => {
    await sql`delete from public.tariff_assignments where id = ${FIXTURES.assignmentA}`;
    try {
      const charger = await bootedCharger();
      const { cdr } = await runSession(charger);
      expect(cdr.billable).toBe(false);
      expect(cdr.unbillable_reason).toBe('no_tariff');
      expect(Number(cdr.total_sen)).toBe(0);
      expect(Number(cdr.total_energy_wh)).toBe(7_400);
      expect(cdr.amount_gross).toBeNull();
      await charger.close();
    } finally {
      await sql`
        insert into public.tariff_assignments (id, tenant_id, tariff_id, scope_type, audience, priority)
        values (${FIXTURES.assignmentA}, ${FIXTURES.tenantA}, ${FIXTURES.tariffA}, 'tenant', 'all', 0)
        on conflict (id) do nothing
      `;
    }
  });

  it('flags an orphaned stop as unbillable rather than pricing energy it cannot attribute', async () => {
    const charger = await bootedCharger();
    await charger.call('StopTransaction', {
      transactionId: 987_654,
      meterStop: 5_000,
      timestamp: iso(0),
    });
    const cdr = await waitFor(
      async () =>
        (await sql`select * from public.cdrs where unbillable_reason = 'orphaned_no_start'`)[0] ??
        null,
      { label: 'orphan CDR' },
    );
    expect(cdr.billable).toBe(false);
    expect(Number(cdr.total_sen)).toBe(0);
    await charger.close();
  });

  it('CDRs land in the same transaction as the session close', async () => {
    const charger = await bootedCharger();
    const { transactionId } = await runSession(charger);
    const [row] = await sql`
      select s.status, s.ended_at, c.id as cdr_id
      from public.charging_sessions s left join public.cdrs c on c.charging_session_id = s.id
      where s.ocpp_transaction_id = ${transactionId}
    `;
    expect(row.status).toBe('completed');
    expect(row.ended_at).not.toBeNull();
    expect(row.cdr_id).not.toBeNull();
    await charger.close();
  });
});

describe('webhooks', () => {
  let server: Server;
  let received: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
  let port = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ body, headers: req.headers });
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('delivers a signed session.completed event and records the delivery', async () => {
    received = [];
    const secret = 'whsec_test_' + Math.random().toString(36).slice(2);
    const [hook] = await sql`
      insert into public.webhooks (tenant_id, url, secret, events)
      values (${FIXTURES.tenantA}, ${`http://127.0.0.1:${port}/hook`}, ${secret}, '{session.completed}') returning id
    `;
    const charger = await bootedCharger();
    const { cdr } = await runSession(charger);

    await waitFor(async () => (received.length > 0 ? true : null), { label: 'webhook POST' });
    const [hit] = received;
    expect(hit.headers['x-voltara-event']).toBe('session.completed');
    expect(
      verifyWebhookSignature(secret, hit.body, String(hit.headers['x-voltara-signature'])),
    ).toBe(true);
    const payload = JSON.parse(hit.body) as Record<string, unknown>;
    expect(payload.event).toBe('session.completed');
    expect(payload.cdrId).toBe(cdr.id);
    expect(payload.totalSen).toBe(888);

    const delivery = await waitFor(
      async () => {
        const [d] =
          await sql`select status, attempts, last_status_code from public.webhook_deliveries where webhook_id = ${hook.id}`;
        return d && d.status === 'delivered' ? d : null;
      },
      { label: 'delivery row' },
    );
    expect(delivery.attempts).toBe(1);
    expect(delivery.last_status_code).toBe(200);
    await charger.close();
  });

  it('a tenant B session never reaches a tenant A endpoint', async () => {
    received = [];
    await sql`
      insert into public.webhooks (tenant_id, url, secret, events)
      values (${FIXTURES.tenantA}, ${`http://127.0.0.1:${port}/hook`}, 'secret-a', '{session.completed}')
    `;
    const chargerB = await connectCharger(gw.port, FIXTURES.identityB, FIXTURES.keyB);
    await chargerB.call('BootNotification', BOOT);
    // Tenant B has no id_tags; the quirk-free path refuses an unknown tag, so
    // seed one for B just for this test.
    await sql`insert into public.id_tags (tenant_id, tag, label) values (${FIXTURES.tenantB}, 'B-TAG-1', 'B test') on conflict do nothing`;
    const start = await chargerB.call<{ transactionId: number }>('StartTransaction', {
      connectorId: 1,
      idTag: 'B-TAG-1',
      meterStart: 0,
      timestamp: iso(0),
    });
    await chargerB.call('StopTransaction', {
      transactionId: start.transactionId,
      meterStop: 1_000,
      timestamp: iso(0),
    });
    await waitFor(
      async () =>
        (await sql`select 1 from public.cdrs where tenant_id = ${FIXTURES.tenantB}`)[0] ?? null,
      { label: 'B CDR' },
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toHaveLength(0);
    await sql`delete from public.id_tags where tag = 'B-TAG-1'`;
    await chargerB.close();
  });
});
