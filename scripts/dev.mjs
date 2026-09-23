#!/usr/bin/env node
/**
 * One command to bring the whole local stack up, idempotently:
 *
 *   pnpm dev:all
 *
 * Supabase (with the codespace firewall fix) · the OCPP gateway · the admin
 * app · the Expo tunnel for the phone. Anything already running is left
 * alone, so re-running after a pause only restarts what died.
 *
 * It also writes apps/admin/public/dev-phone.json (the Expo URL + a QR as
 * SVG) which the admin app's Dev page renders — so the phone link is always
 * one click away instead of buried in terminal scrollback.
 *
 * The Expo tunnel URL is stable: it comes from apps/driver/.expo/settings.json
 * (`urlRandomness`) plus the Expo username and port, so the phone can keep the
 * same link across restarts.
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = process.env.VOLTARA_DEV_LOGS ?? '/tmp/voltara-dev';
mkdirSync(LOG_DIR, { recursive: true });

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function envFile(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

async function portBusy(port) {
  try {
    const { stdout } = await exec('ss', ['-ltn']);
    return stdout.includes(`:${port} `);
  } catch {
    return false;
  }
}

async function httpOk(url, expect = [200]) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return expect.includes(res.status);
  } catch {
    return false;
  }
}

/** Starts a detached child whose output goes to a log file. */
function start(name, command, args, { cwd = root, env = {} } = {}) {
  const log = `${LOG_DIR}/${name}.log`;
  appendFileSync(log, `\n=== ${new Date().toISOString()} ${command} ${args.join(' ')} ===\n`);
  const fd = openSync(log, 'a');
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, ...env },
  });
  child.unref();
  return log;
}

async function waitFor(label, check, { timeoutMs = 180_000, everyMs = 2_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(c.dim(`  waiting for ${label}`));
  while (Date.now() < deadline) {
    if (await check()) {
      process.stdout.write(c.green(' ok\n'));
      return true;
    }
    await sleep(everyMs);
    process.stdout.write(c.dim('.'));
  }
  process.stdout.write(c.red(' timed out\n'));
  return false;
}

/**
 * A stale iptables-legacy FORWARD DROP policy blocks container-to-container
 * traffic on fresh codespaces, which breaks `supabase start` at schema init.
 */
async function fixFirewall() {
  try {
    const { stdout } = await exec('sudo', ['iptables-legacy', '-S', 'FORWARD']);
    if (stdout.includes('-P FORWARD DROP')) {
      await exec('sudo', ['iptables-legacy', '-P', 'FORWARD', 'ACCEPT']);
      console.log('  firewall: legacy FORWARD policy set to ACCEPT');
    }
  } catch {
    /* not a codespace, or no sudo — nothing to do */
  }
}

async function supabase() {
  const healthy = async () =>
    (await httpOk('http://127.0.0.1:54321/auth/v1/health')) &&
    (await httpOk('http://127.0.0.1:54321/rest/v1/', [200, 401]));
  if (await healthy()) return 'already running';
  console.log('  starting the local Supabase stack (this takes a minute)…');
  await exec('pnpm', ['exec', 'supabase', 'start'], { cwd: root, maxBuffer: 1 << 24 }).catch(
    () => {},
  );
  return (await waitFor('supabase', healthy, { timeoutMs: 240_000 })) ? 'started' : 'FAILED';
}

async function gateway() {
  if (await httpOk('http://127.0.0.1:9221/healthz')) return 'already running';
  const env = envFile('.env.gateway.local');
  if (!env.DATABASE_URL) return 'SKIPPED (no .env.gateway.local)';
  start('gateway', 'pnpm', ['--filter', '@voltara/ocpp-gateway', 'dev'], { env });
  return (await waitFor('gateway', () => httpOk('http://127.0.0.1:9221/healthz'), {
    timeoutMs: 60_000,
  }))
    ? 'started'
    : 'FAILED';
}

async function admin() {
  if (await httpOk('http://127.0.0.1:5173/')) return 'already running';
  start('admin', 'pnpm', ['--filter', '@voltara/admin', 'dev', '--host', '127.0.0.1']);
  return (await waitFor('admin', () => httpOk('http://127.0.0.1:5173/'), { timeoutMs: 90_000 }))
    ? 'started'
    : 'FAILED';
}

async function expo() {
  const env = envFile('.env.dev.local');
  if (!env.EXPO_TOKEN) return { status: 'SKIPPED (no EXPO_TOKEN in .env.dev.local)' };
  const alreadyRunning = await portBusy(8081);
  if (!alreadyRunning) {
    start('expo', 'npx', ['expo', 'start', '--tunnel', '--port', '8081'], {
      cwd: resolve(root, 'apps/driver'),
      env: { EXPO_TOKEN: env.EXPO_TOKEN, EXPO_NO_TELEMETRY: '1' },
    });
  }
  const manifest = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8081/', {
        headers: { 'expo-platform': 'ios' },
        signal: AbortSignal.timeout(5_000),
      });
      const body = await res.json();
      return body?.extra?.expoClient?.hostUri ?? null;
    } catch {
      return null;
    }
  };
  // Expo answers with the LAN host (127.0.0.1:8081) while the tunnel is still
  // being established, then switches to the public *.exp.direct host — the
  // only one a phone can reach, so wait for that specifically.
  let host = null;
  const ok = await waitFor(
    'expo tunnel',
    async () => {
      host = await manifest();
      return Boolean(host && host.includes('.exp.direct'));
    },
    { timeoutMs: 180_000 },
  );
  if (!ok) {
    const status = host
      ? `running, but no tunnel yet (${host})`
      : alreadyRunning
        ? 'running (no manifest yet)'
        : 'FAILED';
    return { status };
  }
  return { status: alreadyRunning ? 'already running' : 'started', url: `exp://${host}` };
}

async function publishPhoneLink(url) {
  const file = resolve(root, 'apps/admin/public/dev-phone.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        url: url ?? null,
        qrSvg: url ? await QRCode.toString(url, { type: 'svg', margin: 1, width: 280 }) : null,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

console.log(c.bold('\nVoltara — local development\n'));
await fixFirewall();
const results = { supabase: await supabase(), gateway: await gateway(), admin: await admin() };
const ex = await expo();
results.expo = ex.status;
await publishPhoneLink(ex.url);

const codespace = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-5173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'}`
  : 'http://127.0.0.1:5173';

console.log('');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${/FAIL|SKIP/.test(v) ? c.red('✗') : c.green('✓')} ${k.padEnd(9)} ${v}`);
}
console.log(`\n  ${c.bold('Admin')}  ${codespace}`);
if (ex.url) {
  console.log(`  ${c.bold('Phone')}  ${ex.url}`);
  console.log(c.dim('          or open the admin app → Dev → scan the QR with the iPhone camera'));
  console.log('');
  console.log(await QRCode.toString(ex.url, { type: 'terminal', small: true }));
}
console.log(c.dim(`  logs: ${LOG_DIR}/{gateway,admin,expo}.log`));
console.log(
  c.dim('  a charging session without hardware: pnpm sim:session --kwh 7.4 --idle-min 5\n'),
);
