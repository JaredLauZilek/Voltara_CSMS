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
  it('tenant B cannot see tenant A charge points', async () => {
    const rows = await as(personaB, (tx) => tx`select id from public.charge_points`);
    expect(rows.length).toBe(0); // only Voltara has a seeded charge point
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
