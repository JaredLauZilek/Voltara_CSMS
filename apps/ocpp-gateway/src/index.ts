// Voltara CSMS — OCPP gateway.
// Phase 0: health endpoints + logging + graceful shutdown only. Phase 1 adds
// the ocpp-rpc WebSocket server on this same HTTP server (upgrade on
// /ocpp/{identity}), the connection registry, and the command bus.

import { createServer } from 'node:http';
import { pino } from 'pino';

const logger = pino({
  name: 'ocpp-gateway',
  level: process.env.LOG_LEVEL ?? 'info',
});

const HTTP_PORT = Number(process.env.GATEWAY_HTTP_PORT ?? 9221);
const startedAt = Date.now();

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'ocpp-gateway',
        uptimeS: Math.round((Date.now() - startedAt) / 1000),
      }),
    );
    return;
  }
  if (req.method === 'GET' && req.url === '/statusz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        phase: 'phase-0',
        connections: 0,
        node: process.version,
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

server.listen(HTTP_PORT, () => {
  logger.info({ port: HTTP_PORT }, 'gateway http listening');
});

// Fly sends SIGINT/SIGTERM on deploys; close the listener so in-flight
// requests finish. Phase 1 extends this to drain charger sockets cleanly.
function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
