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
