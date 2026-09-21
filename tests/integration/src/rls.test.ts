// Two-tenant RLS isolation suite — the Phase 0 acceptance gate.
//
// Runs against the LOCAL Supabase stack (`supabase start` + `supabase db reset`
// must have been run; the seed provides both tenants and fixed UUIDs).
//
// Technique: instead of minting real JWTs through GoTrue, each test opens a
// transaction, switches to the `authenticated`/`anon` Postgres role, and sets
// `request.jwt.claims` — exactly what PostgREST does per request, and what
// auth.jwt() reads. Every transaction is rolled back, so tests are hermetic.

import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

const TENANT_A = '11111111-1111-4111-8111-111111111111'; // Voltara (2 seeded locations)
const TENANT_B = '22222222-2222-4222-8222-222222222222'; // Demo CPO (1 seeded location)
const USER_A = '99999999-9999-4999-8999-999999999991';
const USER_B = '99999999-9999-4999-8999-999999999992';

type Tx = postgres.TransactionSql;

interface Persona {
  role: 'authenticated' | 'anon';
  claims?: Record<string, unknown>;
}

const personaA = (tenantRole = 'owner'): Persona => ({
  role: 'authenticated',
  claims: {
    sub: USER_A,
    role: 'authenticated',
    app_metadata: { tenant_id: TENANT_A, tenant_role: tenantRole, platform_admin: true },
  },
});

const personaB: Persona = {
  role: 'authenticated',
  claims: {
    sub: USER_B,
    role: 'authenticated',
    app_metadata: { tenant_id: TENANT_B, tenant_role: 'owner' },
  },
};

/** Sentinel used to always roll the test transaction back. */
class Rollback extends Error {}

/** Run `fn` inside a rolled-back transaction under the given persona. */
async function as<T>(persona: Persona, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${persona.role}`);
      if (persona.claims) {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify(persona.claims)}, true)`;
      }
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result as T;
}

afterAll(async () => {
  await sql.end();
});

describe('cross-tenant isolation on locations', () => {
  it('tenant A sees only its own locations', async () => {
    const rows = await as(personaA(), (tx) => tx`select tenant_id from public.locations`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it('tenant B sees only its own locations', async () => {
    const rows = await as(personaB, (tx) => tx`select tenant_id from public.locations`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === TENANT_B)).toBe(true);
  });

  it('anon has no table access at all (grant-level denial)', async () => {
    await expect(as({ role: 'anon' }, (tx) => tx`select id from public.locations`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('tenant A admin can insert into its own tenant', async () => {
    const rows = await as(
      personaA('admin'),
      (tx) =>
        tx`insert into public.locations (tenant_id, name, site_type)
         values (${TENANT_A}, 'RLS test site', 'public') returning id`,
    );
    expect(rows.length).toBe(1);
  });

  it('tenant A CANNOT insert a row stamped with tenant B', async () => {
    await expect(
      as(
        personaA('owner'),
        (tx) =>
          tx`insert into public.locations (tenant_id, name, site_type)
           values (${TENANT_B}, 'smuggled', 'public') returning id`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a viewer cannot insert even into their own tenant', async () => {
    await expect(
      as(
        personaA('viewer'),
        (tx) =>
          tx`insert into public.locations (tenant_id, name, site_type)
           values (${TENANT_A}, 'viewer write', 'public') returning id`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("tenant A's updates cannot touch tenant B rows (0 rows affected)", async () => {
    const rows = await as(
      personaA('owner'),
      (tx) =>
        tx`update public.locations set name = 'hijacked' where tenant_id = ${TENANT_B} returning id`,
    );
    expect(rows.length).toBe(0);
  });
});

describe('cross-tenant isolation on charge_points and id_tags', () => {
  it('tenant B sees only its own charge points', async () => {
    const rows = await as(
      personaB,
      (tx) => tx`select tenant_id, ocpp_identity from public.charge_points`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === TENANT_B)).toBe(true);
    // Tenant A's chargers exist in the same table and must stay invisible.
    expect(rows.some((r) => r.ocpp_identity === 'VCP-DEMO-001')).toBe(false);
  });

  it('tenant B cannot see tenant A id tags', async () => {
    const rows = await as(personaB, (tx) => tx`select id from public.id_tags`);
    expect(rows.length).toBe(0);
  });

  it('ocpp_identity is globally unique across tenants', async () => {
    await expect(
      as(
        personaB,
        (tx) =>
          tx`insert into public.charge_points (tenant_id, ocpp_identity, name)
           values (${TENANT_B}, 'VCP-DEMO-001', 'dupe') returning id`,
      ),
    ).rejects.toThrow(/duplicate key|unique/);
  });
});

describe('issues (operator-writable ticket table)', () => {
  const CP_A = '66666666-6666-4666-8666-666666666661';

  it('an operator can raise an issue on their own tenant', async () => {
    const rows = await as(personaA('operator'), async (tx) => {
      return tx`
        insert into public.issues (tenant_id, charge_point_id, title, opened_by)
        values (${TENANT_A}, ${CP_A}, 'Connector stuck', ${USER_A})
        returning id, status, severity
      `;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('open');
  });

  it('a viewer cannot raise an issue', async () => {
    await expect(
      as(personaA('viewer'), async (tx) => {
        await tx`
          insert into public.issues (tenant_id, title, opened_by)
          values (${TENANT_A}, 'Nope', ${USER_A})
        `;
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it('opened_by must be the caller', async () => {
    await expect(
      as(personaA('admin'), async (tx) => {
        await tx`
          insert into public.issues (tenant_id, title, opened_by)
          values (${TENANT_A}, 'Forged', ${USER_B})
        `;
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it('tenant B never sees tenant A issues, and cannot touch them', async () => {
    // Seed one as the owner (a real insert, rolled back with the test).
    await as(personaA(), async (tx) => {
      await tx`
        insert into public.issues (tenant_id, title, opened_by)
        values (${TENANT_A}, 'Private to A', ${USER_A})
      `;
      const seen = await tx`select id from public.issues where title = 'Private to A'`;
      expect(seen).toHaveLength(1);
    });
    const seenByB = await as(
      personaB,
      (tx) => tx`select id from public.issues where title = 'Private to A'`,
    );
    expect(seenByB).toHaveLength(0);
  });

  it('only admins may delete', async () => {
    const deletedByOperator = await as(personaA('operator'), async (tx) => {
      await tx.unsafe('set local role postgres');
      await tx`insert into public.issues (tenant_id, title, opened_by) values (${TENANT_A}, 'To delete', ${USER_A})`;
      await tx.unsafe('set local role authenticated');
      return tx`delete from public.issues where title = 'To delete' returning id`;
    });
    expect(deletedByOperator).toHaveLength(0);
  });
});

describe('team management RPCs', () => {
  it('list_team_members returns only the caller tenant, with emails', async () => {
    const rows = await as(personaA(), (tx) => tx`select * from public.list_team_members()`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => typeof r.email === 'string')).toBe(true);
    expect(rows.some((r) => r.user_id === USER_B)).toBe(false);
  });

  it('nobody can change their own role', async () => {
    await expect(
      as(personaA(), (tx) => tx`select public.set_team_member_role(${USER_A}::uuid, 'viewer')`),
    ).rejects.toThrow(/own role/);
  });

  it('a viewer cannot manage the team at all', async () => {
    await expect(
      as(personaA('viewer'), (tx) => tx`select public.remove_team_member(${USER_B}::uuid)`),
    ).rejects.toThrow(/Only owners and admins/);
  });

  it('an admin cannot act on a member of another tenant', async () => {
    // USER_B belongs to tenant B; from tenant A they simply do not exist.
    await expect(
      as(
        personaA('admin'),
        (tx) => tx`select public.set_team_member_role(${USER_B}::uuid, 'viewer')`,
      ),
    ).rejects.toThrow(/not a member/);
  });

  it('the last owner cannot be removed', async () => {
    // Tenant A has one seeded owner (USER_A). An extra admin trying to remove
    // them must be refused on the owner rule before anything else.
    const ADMIN_A = '99999999-9999-4999-8999-999999999993';
    await expect(
      as(
        {
          role: 'authenticated',
          claims: {
            sub: ADMIN_A,
            role: 'authenticated',
            app_metadata: { tenant_id: TENANT_A, tenant_role: 'admin' },
          },
        },
        (tx) => tx`select public.remove_team_member(${USER_A}::uuid)`,
      ),
    ).rejects.toThrow(/owner/);
  });
});

describe('uptime', () => {
  it('charge_point_uptime is scoped by RLS to the caller tenant', async () => {
    const rows = await as(personaB, async (tx) => {
      await tx.unsafe('set local role postgres');
      await tx`
        insert into public.charge_point_connection_log (tenant_id, charge_point_id, event, recorded_at)
        values (${TENANT_A}, '66666666-6666-4666-8666-666666666661', 'connected', now() - interval '2 hours'),
               (${TENANT_A}, '66666666-6666-4666-8666-666666666661', 'disconnected', now() - interval '1 hour')
      `;
      await tx.unsafe('set local role authenticated');
      return tx`select * from public.charge_point_uptime(interval '1 day')`;
    });
    // Tenant A's charger must be invisible; tenant B may legitimately have its
    // own rows if the OCPP suite is connecting VCP-DEMO-002 at the same time.
    expect(rows.some((r) => r.charge_point_id === '66666666-6666-4666-8666-666666666661')).toBe(
      false,
    );
  });

  it('computes the online share of the window', async () => {
    const rows = await as(personaA(), async (tx) => {
      await tx.unsafe('set local role postgres');
      await tx`
        insert into public.charge_point_connection_log (tenant_id, charge_point_id, event, recorded_at)
        values (${TENANT_A}, '66666666-6666-4666-8666-666666666661', 'connected', now() - interval '4 hours'),
               (${TENANT_A}, '66666666-6666-4666-8666-666666666661', 'disconnected', now() - interval '1 hour')
      `;
      await tx.unsafe('set local role authenticated');
      return tx`select * from public.charge_point_uptime(interval '1 day')`;
    });
    // Window starts at the first connection (4h ago); online for 3 of those 4 hours.
    const row = rows.find((r) => r.charge_point_id === '66666666-6666-4666-8666-666666666661');
    expect(row).toBeDefined();
    expect(Number(row!.uptime_pct)).toBeCloseTo(75, 0);
  });
});

describe('billing core (Phase 3)', () => {
  const ELEMENTS = [{ price_components: [{ type: 'ENERGY', price_sen: 120, step_size: 1 }] }];

  it('an admin can create a tariff and its first version; a viewer cannot', async () => {
    const created = await as(personaA('admin'), async (tx) => {
      const [t] =
        await tx`insert into public.tariffs (tenant_id, name) values (${TENANT_A}, 'RLS test tariff') returning id`;
      const [v] = await tx`
        insert into public.tariff_versions (tenant_id, tariff_id, version, elements, created_by)
        values (${TENANT_A}, ${t.id}, public.next_tariff_version(${t.id}::uuid), ${tx.json(ELEMENTS as never)}, ${USER_A})
        returning version
      `;
      return v.version;
    });
    expect(created).toBe(1);
    await expect(
      as(
        personaA('viewer'),
        (tx) => tx`insert into public.tariffs (tenant_id, name) values (${TENANT_A}, 'Nope')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('tariff versions are immutable even for the table owner', async () => {
    await expect(
      as(personaA(), async (tx) => {
        const [t] =
          await tx`insert into public.tariffs (tenant_id, name) values (${TENANT_A}, 'Immutable') returning id`;
        const [v] = await tx`
          insert into public.tariff_versions (tenant_id, tariff_id, version, elements, created_by)
          values (${TENANT_A}, ${t.id}, 1, ${tx.json(ELEMENTS as never)}, ${USER_A}) returning id
        `;
        await tx.unsafe('set local role postgres');
        await tx`update public.tariff_versions set display_text = 'edited' where id = ${v.id}`;
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('tenant B cannot see tenant A tariffs, groups or billing accounts', async () => {
    await as(personaA(), async (tx) => {
      await tx`insert into public.tariffs (tenant_id, name) values (${TENANT_A}, 'Private')`;
      await tx`insert into public.driver_groups (tenant_id, name) values (${TENANT_A}, 'Residents')`;
      await tx`insert into public.billing_accounts (tenant_id, name) values (${TENANT_A}, 'JMB Vantage')`;
      const mine = await tx`select count(*)::int as n from public.tariffs where name = 'Private'`;
      expect(mine[0].n).toBe(1);
    });
    const theirs = await as(personaB, async (tx) => ({
      tariffs: await tx`select 1 from public.tariffs where name = 'Private'`,
      groups: await tx`select 1 from public.driver_groups where name = 'Residents'`,
      accounts: await tx`select 1 from public.billing_accounts where name = 'JMB Vantage'`,
    }));
    expect(theirs.tariffs).toHaveLength(0);
    expect(theirs.groups).toHaveLength(0);
    expect(theirs.accounts).toHaveLength(0);
  });

  it('CDRs are select-only for tenant users and immutable except the invoice link', async () => {
    const cdrId = await as(personaA(), async (tx) => {
      await tx.unsafe('set local role postgres');
      const [c] = await tx`
        insert into public.cdrs (tenant_id, start_at, end_at, total_energy_wh, subtotal_sen, total_sen)
        values (${TENANT_A}, now() - interval '1 hour', now(), 5000, 600, 600) returning id
      `;
      await tx.unsafe('set local role authenticated');
      // A signed-in admin cannot insert a CDR — only the gateway writes them.
      await expect(
        tx`insert into public.cdrs (tenant_id, start_at, end_at) values (${TENANT_A}, now(), now())`,
      ).rejects.toThrow(/row-level security/);
      return c.id as string;
    });
    expect(cdrId).toBeTruthy();

    await expect(
      as(personaA(), async (tx) => {
        await tx.unsafe('set local role postgres');
        const [c] = await tx`
          insert into public.cdrs (tenant_id, start_at, end_at, total_sen) values (${TENANT_A}, now(), now(), 100) returning id
        `;
        await tx`update public.cdrs set total_sen = 1 where id = ${c.id}`;
      }),
    ).rejects.toThrow(/immutable/);

    await expect(
      as(personaA(), async (tx) => {
        await tx.unsafe('set local role postgres');
        const [c] = await tx`
          insert into public.cdrs (tenant_id, start_at, end_at, total_sen) values (${TENANT_A}, now(), now(), 100) returning id
        `;
        await tx`delete from public.cdrs where id = ${c.id}`;
      }),
    ).rejects.toThrow(/credit CDR/);
  });

  it('document numbers are per tenant, per kind, per month, and gap-free', async () => {
    const numbers = await as(personaA(), async (tx) => [
      (
        await tx`select public.next_document_number('invoice', '2026-09-21T10:00:00+08'::timestamptz) as n`
      )[0].n,
      (
        await tx`select public.next_document_number('invoice', '2026-09-21T10:00:00+08'::timestamptz) as n`
      )[0].n,
      (
        await tx`select public.next_document_number('receipt', '2026-09-21T10:00:00+08'::timestamptz) as n`
      )[0].n,
    ]);
    expect(numbers).toEqual(['INV-202609-0001', 'INV-202609-0002', 'R-202609-0001']);
    const other = await as(
      personaB,
      (tx) =>
        tx`select public.next_document_number('invoice', '2026-09-21T10:00:00+08'::timestamptz) as n`,
    );
    expect(other[0].n).toBe('INV-202609-0001');
  });

  it('an issued document is frozen; a draft is editable', async () => {
    await expect(
      as(personaA('admin'), async (tx) => {
        const [d] = await tx`
          insert into public.documents (tenant_id, kind, number, status, total_sen, created_by, issued_at)
          values (${TENANT_A}, 'invoice', 'INV-TEST-0001', 'issued', 1000, ${USER_A}, now()) returning id
        `;
        await tx`update public.documents set total_sen = 999 where id = ${d.id}`;
      }),
    ).rejects.toThrow(/immutable/);
    const ok = await as(personaA('admin'), async (tx) => {
      const [d] = await tx`
        insert into public.documents (tenant_id, kind, number, status, total_sen, created_by)
        values (${TENANT_A}, 'invoice', 'INV-TEST-0002', 'draft', 1000, ${USER_A}) returning id
      `;
      return tx`update public.documents set total_sen = 999, status = 'issued', issued_at = now() where id = ${d.id} returning total_sen`;
    });
    expect(Number(ok[0].total_sen)).toBe(999);
  });

  it('assignment shape is enforced: a group audience needs a group, a location scope needs a location', async () => {
    await expect(
      as(personaA('admin'), async (tx) => {
        const [t] =
          await tx`insert into public.tariffs (tenant_id, name) values (${TENANT_A}, 'Shape') returning id`;
        await tx`insert into public.tariff_assignments (tenant_id, tariff_id, scope_type, audience) values (${TENANT_A}, ${t.id}, 'location', 'all')`;
      }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(personaA('admin'), async (tx) => {
        const [t] =
          await tx`insert into public.tariffs (tenant_id, name) values (${TENANT_A}, 'Shape2') returning id`;
        await tx`insert into public.tariff_assignments (tenant_id, tariff_id, scope_type, audience) values (${TENANT_A}, ${t.id}, 'tenant', 'group')`;
      }),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('documents (Phase 3 step 5)', () => {
  const CP_A = '66666666-6666-4666-8666-666666666661';
  const LOC_A = '33333333-3333-4333-8333-333333333331';

  /** Seeds an account and two billable CDRs for it as the table owner, inside the caller's transaction. */
  async function seedBillable(tx: Tx) {
    await tx.unsafe('set local role postgres');
    const [acct] = await tx`
      insert into public.billing_accounts (tenant_id, kind, name, legal_name, tax_identification_no)
      values (${TENANT_A}, 'corporate', 'JMB Vantage', 'JMB Vantage Residences', 'C1234567890') returning id
    `;
    const cdrs = await tx`
      insert into public.cdrs (tenant_id, charge_point_id, location_id, ocpp_connector_id, ocpp_identity, billing_account_id,
                               start_at, end_at, total_energy_wh, currency, lines, subtotal_sen, tax_rate_bps, tax_sen, total_sen, billable)
      values
        (${TENANT_A}, ${CP_A}, ${LOC_A}, 1, 'VCP-DEMO-001', ${acct.id}, '2026-09-03T02:00:00Z', '2026-09-03T03:00:00Z', 7400, 'MYR',
         ${tx.json([{ dimension: 'ENERGY', elementIndex: 0, volume: 7400, unit: 'Wh', unitPriceSen: 120, label: 'Energy 7.400 kWh @ RM 1.20/kWh', amountExclSen: 888, taxSen: 0, amountInclSen: 888 }] as never)},
         888, 0, 0, 888, true),
        (${TENANT_A}, ${CP_A}, ${LOC_A}, 1, 'VCP-DEMO-001', ${acct.id}, '2026-09-10T02:00:00Z', '2026-09-10T03:00:00Z', 10000, 'MYR',
         ${tx.json([] as never)}, 1200, 800, 96, 1296, true)
      returning id
    `;
    await tx.unsafe('set local role authenticated');
    return { accountId: acct.id as string, cdrIds: cdrs.map((c) => c.id as string) };
  }

  it('run_invoice builds a draft with one line per session, links the sessions, and issue freezes it', async () => {
    await as(personaA('admin'), async (tx) => {
      const { accountId, cdrIds } = await seedBillable(tx);
      const [{ run_invoice: docId }] =
        await tx`select public.run_invoice(${accountId}::uuid, '2026-09-01', '2026-09-30')`;
      const [doc] = await tx`select * from public.documents where id = ${docId}`;
      expect(doc.kind).toBe('invoice');
      expect(doc.status).toBe('draft');
      expect(doc.number).toMatch(/^INV-\d{6}-\d{4}$/);
      expect(Number(doc.subtotal_sen)).toBe(2088);
      expect(Number(doc.tax_sen)).toBe(96);
      expect(Number(doc.total_sen)).toBe(2184);
      expect((doc.lines as unknown[]).length).toBe(2);
      expect((doc.buyer as { tax_identification_no: string }).tax_identification_no).toBe(
        'C1234567890',
      );
      const linked =
        await tx`select count(*)::int as n from public.cdrs where invoice_document_id = ${docId}`;
      expect(linked[0].n).toBe(2);
      expect(cdrIds).toHaveLength(2);

      // A second run finds nothing left to bill. Inside one transaction the
      // expected error must be confined to a savepoint or it aborts the rest.
      await expect(
        tx.savepoint(
          (sp) => sp`select public.run_invoice(${accountId}::uuid, '2026-09-01', '2026-09-30')`,
        ),
      ).rejects.toThrow(/No uninvoiced sessions/);

      await tx`select public.issue_document(${docId}::uuid)`;
      const [issued] = await tx`select status, issued_at from public.documents where id = ${docId}`;
      expect(issued.status).toBe('issued');
      expect(issued.issued_at).not.toBeNull();
      // Frozen: even the owner cannot change the total now.
      await tx.unsafe('set local role postgres');
      await expect(
        tx`update public.documents set total_sen = 1 where id = ${docId}`,
      ).rejects.toThrow(/immutable/);
    });
  });

  it('void releases the sessions so they can be invoiced again', async () => {
    await as(personaA('admin'), async (tx) => {
      const { accountId } = await seedBillable(tx);
      const [{ run_invoice: docId }] =
        await tx`select public.run_invoice(${accountId}::uuid, '2026-09-01', '2026-09-30')`;
      await tx`select public.void_document(${docId}::uuid)`;
      const [{ n }] =
        await tx`select count(*)::int as n from public.cdrs where invoice_document_id = ${docId}`;
      expect(n).toBe(0);
      const [{ run_invoice: again }] =
        await tx`select public.run_invoice(${accountId}::uuid, '2026-09-01', '2026-09-30')`;
      expect(again).not.toBe(docId);
    });
  });

  it('a viewer cannot run invoices; an operator can issue a receipt', async () => {
    await expect(
      as(
        personaA('viewer'),
        (tx) => tx`select public.run_invoice(gen_random_uuid(), '2026-09-01', '2026-09-30')`,
      ),
    ).rejects.toThrow(/Only owners and admins/);
    await as(personaA('operator'), async (tx) => {
      const { cdrIds } = await seedBillable(tx);
      const [{ create_receipt: docId }] =
        await tx`select public.create_receipt(${cdrIds[0]}::uuid)`;
      const [doc] =
        await tx`select kind, status, number, total_sen, cdr_id from public.documents where id = ${docId}`;
      expect(doc.kind).toBe('receipt');
      expect(doc.status).toBe('issued');
      expect(doc.number).toMatch(/^R-/);
      expect(Number(doc.total_sen)).toBe(888);
      expect(doc.cdr_id).toBe(cdrIds[0]);
      // Idempotent: asking again returns the same receipt.
      const [{ create_receipt: same }] = await tx`select public.create_receipt(${cdrIds[0]}::uuid)`;
      expect(same).toBe(docId);
    });
  });

  it('run_settlement applies the host share, electricity and platform fee from the agreement', async () => {
    await as(personaA('admin'), async (tx) => {
      const { accountId } = await seedBillable(tx); // 17.4 kWh, RM 20.88 excl. tax at LOC_A
      await tx.unsafe('set local role postgres');
      const [host] =
        await tx`insert into public.billing_accounts (tenant_id, kind, name, location_id) values (${TENANT_A}, 'site_host', 'JMB Vantage (host)', ${LOC_A}) returning id`;
      await tx`
        insert into public.site_host_agreements (tenant_id, location_id, host_account_id, revenue_share_bps_ac, fixed_monthly_fee_sen, electricity_sen_per_kwh, electricity_basis, valid_from)
        values (${TENANT_A}, ${LOC_A}, ${host.id}, 3000, 5000, 50, 'deduct_from_share', '2026-01-01')
      `;
      await tx.unsafe('set local role authenticated');
      const [{ run_settlement: docId }] =
        await tx`select public.run_settlement(${LOC_A}::uuid, '2026-09-01', '2026-09-30')`;
      const [doc] =
        await tx`select total_sen, lines, billing_account_id from public.documents where id = ${docId}`;
      // 30% of 2088 = 626.4 → 626; electricity 17.4 kWh × 50 sen = 870; fee 5000 → 626 − 870 − 5000 = −5244
      expect(Number(doc.total_sen)).toBe(626 - 870 - 5000);
      expect(doc.billing_account_id).toBe(host.id);
      expect((doc.lines as { kind: string }[]).map((l) => l.kind)).toEqual([
        'info',
        'credit',
        'debit',
        'debit',
      ]);
      expect(accountId).toBeTruthy();
    });
  });

  it('revenue_summary is scoped by RLS and sums billable sessions only', async () => {
    await as(personaA('admin'), async (tx) => {
      await seedBillable(tx);
      await tx.unsafe('set local role postgres');
      await tx`insert into public.cdrs (tenant_id, charge_point_id, location_id, start_at, end_at, total_energy_wh, billable, unbillable_reason, total_sen)
               values (${TENANT_A}, ${CP_A}, ${LOC_A}, '2026-09-11T02:00:00Z', '2026-09-11T03:00:00Z', 500, false, 'no_tariff', 0)`;
      await tx.unsafe('set local role authenticated');
      const rows = await tx`select * from public.revenue_summary('2026-09-01', '2026-09-30')`;
      const total = rows.reduce((s, r) => s + Number(r.total_sen), 0);
      const sessions = rows.reduce((s, r) => s + Number(r.sessions), 0);
      const unbillable = rows.reduce((s, r) => s + Number(r.unbillable_sessions), 0);
      expect(total).toBe(2184);
      expect(sessions).toBe(3);
      expect(unbillable).toBe(1);
    });
    const other = await as(
      personaB,
      (tx) => tx`select * from public.revenue_summary('2026-09-01', '2026-09-30')`,
    );
    expect(other.reduce((s, r) => s + Number(r.total_sen), 0)).toBe(0);
  });
});

describe('tenants table visibility', () => {
  it('a plain member sees only their own tenant row', async () => {
    const rows = await as(personaB, (tx) => tx`select id from public.tenants`);
    expect(rows.map((r) => r.id)).toEqual([TENANT_B]);
  });

  it('a platform admin sees all tenants', async () => {
    const rows = await as(personaA(), (tx) => tx`select id from public.tenants order by slug`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('tenant writes are service-role only (member update rejected)', async () => {
    const rows = await as(
      personaB,
      (tx) => tx`update public.tenants set name = 'renamed' where id = ${TENANT_B} returning id`,
    );
    expect(rows.length).toBe(0);
  });
});

describe('auth hook wiring', () => {
  it('custom_access_token_hook injects tenant claims for a seeded user', async () => {
    // The hook runs as supabase_auth_admin in production; postgres owner can
    // exercise it directly since it's SECURITY INVOKER and owner bypasses RLS.
    const [row] = await sql`
      select public.custom_access_token_hook(
        jsonb_build_object('user_id', ${USER_A}::text, 'claims', '{}'::jsonb)
      ) as event
    `;
    const claims = row.event.claims.app_metadata;
    expect(claims.tenant_id).toBe(TENANT_A);
    expect(claims.tenant_role).toBe('owner');
    expect(claims.platform_admin).toBe(true);
  });

  it('injects nothing for an unknown user', async () => {
    const [row] = await sql`
      select public.custom_access_token_hook(
        jsonb_build_object('user_id', gen_random_uuid()::text, 'claims', '{}'::jsonb)
      ) as event
    `;
    const claims = row.event.claims.app_metadata ?? {};
    expect(claims.tenant_id).toBeUndefined();
  });
});
