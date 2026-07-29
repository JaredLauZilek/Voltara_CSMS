/**
 * Registers a charge point and prints the credentials to configure on it.
 *
 * This is the interim path to onboarding real hardware; the Phase 2 admin
 * portal replaces it with a wizard. The security property is the same either
 * way: the key is generated here, only its bcrypt hash is stored, and the
 * plaintext is displayed exactly once. If it is lost, rotate — there is no
 * way to read it back, by design.
 *
 *   pnpm register:charger --name "HQ Bay 1" --identity VLT-HQ-001 --connectors 1
 *
 * Target database via DATABASE_URL (defaults to the local dev stack) — set it
 * to the staging connection string to onboard real hardware. Full walkthrough:
 * docs/deploy-gateway.md
 */

import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import postgres from 'postgres';

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    identity: { type: 'string' },
    tenant: { type: 'string' },
    location: { type: 'string' },
    connectors: { type: 'string', default: '1' },
    'connector-type': { type: 'string', default: 'Type2' },
    'max-kw': { type: 'string' },
    url: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.name) {
  console.log(`
Register a charge point and print its one-time credentials.

  --name          Human name, e.g. "HQ Bay 1"                (required)
  --identity      OCPP identity / Charge Point ID            (default: derived from name)
  --tenant        Tenant uuid or slug                        (default: the first-party tenant)
  --location      Location uuid or name                      (default: first location of the tenant)
  --connectors    How many connectors the unit has           (default: 1)
  --connector-type Type2 | CCS2 | CHAdeMO | ...              (default: Type2)
  --max-kw        Rated power per connector
  --url           Public gateway URL, e.g. wss://gw.voltara.my

Environment: DATABASE_URL (defaults to the local Supabase stack).
`);
  process.exit(values.help ? 0 : 1);
}

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Slugs a name into something acceptable as an OCPP identity. */
function toIdentity(name: string): string {
  return (
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'CHARGER'
  );
}

const sql = postgres(DB_URL, {
  max: 1,
  onnotice: () => {},
  connection: { search_path: 'public, extensions' },
});

try {
  const identity = values.identity ?? toIdentity(values.name);
  // 16 bytes of entropy rendered as 32 hex chars. Kept under the 40-character
  // AuthorizationKey ceiling in the OCPP 1.6 security whitepaper, since some
  // firmware truncates silently rather than rejecting.
  const authKey = randomBytes(16).toString('hex');
  const connectorCount = Math.max(1, Number.parseInt(values.connectors ?? '1', 10));
  const maxKw = values['max-kw'] ? Number(values['max-kw']) : null;

  const [tenant] = values.tenant
    ? await sql<{ id: string; name: string }[]>`
        select id, name from public.tenants
        where id::text = ${values.tenant} or slug = ${values.tenant} limit 1`
    : await sql<{ id: string; name: string }[]>`
        select id, name from public.tenants
        order by is_first_party desc, created_at asc limit 1`;

  if (!tenant)
    throw new Error(`No tenant found${values.tenant ? ` matching "${values.tenant}"` : ''}.`);

  const [location] = values.location
    ? await sql<{ id: string; name: string }[]>`
        select id, name from public.locations
        where tenant_id = ${tenant.id} and (id::text = ${values.location} or name = ${values.location})
        limit 1`
    : await sql<{ id: string; name: string }[]>`
        select id, name from public.locations
        where tenant_id = ${tenant.id} order by created_at asc limit 1`;

  const existing = await sql`select 1 from public.charge_points where ocpp_identity = ${identity}`;
  if (existing.length > 0) {
    throw new Error(
      `Identity "${identity}" is already registered. Identities are globally unique — pass a different --identity.`,
    );
  }

  const chargePointId = await sql.begin(async (tx) => {
    const [cp] = await tx<{ id: string }[]>`
      insert into public.charge_points (
        tenant_id, location_id, ocpp_identity, name, lifecycle, security_profile, auth_key_hash
      ) values (
        ${tenant.id}, ${location?.id ?? null}, ${identity}, ${values.name!},
        'pending', 2, crypt(${authKey}, gen_salt('bf'))
      )
      returning id
    `;

    for (let n = 1; n <= connectorCount; n++) {
      const [evse] = await tx<{ id: string }[]>`
        insert into public.evses (tenant_id, charge_point_id, evse_number)
        values (${tenant.id}, ${cp.id}, ${n}) returning id
      `;
      await tx`
        insert into public.connectors (
          tenant_id, evse_id, charge_point_id, ocpp_connector_id, connector_type, max_kw
        ) values (
          ${tenant.id}, ${evse.id}, ${cp.id}, ${n}, ${values['connector-type']!}, ${maxKw}
        )
      `;
    }

    return cp.id;
  });

  const base = (
    values.url ??
    process.env.GATEWAY_PUBLIC_URL ??
    'wss://<your-gateway-host>'
  ).replace(/\/$/, '');

  console.log(`
Registered "${values.name}" for ${tenant.name}${location ? ` at ${location.name}` : ''}.
  charge_point_id  ${chargePointId}
  connectors       ${connectorCount} × ${values['connector-type']}

── Configure these on the charger ──────────────────────────────────────────

  Central System URL   ${base}/ocpp
  Charge Point ID      ${identity}
  (some firmware wants the full URL instead:  ${base}/ocpp/${identity} )

  Basic Auth username  ${identity}          ← must equal the Charge Point ID
  Basic Auth password  ${authKey}
  AuthorizationKey     ${authKey}          ← same value; field name varies by vendor

  OCPP version         1.6J (JSON over WebSocket)
  Security profile     2  (TLS + Basic Auth)

────────────────────────────────────────────────────────────────────────────
This key is shown ONCE and is stored only as a hash. Save it now; if it is
lost, register a new key rather than trying to recover this one.

The charge point stays 'pending' until its first successful BootNotification,
which flips it to 'active' — that is your confirmation the charger got through.
`);
} catch (err) {
  console.error(`\nRegistration failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
