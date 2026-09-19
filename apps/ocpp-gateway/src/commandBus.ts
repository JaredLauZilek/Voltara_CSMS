import { ocpp16, type RemoteCommandAction } from '@voltara/shared';
import type { Db } from './db/client.js';
import {
  claimCommand,
  completeCommand,
  COMMAND_CHANNEL,
  expireStrandedCommands,
  fetchCommand,
  listQueuedForChargePoint,
  type RemoteCommandRow,
} from './db/commands.js';
import { findConnectionOwner } from './db/logs.js';
import { mergeConfigurationSnapshot } from './db/chargePoints.js';
import type { GatewayConfig } from './config.js';
import type { Logger } from './logger.js';
import type { ChargerConnection, ConnectionRegistry } from './registry.js';

/**
 * Carries commands from the admin app to chargers.
 *
 * The admin app never talks to the gateway directly — it inserts a row into
 * `remote_commands`, a trigger fires pg_notify, and whichever gateway holds
 * that charger's socket picks it up (CLAUDE.md §6). That indirection is what
 * lets the gateway restart, move, or scale out without the API changing.
 */
export class CommandBus {
  private subscription: { unlisten: () => Promise<void> } | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: GatewayConfig,
    private readonly logger: Logger,
    private readonly registry: ConnectionRegistry,
  ) {}

  async start(): Promise<void> {
    const stranded = await expireStrandedCommands(this.db);
    if (stranded > 0) {
      this.logger.warn({ count: stranded }, 'failed commands stranded by a previous run');
    }

    this.subscription = await this.db.listen(COMMAND_CHANNEL, (payload) => {
      void this.dispatchById(payload);
    });

    this.logger.info({ channel: COMMAND_CHANNEL }, 'command bus listening');
  }

  async stop(): Promise<void> {
    await this.subscription?.unlisten();
    this.subscription = null;
  }

  /**
   * Drains anything queued for a charger that just connected. Covers both the
   * race where a command is issued microseconds before the socket is ready and
   * the case where it was issued while the charger was away.
   */
  onChargerConnected(connection: ChargerConnection): void {
    void (async () => {
      try {
        const queued = await listQueuedForChargePoint(this.db, connection.chargePointId);
        for (const command of queued) await this.dispatch(command);
      } catch (err) {
        this.logger.error({ err, cp: connection.identity }, 'failed to drain queued commands');
      }
    })();
  }

  private async dispatchById(commandId: string): Promise<void> {
    try {
      const command = await fetchCommand(this.db, commandId);
      if (!command) {
        this.logger.warn({ commandId }, 'notified about an unknown command');
        return;
      }
      await this.dispatch(command);
    } catch (err) {
      this.logger.error({ err, commandId }, 'command dispatch failed');
    }
  }

  private async dispatch(command: RemoteCommandRow): Promise<void> {
    const log = this.logger.child({ commandId: command.id, action: command.action });
    // `charge_point_connections` — not local memory — decides who owns this
    // charger. Every instance receives every notification, and an instance
    // holding a stale entry would otherwise claim a command it cannot deliver,
    // blocking it until its own call timeout while the instance that really
    // owns the socket stands by.
    const owner = await findConnectionOwner(this.db, command.charge_point_id);

    if (owner && owner !== this.config.GATEWAY_INSTANCE) {
      log.debug({ owner }, 'ignoring command owned by another gateway instance');
      return;
    }

    const connection = this.registry.getByChargePointId(command.charge_point_id);
    const usable = connection?.isOpen() ? connection : null;

    if (connection && !usable) {
      log.warn({ cp: connection.identity }, 'discarding registry entry for a closed socket');
      this.registry.remove(connection.identity);
    }

    if (!usable) {
      // Honest immediate feedback beats a command sitting queued invisibly:
      // the operator sees the charger is offline and can retry when it returns.
      await completeCommand(this.db, command.id, 'failed', {
        error: 'Charge point is not connected',
      });
      log.info({ owner }, 'rejected: charger not connected');
      return;
    }

    const action = command.action as RemoteCommandAction;
    const schema = ocpp16.CS_REQUEST_SCHEMAS[action];
    if (!schema) {
      await completeCommand(this.db, command.id, 'failed', {
        error: `Unsupported action ${command.action}`,
      });
      return;
    }

    const parsed = schema.safeParse(command.payload ?? {});
    if (!parsed.success) {
      await completeCommand(this.db, command.id, 'failed', {
        error: `Invalid payload: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      });
      log.warn({ issues: parsed.error.issues }, 'rejected malformed command payload');
      return;
    }

    // Compare-and-set: only the instance that flips queued→sent proceeds.
    const claimed = await claimCommand(this.db, command.id);
    if (!claimed) {
      log.debug('command already claimed elsewhere');
      return;
    }

    try {
      const response = await usable.call(action, parsed.data);
      const outcome = ocpp16.readCommandOutcome(action, response);
      // The command row holds the raw answer for the operator; the charger's
      // config snapshot is the durable view, so keep it current too.
      await this.applyConfigurationSideEffects(command, action, parsed.data, response, outcome);
      await completeCommand(this.db, command.id, outcome, { response });
      log.info({ outcome }, 'command answered');
    } catch (err) {
      const timedOut = err instanceof Error && /timeout/i.test(err.name + err.message);
      await completeCommand(this.db, command.id, timedOut ? 'timeout' : 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      log.warn({ err, timedOut }, 'command failed');
    }
  }

  /**
   * GetConfiguration refreshes the whole snapshot; an accepted
   * ChangeConfiguration (including RebootRequired — the charger has stored it)
   * updates one key. AuthorizationKey values are redacted either way.
   */
  private async applyConfigurationSideEffects(
    command: RemoteCommandRow,
    action: RemoteCommandAction,
    request: unknown,
    response: unknown,
    outcome: 'accepted' | 'rejected',
  ): Promise<void> {
    if (action === 'GetConfiguration') {
      const conf = response as {
        configurationKey?: { key: string; value?: string; readonly?: boolean }[];
      };
      const entries = conf?.configurationKey ?? [];
      if (entries.length === 0) return;
      const snapshot: Record<string, unknown> = {};
      for (const entry of entries) {
        snapshot[entry.key] = ocpp16.isSecretConfigKey(entry.key) ? '[redacted]' : entry.value;
      }
      const req = request as { key?: string[] };
      // A targeted GetConfiguration only answers for the keys asked; merge
      // rather than replace so the rest of the snapshot survives.
      await mergeConfigurationSnapshot(this.db, command.charge_point_id, snapshot, {
        replace: !req.key || req.key.length === 0,
      });
      return;
    }

    if (action === 'ChangeConfiguration') {
      const status = (response as { status?: string })?.status;
      if (outcome !== 'accepted' && status !== 'RebootRequired') return;
      const req = request as { key: string; value: string };
      await mergeConfigurationSnapshot(
        this.db,
        command.charge_point_id,
        { [req.key]: ocpp16.isSecretConfigKey(req.key) ? '[redacted]' : req.value },
        { replace: false },
      );
    }
  }

  /** Exposed for /statusz. */
  get channel(): string {
    return COMMAND_CHANNEL;
  }

  get instance(): string {
    return this.config.GATEWAY_INSTANCE;
  }
}
