import type { Logger } from '../logger.js';
import type { Db } from './client.js';

/**
 * Buffers rows and inserts them in batches.
 *
 * Frame logging and meter values are the two highest-volume writes in the
 * system — a fleet of 500 connectors sampling every 30s produces tens of
 * millions of rows a month. One INSERT per sample would spend the connection
 * pool on round-trips; batching turns that into a few multi-row inserts a
 * second.
 *
 * Correctness note: a batch buffered in memory is lost if the process dies.
 * That is an accepted trade for telemetry and frame logs — neither is billable
 * (energy comes from the meter register on StopTransaction) — but it is why
 * sessions are written synchronously and never go through here.
 */
export class BatchWriter<T> {
  private buffer: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly name: string,
    private readonly flushFn: (rows: T[]) => Promise<void>,
    private readonly logger: Logger,
    private readonly maxBatch = 500,
    private readonly flushIntervalMs = 1_000,
  ) {}

  add(row: T): void {
    this.buffer.push(row);
    if (this.buffer.length >= this.maxBatch) {
      void this.flush();
      return;
    }
    this.timer ??= setTimeout(() => void this.flush(), this.flushIntervalMs).unref();
  }

  /** Drains the buffer. Safe to call concurrently; overlapping calls queue. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) {
      await this.flushing;
      if (this.buffer.length === 0) return;
    }
    if (this.buffer.length === 0) return;

    const rows = this.buffer;
    this.buffer = [];
    this.flushing = this.flushFn(rows)
      .catch((err) => {
        // Dropping telemetry is survivable; crashing the gateway and taking
        // every charger connection with it is not.
        this.logger.error({ err, writer: this.name, dropped: rows.length }, 'batch write failed');
      })
      .finally(() => {
        this.flushing = null;
      });

    await this.flushing;
  }

  get pending(): number {
    return this.buffer.length;
  }
}

// ── Raw OCPP frames ─────────────────────────────────────────────────────────

export interface FrameRow {
  tenant_id: string;
  charge_point_id: string;
  direction: 'in' | 'out';
  message_type: number;
  action: string | null;
  ocpp_message_id: string | null;
  payload: unknown;
  error_code: string | null;
  error_description: string | null;
  recorded_at: Date;
}

export function createFrameWriter(db: Db, logger: Logger): BatchWriter<FrameRow> {
  return new BatchWriter<FrameRow>(
    'ocpp_messages',
    async (rows) => {
      await db`
        insert into public.ocpp_messages ${db(
          rows.map((r) => ({
            tenant_id: r.tenant_id,
            charge_point_id: r.charge_point_id,
            direction: r.direction,
            message_type: r.message_type,
            action: r.action,
            ocpp_message_id: r.ocpp_message_id,
            payload: r.payload === undefined ? null : db.json(r.payload as never),
            error_code: r.error_code,
            error_description: r.error_description,
            recorded_at: r.recorded_at,
          })),
        )}
      `;
    },
    logger,
  );
}

// ── Meter values ────────────────────────────────────────────────────────────

export interface MeterValueRow {
  tenant_id: string;
  charge_point_id: string;
  charging_session_id: string | null;
  ocpp_connector_id: number;
  sampled_at: Date;
  measurand: string;
  phase: string | null;
  location: string | null;
  unit: string | null;
  value: number;
  context: string | null;
  format: string | null;
}

export function createMeterValueWriter(db: Db, logger: Logger): BatchWriter<MeterValueRow> {
  return new BatchWriter<MeterValueRow>(
    'meter_values',
    async (rows) => {
      await db`insert into public.meter_values ${db(rows as unknown as readonly Record<string, unknown>[])}`;
    },
    logger,
  );
}
