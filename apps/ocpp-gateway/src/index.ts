// Voltara CSMS — OCPP gateway process entry point.
//
// The gateway is the only writer of charger runtime state and the only
// component that talks to chargers. Assembly lives in gateway.ts; this file is
// just the process wrapper: start it, and shut it down cleanly when Fly sends
// a signal during a deploy.

import { createGateway } from './gateway.js';

const gateway = createGateway();

try {
  await gateway.start();
} catch (err) {
  // Written to stderr directly: config or the database connection is the usual
  // cause, and the logger may be the very thing that failed to construct.
  console.error('gateway failed to start', err);
  process.exit(1);
}

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  gateway.logger.info({ signal }, 'shutdown signal received');

  // Chargers reconnect on their own and queue transactions while away, so a
  // brisk exit is safer than hanging on to sockets during a deploy.
  const force = setTimeout(() => {
    gateway.logger.error('shutdown timed out, exiting anyway');
    process.exit(1);
  }, 10_000);
  force.unref();

  void gateway
    .stop()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      gateway.logger.error({ err }, 'shutdown failed');
      process.exit(1);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  gateway.logger.error({ err }, 'unhandled rejection');
});
