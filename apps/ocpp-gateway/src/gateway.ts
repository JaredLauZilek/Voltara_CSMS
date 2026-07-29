import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig, type GatewayConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { createDb, type Db } from './db/client.js';
import { clearStaleConnections } from './db/logs.js';
import { createFrameWriter, createMeterValueWriter } from './db/writers.js';
import { createOcppServer } from './ocpp/v16/server.js';
import { ConnectionRegistry } from './registry.js';
import { RealtimePublisher } from './realtime.js';
import { CommandBus } from './commandBus.js';

export interface Gateway {
  start: () => Promise<{ port: number }>;
  stop: () => Promise<void>;
  readonly registry: ConnectionRegistry;
  readonly logger: Logger;
  readonly db: Db;
}

/**
 * Builds the gateway without starting it.
 *
 * Assembly is separated from the process bootstrap so the integration suite can
 * run a real gateway in-process on an ephemeral port — the OCPP behaviour we
 * care about is emergent (auth, state machines, batching, the command bus), and
 * testing it through anything less than the real server proves little.
 */
export function createGateway(config: GatewayConfig = loadConfig()): Gateway {
  const logger = createLogger(config.LOG_LEVEL);
  const db = createDb(config);
  const registry = new ConnectionRegistry();
  const realtime = new RealtimePublisher(config, logger);
  const frameWriter = createFrameWriter(db, logger);
  const meterWriter = createMeterValueWriter(db, logger);
  const commandBus = new CommandBus(db, config, logger, registry);

  const ocpp = createOcppServer({
    db,
    config,
    logger,
    registry,
    realtime,
    frameWriter,
    meterWriter,
    onChargerConnected: (connection) => commandBus.onChargerConnected(connection),
  });

  const startedAt = Date.now();
  let httpServer: Server | null = null;

  const requestHandler = (url: string | undefined): { status: number; body: unknown } => {
    switch (url) {
      case '/healthz':
        return {
          status: 200,
          body: {
            ok: true,
            service: 'ocpp-gateway',
            instance: config.GATEWAY_INSTANCE,
            uptimeS: Math.round((Date.now() - startedAt) / 1000),
          },
        };
      case '/statusz':
        return {
          status: 200,
          body: {
            ok: true,
            instance: config.GATEWAY_INSTANCE,
            connections: registry.size,
            chargers: registry.all().map((c) => c.identity),
            pendingFrames: frameWriter.pending,
            pendingMeterValues: meterWriter.pending,
            realtime: realtime.enabled,
            strictMode: config.OCPP_STRICT_MODE,
            node: process.version,
          },
        };
      default:
        return { status: 404, body: { ok: false, error: 'not_found' } };
    }
  };

  return {
    registry,
    logger,
    db,

    async start() {
      // Any rows left by a previous life of this instance are lies now.
      const cleared = await clearStaleConnections(db, config.GATEWAY_INSTANCE);
      if (cleared > 0) {
        logger.warn({ count: cleared }, 'cleared stale connection registrations');
      }

      await commandBus.start();

      httpServer = createServer((req, res) => {
        const { status, body } = requestHandler(req.url);
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      });

      // Chargers and health checks share one port: Fly routes a single
      // internal_port, and one listener is one less thing to misconfigure.
      httpServer.on('upgrade', (req, socket, head) => {
        ocpp.handleUpgrade(req, socket, head);
      });

      await new Promise<void>((resolve, reject) => {
        httpServer!.once('error', reject);
        httpServer!.listen(config.GATEWAY_PORT, () => {
          httpServer!.removeListener('error', reject);
          resolve();
        });
      });

      const port = (httpServer.address() as AddressInfo).port;
      logger.info(
        { port, instance: config.GATEWAY_INSTANCE, strictMode: config.OCPP_STRICT_MODE },
        'gateway listening (health + OCPP)',
      );
      return { port };
    },

    async stop() {
      logger.info('gateway stopping');
      // Order matters: stop accepting work, close sockets, then flush what is
      // still buffered before the database connection goes away.
      await commandBus.stop().catch((err) => logger.error({ err }, 'command bus stop failed'));
      await ocpp.close().catch((err) => logger.error({ err }, 'ocpp close failed'));

      if (httpServer) {
        await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
        httpServer = null;
      }

      await frameWriter.flush();
      await meterWriter.flush();
      await clearStaleConnections(db, config.GATEWAY_INSTANCE).catch(() => 0);
      await db.end({ timeout: 5 });
      logger.info('gateway stopped');
    },
  };
}
