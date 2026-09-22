// Test harness: a real gateway on an ephemeral port, plus a scripted charger.
//
// Deliberately not a mock. Everything Phase 1 claims — Basic Auth over the
// handshake, the transaction state machine, batched frame logging, the
// LISTEN/NOTIFY command bus — is emergent behaviour of the real server talking
// to a real Postgres, and a stubbed transport would prove none of it.
//
// The charger side is ocpp-rpc's own RPCClient, which implements the other half
// of OCPP-J. That keeps the suite Docker-free in CI; the Solidstudio virtual
// charge point stays the manual conformance rig (CLAUDE.md §9).

import { RPCClient } from 'ocpp-rpc';
import postgres from 'postgres';
import { createGateway, type Gateway } from '@voltara/ocpp-gateway/gateway';
import { loadConfig } from '@voltara/ocpp-gateway/config';

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Seeded fixtures — see supabase/seed.sql. */
export const FIXTURES = {
  tenantA: '11111111-1111-4111-8111-111111111111',
  tenantB: '22222222-2222-4222-8222-222222222222',
  chargePointA: '66666666-6666-4666-8666-666666666661',
  chargePointB: '66666666-6666-4666-8666-666666666662',
  retiredChargePoint: '66666666-6666-4666-8666-666666666663',
  identityA: 'VCP-DEMO-001',
  identityB: 'VCP-DEMO-002',
  retiredIdentity: 'VCP-RETIRED-001',
  keyA: 'demo-charger-key-001',
  keyB: 'demo-charger-key-002',
  keyRetired: 'demo-charger-key-003',
  idTag: 'VLT-TAG-0001',
  // Phase 3 billing fixtures (supabase/seed.sql): RM 1.20/kWh, idle RM 1/min after 15 min.
  tariffA: 'aaaa0002-0000-4000-8000-000000000001',
  tariffVersionA: 'aaaa0003-0000-4000-8000-000000000001',
  assignmentA: 'aaaa0004-0000-4000-8000-000000000001',
  taxProfileA: 'aaaa0001-0000-4000-8000-000000000001',
} as const;

export const sql = postgres(DB_URL, { max: 4, onnotice: () => {} });

export interface RunningGateway {
  gateway: Gateway;
  port: number;
  instance: string;
}

let instanceCounter = 0;

/**
 * Boots a gateway on a random port with a unique instance name, so parallel
 * test files never collide in `charge_point_connections`.
 */
export async function startGateway(
  overrides: Partial<Record<string, string>> = {},
): Promise<RunningGateway> {
  const instance = `test-${process.pid}-${++instanceCounter}`;
  const config = loadConfig({
    DATABASE_URL: DB_URL,
    GATEWAY_PORT: '0',
    GATEWAY_INSTANCE: instance,
    LOG_LEVEL: process.env.GATEWAY_TEST_LOG_LEVEL ?? 'silent',
    ...overrides,
  } as NodeJS.ProcessEnv);

  const gateway = createGateway(config);
  const { port } = await gateway.start();
  return { gateway, port, instance };
}

export interface ScriptedCharger {
  client: InstanceType<typeof RPCClient>;
  call: <T = Record<string, unknown>>(action: string, payload?: unknown) => Promise<T>;
  close: () => Promise<void>;
}

/** Connects a charger to the gateway, performing the Basic Auth handshake. */
export async function connectCharger(
  port: number,
  identity: string,
  password: string,
  options: {
    handlers?: Record<string, (params: unknown) => unknown>;
    /** Extra upgrade-request headers — e.g. x-forwarded-proto, to simulate what
     * Fly's proxy stamps on a plaintext ws:// connection. */
    headers?: Record<string, string>;
  } = {},
): Promise<ScriptedCharger> {
  const client = new RPCClient({
    endpoint: `ws://127.0.0.1:${port}`,
    identity,
    password,
    protocols: ['ocpp1.6'],
    // Reconnect is the charger's job in production; in tests it would mask
    // exactly the disconnects we are asserting on.
    reconnect: false,
    callTimeoutMs: 8_000,
    headers: options.headers,
  } as ConstructorParameters<typeof RPCClient>[0]);

  for (const [action, handler] of Object.entries(options.handlers ?? {})) {
    client.handle(action, (({ params }: { params?: unknown }) => handler(params)) as never);
  }

  await client.connect();

  return {
    client,
    call: async <T>(action: string, payload: unknown = {}) =>
      (await client.call(action, payload)) as T,
    // `force` matters: a graceful close waits for in-flight calls to drain,
    // and scenarios that deliberately wedge a handler would otherwise hang here
    // long after the assertions have passed.
    close: async () => {
      await client.close({ code: 1000, reason: 'test over', force: true });
    },
  };
}

// ── Assertion helpers ───────────────────────────────────────────────────────

/** Polls until `check` returns a value, so tests never sleep a fixed amount. */
export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  { timeoutMs = 5_000, intervalMs = 50, label = 'condition' } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last as T;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function resetChargerState(): Promise<void> {
  // Order respects foreign keys; charge_points/connectors survive because they
  // are fixtures, not test output. CDRs and tariff versions are immutable by
  // trigger — test cleanup is the one place that may bypass that, and only as
  // the superuser the harness connects as.
  await sql`alter table public.cdrs disable trigger cdrs_immutable`;
  await sql`delete from public.cdrs`;
  await sql`alter table public.cdrs enable trigger cdrs_immutable`;
  await sql`delete from public.webhook_deliveries`;
  await sql`delete from public.webhooks`;
  await sql`delete from public.documents`;
  await sql`delete from public.driver_group_members`;
  await sql`delete from public.driver_join_codes`;
  await sql`delete from public.driver_profiles`;
  await sql`delete from public.driver_groups`;
  await sql`delete from public.tariff_assignments where id not in ('aaaa0004-0000-4000-8000-000000000001', 'aaaa0004-0000-4000-8000-000000000002')`;
  await sql`alter table public.tariff_versions disable trigger tariff_versions_immutable`;
  await sql`delete from public.tariff_versions where id not in ('aaaa0003-0000-4000-8000-000000000001', 'aaaa0003-0000-4000-8000-000000000002')`;
  await sql`alter table public.tariff_versions enable trigger tariff_versions_immutable`;
  await sql`delete from public.tariffs where id not in ('aaaa0002-0000-4000-8000-000000000001', 'aaaa0002-0000-4000-8000-000000000002')`;
  await sql`delete from public.billing_accounts`;
  await sql`update public.id_tags set billing_account_id = null`;
  await sql`delete from public.meter_values_agg_1m`;
  await sql`delete from public.meter_values`;
  await sql`delete from public.charging_sessions`;
  await sql`delete from public.ocpp_messages`;
  await sql`delete from public.charge_point_status_log`;
  await sql`delete from public.charge_point_connection_log`;
  await sql`delete from public.charge_point_connections`;
  await sql`delete from public.remote_commands`;
  await sql`
    update public.charge_points
    set connection_state = 'never_connected', last_seen_at = null, last_boot_at = null,
        vendor_reported = null, model_reported = null, firmware_version = null, config = '{}'::jsonb,
        security_profile = 2
  `;
  await sql`update public.connectors set status = 'Unknown', status_updated_at = null, last_error_code = null`;
  await sql`update public.id_tags set status = 'active', expires_at = null`;
}

export async function closeHarness(): Promise<void> {
  await sql.end({ timeout: 5 });
}
