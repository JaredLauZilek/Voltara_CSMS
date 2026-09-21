import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { createRPCError, RPCServer } from 'ocpp-rpc';
import { z } from 'zod';
import { ocpp16 } from '@voltara/shared';
import type { GatewayConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import type { Db } from '../../db/client.js';
import {
  findChargePointForAuth,
  markOffline,
  saveConfigurationSnapshot,
} from '../../db/chargePoints.js';
import { insertConnectionLog, registerConnection, unregisterConnection } from '../../db/logs.js';
import type { BatchWriter, FrameRow, MeterValueRow } from '../../db/writers.js';
import { resolveQuirks } from '../../quirks/index.js';
import type { RealtimePublisher } from '../../realtime.js';
import type { WebhookDispatcher } from '../../webhooks.js';
import type { ChargerConnection, ConnectionRegistry } from '../../registry.js';
import { FrameLogger } from './frameLog.js';
import * as handlers from './handlers.js';
import type { HandlerContext } from './handlers.js';

export interface OcppServerDeps {
  db: Db;
  config: GatewayConfig;
  logger: Logger;
  registry: ConnectionRegistry;
  realtime: RealtimePublisher;
  frameWriter: BatchWriter<FrameRow>;
  meterWriter: BatchWriter<MeterValueRow>;
  webhooks: WebhookDispatcher;
  /** Invoked when a charger connects, so queued commands can be dispatched. */
  onChargerConnected?: (connection: ChargerConnection) => void;
}

/** ocpp-rpc's readyState for an open socket (mirrors WebSocket.OPEN). */
const OPEN_STATE = 1;

/** Rejects repeated failed connection attempts from the same identity. */
class AttemptLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 60_000,
  ) {}

  hit(identity: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(identity);
    if (!entry || entry.resetAt < now) {
      this.attempts.set(identity, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  clear(identity: string): void {
    this.attempts.delete(identity);
  }
}

export interface OcppServer {
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  close: () => Promise<void>;
}

export function createOcppServer(deps: OcppServerDeps): OcppServer {
  const { db, config, logger, registry, realtime, frameWriter, meterWriter, webhooks } = deps;
  const limiter = new AttemptLimiter();

  const rpcServer = new RPCServer({
    protocols: [ocpp16.OCPP16_SUBPROTOCOL],
    strictMode: config.OCPP_STRICT_MODE,
    callTimeoutMs: config.CALL_TIMEOUT_MS,
    // Chargers on flaky mobile links go quiet; pings detect a half-open socket
    // long before TCP would.
    pingIntervalMs: 60_000,
    deferPingsOnActivity: true,
  });

  // ── Authentication (OCPP Security Profile 2: WSS + Basic Auth) ────────────
  rpcServer.auth((accept, reject, handshake) => {
    const identity = handshake.identity;
    const password = handshake.password ? handshake.password.toString('utf8') : null;
    const remoteAddress = handshake.remoteAddress ?? null;
    const log = logger.child({ cp: identity, remoteAddress });

    void (async () => {
      try {
        if (!limiter.hit(identity)) {
          log.warn('connection attempt rate limited');
          reject(429, 'Too many attempts');
          return;
        }

        const cp = await findChargePointForAuth(db, identity, password);

        if (!cp) {
          // Deliberately the same response as a bad key: a probe must not be
          // able to enumerate which charge point identities exist.
          log.warn('rejected: unknown charge point identity');
          reject(401, 'Unauthorized');
          return;
        }

        if (cp.lifecycle === 'decommissioned') {
          log.warn('rejected: charge point decommissioned');
          await insertConnectionLog(db, {
            tenantId: cp.tenant_id,
            chargePointId: cp.id,
            event: 'rejected',
            gatewayInstance: config.GATEWAY_INSTANCE,
            remoteAddress,
            closeReason: 'decommissioned',
          });
          reject(403, 'Forbidden');
          return;
        }

        // TLS enforcement, per charger. Fly terminates TLS at its edge and
        // reports the original scheme in x-forwarded-proto. Security Profile 2
        // (the default) requires wss://; a plaintext ws:// connection is only
        // accepted for chargers explicitly flagged security_profile = 1 —
        // the commissioning/legacy escape hatch (CLAUDE.md §10). When the
        // header is absent there is no proxy (local dev, tests), so we cannot
        // and do not judge the transport.
        const rawProto = handshake.headers['x-forwarded-proto'];
        const forwardedProto = (Array.isArray(rawProto) ? rawProto[0] : (rawProto ?? ''))
          .split(',')[0]
          .trim()
          .toLowerCase();
        if (cp.security_profile >= 2 && forwardedProto === 'http') {
          // Rejecting here — with a recorded reason — beats a redirect the
          // charger cannot follow: the operator can see WHY it failed.
          log.warn('rejected: plaintext ws:// but security profile 2 requires TLS');
          await insertConnectionLog(db, {
            tenantId: cp.tenant_id,
            chargePointId: cp.id,
            event: 'rejected',
            gatewayInstance: config.GATEWAY_INSTANCE,
            remoteAddress,
            closeReason: 'tls required (security profile 2)',
          });
          reject(426, 'TLS required');
          return;
        }
        if (forwardedProto === 'http') {
          log.warn('accepting PLAINTEXT ws:// connection (security profile 1)');
        }

        // Security profile 0: identity-only. The charger is trusted on its ID
        // alone — regional-incumbent parity, and the easiest commissioning
        // rung. Whatever credentials it may or may not send are ignored.
        if (cp.security_profile === 0) {
          log.info('accepting identity-only connection (security profile 0)');
          limiter.clear(identity);
          accept({
            chargePointId: cp.id,
            tenantId: cp.tenant_id,
            identity,
            remoteAddress,
            quirks: resolveQuirks(cp.vendor_quirks, cp.quirks_override),
          });
          return;
        }

        if (!cp.has_key) {
          log.warn('rejected: no auth key registered');
          reject(401, 'Unauthorized');
          return;
        }

        if (!cp.key_ok) {
          // Three different commissioning failures hide behind one wrong
          // password, and the operator can only fix the one they can see:
          //  - no Authorization header at all — common when firmware ties its
          //    auth fields to a TLS toggle that has been switched off;
          //  - header present but the username ≠ the charge point ID — the
          //    parser then yields no password (the OCPP spec requires
          //    username == identity);
          //  - a password was presented but is wrong — its LENGTH (never its
          //    value) is logged, because silent truncation by firmware is a
          //    known failure mode for 32-char keys.
          // The charger still receives an undifferentiated 401 either way.
          const authHeaderPresent = Boolean(handshake.headers.authorization);
          const reason =
            password === null
              ? authHeaderPresent
                ? 'auth username does not match the charge point id'
                : 'no credentials presented'
              : `bad credentials (password length ${password.length}, expected 32)`;
          log.warn({ reason }, 'rejected: authentication failed');
          await insertConnectionLog(db, {
            tenantId: cp.tenant_id,
            chargePointId: cp.id,
            event: 'rejected',
            gatewayInstance: config.GATEWAY_INSTANCE,
            remoteAddress,
            closeReason: reason,
          });
          reject(401, 'Unauthorized');
          return;
        }

        limiter.clear(identity);
        accept({
          chargePointId: cp.id,
          tenantId: cp.tenant_id,
          identity,
          remoteAddress,
          quirks: resolveQuirks(cp.vendor_quirks, cp.quirks_override),
        });
      } catch (err) {
        log.error({ err }, 'auth failed unexpectedly');
        reject(500, 'Internal error');
      }
    })();
  });

  // ── Per-connection wiring ─────────────────────────────────────────────────
  rpcServer.on('client', (client) => {
    const session = client.session as {
      chargePointId: string;
      tenantId: string;
      identity: string;
      remoteAddress: string | null;
      quirks: ReturnType<typeof resolveQuirks>;
    };

    const log = logger.child({ cp: session.identity, tenant: session.tenantId });
    const frameLogger = new FrameLogger(frameWriter, session.tenantId, session.chargePointId);

    const connection: ChargerConnection = {
      identity: session.identity,
      chargePointId: session.chargePointId,
      tenantId: session.tenantId,
      quirks: session.quirks,
      remoteAddress: session.remoteAddress,
      connectedAt: new Date(),
      isOpen: () => client.state === OPEN_STATE,
      // Timeout passed per call rather than relying on the server-level
      // default: a wedged charger that holds the socket open but never answers
      // must not leave a command pending indefinitely.
      call: (action, payload) =>
        client.call(action, payload, { callTimeoutMs: config.CALL_TIMEOUT_MS }),
      close: async () => {
        await client.close({ code: 1000, reason: 'Gateway shutdown' });
      },
    };

    // Every frame, both directions, before anything else can drop it.
    client.on('message', ({ message, outbound }: { message: string; outbound: boolean }) => {
      frameLogger.record(message, outbound);
    });

    const ctx: HandlerContext = {
      db,
      config,
      logger: log,
      realtime,
      meterWriter,
      webhooks,
      connection,
    };

    registerHandlers(client, ctx, deps);

    registry.add(connection);
    log.info('charger connected');

    void (async () => {
      try {
        await registerConnection(db, {
          ocppIdentity: session.identity,
          chargePointId: session.chargePointId,
          tenantId: session.tenantId,
          gatewayInstance: config.GATEWAY_INSTANCE,
        });
        await insertConnectionLog(db, {
          tenantId: session.tenantId,
          chargePointId: session.chargePointId,
          event: 'connected',
          gatewayInstance: config.GATEWAY_INSTANCE,
          remoteAddress: session.remoteAddress,
        });
      } catch (err) {
        log.error({ err }, 'failed to record connection');
      }
      deps.onChargerConnected?.(connection);
    })();

    client.on('close', ({ code, reason }: { code: number; reason: string }) => {
      const removed = registry.remove(session.identity);
      frameLogger.dispose();
      realtime.forgetConnector(session.chargePointId);
      log.info({ code, reason }, 'charger disconnected');

      // Only mark the charger offline if this socket is still the current one;
      // a reconnect may already have superseded it.
      const stillCurrent = removed !== null;

      void (async () => {
        try {
          await frameWriter.flush();
          await insertConnectionLog(db, {
            tenantId: session.tenantId,
            chargePointId: session.chargePointId,
            event: 'disconnected',
            gatewayInstance: config.GATEWAY_INSTANCE,
            remoteAddress: session.remoteAddress,
            closeCode: code,
            closeReason: reason || null,
          });
          if (stillCurrent && !registry.getByIdentity(session.identity)) {
            await unregisterConnection(db, session.identity, config.GATEWAY_INSTANCE);
            await markOffline(db, session.chargePointId);
            realtime.cpStatus(session.tenantId, {
              chargePointId: session.chargePointId,
              ocppIdentity: session.identity,
              connectionState: 'offline',
              at: new Date().toISOString(),
            });
          }
        } catch (err) {
          log.error({ err }, 'failed to record disconnection');
        }
      })();
    });
  });

  rpcServer.on('error', (err: unknown) => {
    logger.error({ err }, 'rpc server error');
  });

  return {
    handleUpgrade: (req, socket, head) => {
      void rpcServer.handleUpgrade(req, socket as never, head);
    },
    close: async () => {
      await rpcServer.close({ code: 1001, reason: 'Gateway shutting down', awaitPending: false });
    },
  };
}

// ── Handler registration ────────────────────────────────────────────────────

type RpcClient = {
  handle: (
    method: string | ((opts: { method?: string }) => unknown),
    handler?: (opts: { params?: unknown }) => unknown,
  ) => void;
  call: (
    action: string,
    payload: unknown,
    options?: { callTimeoutMs?: number },
  ) => Promise<unknown>;
  on: (event: string, cb: (...args: never[]) => void) => void;
  session: Record<string, unknown>;
};

function registerHandlers(client: RpcClient, ctx: HandlerContext, deps: OcppServerDeps): void {
  const wrap =
    (name: string, fn: (ctx: HandlerContext, params: unknown) => Promise<unknown>) =>
    async ({ params }: { params?: unknown }) => {
      try {
        return await fn(ctx, params);
      } catch (err) {
        throw toRpcError(name, err, ctx);
      }
    };

  client.handle('BootNotification', async ({ params }: { params?: unknown }) => {
    let result;
    try {
      result = await handlers.handleBootNotification(ctx, params);
    } catch (err) {
      throw toRpcError('BootNotification', err, ctx);
    }
    // Snapshot the charger's configuration shortly after boot — not inline,
    // because the charger is still finishing its own start-up and a command
    // sent now is commonly ignored.
    scheduleConfigurationSnapshot(client, ctx, deps);
    return result;
  });

  client.handle(
    'Heartbeat',
    wrap('Heartbeat', (c) => handlers.handleHeartbeat(c)),
  );
  client.handle(
    'StatusNotification',
    wrap('StatusNotification', handlers.handleStatusNotification),
  );
  client.handle('Authorize', wrap('Authorize', handlers.handleAuthorize));
  client.handle('StartTransaction', wrap('StartTransaction', handlers.handleStartTransaction));
  client.handle('StopTransaction', wrap('StopTransaction', handlers.handleStopTransaction));
  client.handle('MeterValues', wrap('MeterValues', handlers.handleMeterValues));
  client.handle('DataTransfer', wrap('DataTransfer', handlers.handleDataTransfer));

  // Anything else is answered with a spec-correct NotImplemented rather than a
  // timeout, so the charger stops retrying and the frame log shows why.
  client.handle(({ method }: { method?: string }) => {
    ctx.logger.warn({ action: method }, 'unhandled OCPP action');
    throw createRPCError('NotImplemented', `${method} is not supported`);
  });
}

/**
 * Maps handler failures onto OCPP error codes. A payload our schemas reject is
 * the charger's fault (FormationViolation); anything else is ours
 * (InternalError) and must not be reported as the charger's problem.
 */
function toRpcError(action: string, err: unknown, ctx: HandlerContext): Error {
  if (err instanceof z.ZodError) {
    ctx.logger.warn({ action, issues: err.issues }, 'rejected malformed payload');
    // createRPCError returns a real RPCError subclass; its .d.ts is looser
    // than the implementation, hence the cast.
    return createRPCError('FormationViolation', `Invalid ${action} payload`, {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }) as unknown as Error;
  }
  ctx.logger.error({ action, err }, 'handler failed');
  return createRPCError('InternalError', `Failed to process ${action}`) as unknown as Error;
}

function scheduleConfigurationSnapshot(
  client: RpcClient,
  ctx: HandlerContext,
  deps: OcppServerDeps,
): void {
  setTimeout(() => {
    void (async () => {
      try {
        const response = (await client.call('GetConfiguration', {})) as {
          configurationKey?: { key: string; value?: string; readonly?: boolean }[];
          unknownKey?: string[];
        };
        const snapshot: Record<string, unknown> = {};
        for (const entry of response?.configurationKey ?? []) {
          // Never persist the charger's own credential.
          snapshot[entry.key] = ocpp16.isSecretConfigKey(entry.key) ? '[redacted]' : entry.value;
        }
        await saveConfigurationSnapshot(deps.db, ctx.connection.chargePointId, snapshot);
        ctx.logger.info({ keys: Object.keys(snapshot).length }, 'configuration snapshot stored');
      } catch (err) {
        // Plenty of chargers do not implement GetConfiguration; that is not an
        // error worth waking anyone for.
        ctx.logger.debug({ err }, 'configuration snapshot unavailable');
      }
    })();
  }, 1_500).unref();
}
