// Drives one complete charging session through a gateway as a scripted
// charger, then (optionally) checks the priced record it produced.
//
//   pnpm sim:session                                  # local gateway, seeded VCP-DEMO-001
//   pnpm sim:session --kwh 12 --minutes 45 --idle-min 20
//   pnpm sim:session --url wss://voltara-gateway-staging.fly.dev \
//       --identity VLT-CANARY-001 --key … --check --expect-sen 888
//
// This is both the end-user's "make a session happen without a car" tool and
// the nightly canary (.github/workflows/canary.yml): with --check it waits for
// the CDR and exits non-zero if it is missing or priced differently from
// --expect-sen. Timestamps are backdated so a 45-minute session takes seconds.

import { parseArgs } from 'node:util';
import { RPCClient } from 'ocpp-rpc';
import postgres from 'postgres';

const { values: a } = parseArgs({
  // pnpm forwards the `--` separator itself; tolerate it.
  allowPositionals: true,
  options: {
    url: { type: 'string', default: process.env.CANARY_GATEWAY_URL ?? 'ws://127.0.0.1:9221' },
    identity: { type: 'string', default: process.env.CANARY_IDENTITY ?? 'VCP-DEMO-001' },
    key: { type: 'string', default: process.env.CANARY_KEY ?? 'demo-charger-key-001' },
    tag: { type: 'string', default: process.env.CANARY_TAG ?? 'VLT-TAG-0001' },
    connector: { type: 'string', default: '1' },
    kwh: { type: 'string', default: '7.4' },
    minutes: { type: 'string', default: '30' },
    'idle-min': { type: 'string', default: '0' },
    'meter-start': { type: 'string', default: '1000' },
    check: { type: 'boolean', default: false },
    'expect-sen': { type: 'string' },
    'database-url': {
      type: 'string',
      default: process.env.CANARY_DATABASE_URL ?? process.env.DATABASE_URL,
    },
  },
});

const connectorId = Number(a.connector);
const wh = Math.round(Number(a.kwh) * 1000);
const minutes = Math.max(1, Number(a.minutes));
const idleMin = Math.max(0, Number(a['idle-min']));
const meterStart = Number(a['meter-start']);
const now = Date.now();
const startedAt = new Date(now - (minutes + idleMin) * 60_000);
const chargingEndedAt = new Date(now - idleMin * 60_000);
const stoppedAt = new Date(now);
const iso = (d: Date) => d.toISOString();

const client = new RPCClient({
  endpoint: a.url!.replace(/\/$/, '').endsWith('/ocpp')
    ? a.url!
    : `${a.url!.replace(/\/$/, '')}/ocpp`,
  identity: a.identity!,
  password: a.key!,
  protocols: ['ocpp1.6'],
  reconnect: false,
  callTimeoutMs: 15_000,
});
client.handle('GetConfiguration', () => ({
  configurationKey: [{ key: 'HeartbeatInterval', readonly: false, value: '300' }],
  unknownKey: [],
}));
client.handle('TriggerMessage', () => ({ status: 'Accepted' }));
client.handle('RemoteStartTransaction', () => ({ status: 'Accepted' }));
client.handle('RemoteStopTransaction', () => ({ status: 'Accepted' }));
client.handle('Reset', () => ({ status: 'Accepted' }));
client.handle('ClearCache', () => ({ status: 'Accepted' }));

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));

async function main(): Promise<number> {
  log('connecting', { url: a.url, identity: a.identity });
  await client.connect();
  await client.call('BootNotification', {
    chargePointVendor: 'Voltara',
    chargePointModel: 'Session simulator',
    firmwareVersion: 'sim-1',
  });
  await client.call('StatusNotification', {
    connectorId,
    errorCode: 'NoError',
    status: 'Preparing',
    timestamp: iso(startedAt),
  });

  const auth = (await client.call('Authorize', { idTag: a.tag })) as {
    idTagInfo: { status: string };
  };
  if (auth.idTagInfo.status !== 'Accepted') {
    log('tag refused', { status: auth.idTagInfo.status });
    return 2;
  }

  const start = (await client.call('StartTransaction', {
    connectorId,
    idTag: a.tag,
    meterStart,
    timestamp: iso(startedAt),
  })) as { transactionId: number; idTagInfo: { status: string } };
  log('started', { transactionId: start.transactionId });
  await client.call('StatusNotification', {
    connectorId,
    errorCode: 'NoError',
    status: 'Charging',
    timestamp: iso(startedAt),
  });

  // A meter sample every 5 minutes across the charging window so ToU tariffs
  // apportion energy realistically.
  const steps = Math.max(1, Math.floor(minutes / 5));
  for (let i = 1; i <= steps; i += 1) {
    const at = new Date(startedAt.getTime() + (i / steps) * minutes * 60_000);
    const energy = meterStart + Math.round((wh * i) / steps);
    const powerW = Math.round((wh / minutes) * 60);
    await client.call('MeterValues', {
      connectorId,
      transactionId: start.transactionId,
      meterValue: [
        {
          timestamp: iso(at),
          sampledValue: [
            { value: String(energy), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
            { value: String(powerW), measurand: 'Power.Active.Import', unit: 'W' },
          ],
        },
      ],
    });
  }
  if (idleMin > 0) {
    await client.call('StatusNotification', {
      connectorId,
      errorCode: 'NoError',
      status: 'Finishing',
      timestamp: iso(chargingEndedAt),
    });
  }
  await client.call('StopTransaction', {
    transactionId: start.transactionId,
    meterStop: meterStart + wh,
    timestamp: iso(stoppedAt),
    reason: 'Local',
    idTag: a.tag,
  });
  await client.call('StatusNotification', {
    connectorId,
    errorCode: 'NoError',
    status: 'Available',
    timestamp: iso(stoppedAt),
  });
  log('stopped', { transactionId: start.transactionId, kwh: wh / 1000, minutes, idleMin });

  if (!a.check) return 0;
  if (!a['database-url']) {
    log('check requested but no --database-url / CANARY_DATABASE_URL');
    return 3;
  }
  const sql = postgres(a['database-url'], { max: 1, onnotice: () => {} });
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const [row] = await sql<
        {
          id: string;
          billable: boolean;
          total_sen: string;
          unbillable_reason: string | null;
          total_energy_wh: string;
        }[]
      >`
        select c.id, c.billable, c.total_sen, c.unbillable_reason, c.total_energy_wh
        from public.cdrs c join public.charging_sessions s on s.id = c.charging_session_id
        where s.ocpp_transaction_id = ${start.transactionId}
      `;
      if (row) {
        log('cdr', {
          id: row.id,
          billable: row.billable,
          totalSen: Number(row.total_sen),
          reason: row.unbillable_reason,
          energyWh: Number(row.total_energy_wh),
        });
        if (Number(row.total_energy_wh) !== wh) {
          log('energy mismatch', { expected: wh });
          return 4;
        }
        if (a['expect-sen'] !== undefined && Number(row.total_sen) !== Number(a['expect-sen'])) {
          log('price mismatch', { expected: Number(a['expect-sen']) });
          return 5;
        }
        return 0;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    log('no CDR within 30 s');
    return 6;
  } finally {
    await sql.end({ timeout: 3 });
  }
}

main()
  .then(async (code) => {
    await client.close({ code: 1000, reason: 'done', force: true }).catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    log('failed', { error: err instanceof Error ? err.message : String(err) });
    await client.close({ code: 1000, reason: 'error', force: true }).catch(() => {});
    process.exit(1);
  });
