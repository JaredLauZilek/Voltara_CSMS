#!/usr/bin/env node
/**
 * One command for local development:
 *
 *   pnpm dev          start the portal + the Expo tunnel, publish the phone QR
 *   pnpm dev:stop     stop both
 *
 * Idempotent: anything already running is left alone. The Expo tunnel URL is
 * written to apps/admin/public/dev-phone.json (with a QR as SVG), which the
 * portal's dev-only "Phone" page renders — so the link is one click away
 * instead of buried in terminal scrollback. The children are detached; logs
 * live in /tmp/voltara-home-dev/.
 *
 * Dev-only convenience, to be removed before launch (the page is never part
 * of a production bundle).
 */
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import QRCode from 'qrcode';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = process.env.VOLTARA_DEV_LOGS ?? '/tmp/voltara-home-dev';
mkdirSync(LOG_DIR, { recursive: true });

const ADMIN_PORT = 5173;
const EXPO_PORT = 8081;
const PHONE_FILE = resolve(root, 'apps/admin/public/dev-phone.json');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A Codespaces secret: process env first, else the shared env file GitHub writes. */
function codespaceSecret(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync('/workspaces/.codespaces/shared/.env', 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).replace(/^"|"$/g, '') : undefined;
  } catch {
    return undefined;
  }
}

async function currentHost() {
  try {
    const res = await fetch(`http://127.0.0.1:${EXPO_PORT}/`, {
      headers: { 'expo-platform': 'ios' },
      signal: AbortSignal.timeout(5_000),
    });
    const body = await res.json();
    return body?.extra?.expoClient?.hostUri ?? null;
  } catch {
    return null;
  }
}

async function listeners(port) {
  try {
    const { stdout } = await exec('ss', ['-ltnp']);
    return stdout
      .split('\n')
      .filter((l) => l.includes(`:${port} `))
      .flatMap((l) => [...l.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])));
  } catch {
    return [];
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

async function admin() {
  if (await httpOk(`http://127.0.0.1:${ADMIN_PORT}/`)) return 'already running';
  start('admin', 'pnpm', ['--filter', '@voltara/home-admin', 'dev']);
  return (await waitFor('portal', () => httpOk(`http://127.0.0.1:${ADMIN_PORT}/`), {
    timeoutMs: 90_000,
  }))
    ? 'started'
    : 'FAILED';
}

async function expo(attempt = 1) {
  // Expo Go only opens projects served by the same account it is signed in
  // to. EXPO_TOKEN (expo.dev → Account settings → Access tokens) signs the
  // dev server in and also makes the tunnel address stable.
  const token = codespaceSecret('EXPO_TOKEN');
  let alreadyRunning = (await listeners(EXPO_PORT)).length > 0;
  if (alreadyRunning && token) {
    const host = await currentHost();
    if (host && host.includes('-anonymous-')) {
      console.log(
        c.dim('  Expo is running anonymously but EXPO_TOKEN is set — restarting it signed in'),
      );
      for (const pid of await listeners(EXPO_PORT)) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* gone */
        }
      }
      await sleep(2_000);
      alreadyRunning = false;
    }
  }
  if (!alreadyRunning) {
    const env = { EXPO_NO_TELEMETRY: '1', ...(token ? { EXPO_TOKEN: token } : {}) };
    delete process.env.CI; // CI mode disables Metro's watch/reload
    start('expo', 'npx', ['expo', 'start', '--go', '--tunnel', '--port', String(EXPO_PORT)], {
      cwd: resolve(root, 'apps/home'),
      env,
    });
  }
  // Expo answers with the LAN host while the tunnel is still coming up, then
  // switches to the public *.exp.direct host — the only one a phone can reach.
  const manifestHost = currentHost;
  const logHost = () => {
    try {
      const log = readFileSync(`${LOG_DIR}/expo.log`, 'utf8');
      const m = [...log.matchAll(/exp:\/\/([a-z0-9.-]+\.exp\.direct(?::\d+)?)/gi)].pop();
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };
  let host = null;
  const ok = await waitFor(
    'expo tunnel',
    async () => {
      host = (await manifestHost()) ?? logHost();
      return Boolean(host && host.includes('.exp.direct'));
    },
    { timeoutMs: 180_000 },
  );
  if (!ok) {
    // ngrok's anonymous tunnels fail now and then ("failed to start tunnel");
    // a fresh process almost always succeeds. One automatic retry.
    let tunnelDied = false;
    try {
      tunnelDied = /failed to start tunnel|session closed/i.test(
        readFileSync(`${LOG_DIR}/expo.log`, 'utf8').split('=== ').pop() ?? '',
      );
    } catch {
      /* no log */
    }
    if (tunnelDied && attempt < 2) {
      console.log(c.dim('  tunnel failed — restarting Expo once'));
      for (const pid of await listeners(EXPO_PORT)) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* gone */
        }
      }
      await sleep(2_000);
      return expo(attempt + 1);
    }
    return {
      status: host
        ? `running, but no tunnel yet (${host})`
        : alreadyRunning
          ? 'running (no manifest yet)'
          : 'FAILED',
    };
  }
  return { status: alreadyRunning ? 'already running' : 'started', url: `exp://${host}` };
}

async function publishPhoneLink(url) {
  mkdirSync(dirname(PHONE_FILE), { recursive: true });
  writeFileSync(
    PHONE_FILE,
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

async function stop() {
  const pids = new Set([...(await listeners(ADMIN_PORT)), ...(await listeners(EXPO_PORT))]);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`  stopped pid ${pid}`);
    } catch {
      /* already gone */
    }
  }
  await publishPhoneLink(null);
  console.log(pids.size ? '  done' : '  nothing was running');
}

const portalUrl = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-${ADMIN_PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'}`
  : `http://127.0.0.1:${ADMIN_PORT}`;

console.log(c.bold('\nVoltara Home — local development\n'));
if (process.argv.includes('--stop')) {
  await stop();
  process.exit(0);
}

const results = { portal: await admin() };
const ex = await expo();
results.phone = ex.status;
await publishPhoneLink(ex.url);

console.log('');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${/FAIL/.test(v) ? c.red('✗') : c.green('✓')} ${k.padEnd(7)} ${v}`);
}
console.log(`\n  ${c.bold('Portal')}  ${portalUrl}`);
console.log(`  ${c.bold('Phone')}   ${ex.url ?? '(no tunnel yet — rerun pnpm dev in a minute)'}`);
if (ex.url) {
  console.log(
    c.dim('           or open the portal → Dev → Phone and scan the QR with the iPhone camera'),
  );
  if (ex.url.includes('-anonymous-')) {
    console.log(
      c.dim(
        '           anonymous tunnel: a phone signed in to Expo Go cannot open it — add the EXPO_TOKEN\n' +
          '           Codespaces secret (expo.dev → Account settings → Access tokens) or sign out of Expo Go',
      ),
    );
  }
  console.log('');
  console.log(await QRCode.toString(ex.url, { type: 'terminal', small: true }));
}
console.log(c.dim(`  logs: ${LOG_DIR}/{admin,expo}.log · stop everything: pnpm dev:stop\n`));
