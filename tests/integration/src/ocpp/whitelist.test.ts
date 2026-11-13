// Charging management — whitelists at the charger. A whitelist covers named
// sites: its members get a discount on the energy price there, and a private
// site admits nobody else.

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

afterEach(async () => {
  await sql`delete from public.id_tags where tag = 'VLT-TAG-OUTSIDER'`;
  await resetChargerState();
});

const BOOT = { chargePointVendor: 'Solidstudio', chargePointModel: 'Virtual Charge Point' };
// Charge point A's site (supabase/seed.sql).
const SITE = '33333333-3333-4333-8333-333333333331';
const OTHER_SITE = '33333333-3333-4333-8333-333333333332';
const now = () => new Date().toISOString();

async function bootedCharger(): Promise<ScriptedCharger> {
  const charger = await connectCharger(gw.port, FIXTURES.identityA, FIXTURES.keyA);
  await charger.call('BootNotification', BOOT);
  return charger;
}

/** A whitelist covering `site`, with the fixture tag as its only member. */
async function whitelist(discountBps: number, site: string = SITE): Promise<string> {
  const [group] = await sql<{ id: string }[]>`
    insert into public.driver_groups (tenant_id, name, discount_bps)
    values (${FIXTURES.tenantA}, ${'Whitelist ' + discountBps + ' ' + site.slice(-1)}, ${discountBps})
    returning id
  `;
  await sql`
    insert into public.driver_group_locations (tenant_id, driver_group_id, location_id)
    values (${FIXTURES.tenantA}, ${group.id}, ${site})
  `;
  await sql`
    insert into public.driver_group_members (tenant_id, driver_group_id, id_tag_id)
    select ${FIXTURES.tenantA}, ${group.id}, id from public.id_tags
    where tenant_id = ${FIXTURES.tenantA} and tag = ${FIXTURES.idTag}
  `;
  return group.id;
}

/** 7.4 kWh on the standard RM 1.20/kWh tariff; returns the CDR. */
async function chargeSession(charger: ScriptedCharger, idTag: string = FIXTURES.idTag) {
  const start = await charger.call<{ transactionId: number; idTagInfo: { status: string } }>(
    'StartTransaction',
    { connectorId: 1, idTag, meterStart: 1_000, timestamp: now() },
  );
  expect(start.idTagInfo.status).toBe('Accepted');
  await charger.call('StopTransaction', {
    transactionId: start.transactionId,
    meterStop: 8_400,
    timestamp: now(),
    reason: 'Local',
  });
  return waitFor(
    async () => {
      const [row] = await sql`
        select c.* from public.cdrs c
        join public.charging_sessions s on s.id = c.charging_session_id
        where s.ocpp_transaction_id = ${start.transactionId}
      `;
      return row ?? null;
    },
    { label: 'CDR' },
  );
}

describe('whitelist discount on the energy price', () => {
  it('takes 25% off the energy price for a member at a covered site', async () => {
    const groupId = await whitelist(2_500);
    const charger = await bootedCharger();
    const cdr = await chargeSession(charger);

    // 7.4 kWh at RM 0.90 instead of RM 1.20.
    expect(Number(cdr.total_energy_cost_sen)).toBe(666);
    expect(Number(cdr.total_sen)).toBe(666);
    expect(cdr.driver_group_id).toBe(groupId);
    const snapshot = cdr.tariff_snapshot as {
      resolved_by: { discount_bps: number; discount_group_id: string };
    };
    expect(snapshot.resolved_by.discount_bps).toBe(2_500);
    expect(snapshot.resolved_by.discount_group_id).toBe(groupId);

    await charger.close();
  });

  it('charges nothing for energy at 100%', async () => {
    await whitelist(10_000);
    const charger = await bootedCharger();
    const cdr = await chargeSession(charger);

    expect(Number(cdr.total_energy_wh)).toBe(7_400);
    expect(Number(cdr.total_energy_cost_sen)).toBe(0);
    expect(Number(cdr.total_sen)).toBe(0);

    await charger.close();
  });

  it('gives no discount at a site the whitelist does not cover', async () => {
    await whitelist(2_500, OTHER_SITE);
    const charger = await bootedCharger();
    const cdr = await chargeSession(charger);

    expect(Number(cdr.total_sen)).toBe(888);
    expect(cdr.driver_group_id).toBeNull();

    await charger.close();
  });

  it('uses the best discount when two whitelists cover the site', async () => {
    await whitelist(1_000);
    await whitelist(5_000);
    const charger = await bootedCharger();
    const cdr = await chargeSession(charger);

    expect(Number(cdr.total_sen)).toBe(444);

    await charger.close();
  });
});

describe('private sites', () => {
  it('admits a whitelisted tag and refuses everyone else', async () => {
    await sql`update public.locations set is_private = true where id = ${SITE}`;
    await sql`
      insert into public.id_tags (tenant_id, tag, label, kind)
      values (${FIXTURES.tenantA}, 'VLT-TAG-OUTSIDER', 'Not on the whitelist', 'rfid')
    `;
    await whitelist(0);
    const charger = await bootedCharger();

    const member = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: FIXTURES.idTag,
    });
    expect(member.idTagInfo.status).toBe('Accepted');

    // A valid tag of this operator, but not on a whitelist covering the site.
    const outsider = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: 'VLT-TAG-OUTSIDER',
    });
    expect(outsider.idTagInfo.status).toBe('Blocked');

    // A charger that starts anyway (offline list, firmware that skips
    // Authorize) is refused at StartTransaction and gets no session.
    const start = await charger.call<{ transactionId: number; idTagInfo: { status: string } }>(
      'StartTransaction',
      { connectorId: 1, idTag: 'VLT-TAG-OUTSIDER', meterStart: 0, timestamp: now() },
    );
    expect(start.idTagInfo.status).toBe('Blocked');
    expect(start.transactionId).toBe(0);
    const sessions = await sql`select 1 from public.charging_sessions`;
    expect(sessions.length).toBe(0);

    await charger.close();
  });

  it('refuses a tag whose whitelist covers a different site', async () => {
    await sql`update public.locations set is_private = true where id = ${SITE}`;
    await whitelist(0, OTHER_SITE);
    const charger = await bootedCharger();

    const res = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: FIXTURES.idTag,
    });
    expect(res.idTagInfo.status).toBe('Blocked');

    await charger.close();
  });

  it('leaves a public site open to tags that are on no whitelist', async () => {
    const charger = await bootedCharger();
    const res = await charger.call<{ idTagInfo: { status: string } }>('Authorize', {
      idTag: FIXTURES.idTag,
    });
    expect(res.idTagInfo.status).toBe('Accepted');
    await charger.close();
  });
});
