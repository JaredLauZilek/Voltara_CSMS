import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from './db/client.js';
import type { Logger } from './logger.js';

/**
 * Tenant webhooks (Phase 3 skeleton): `session.completed` today, more later.
 *
 * Every event becomes a `webhook_deliveries` row first, then an HTTP POST
 * signed with HMAC-SHA256 over the exact body. A failed attempt is retried
 * with exponential backoff by the sweep; after MAX_ATTEMPTS it is marked
 * failed and left for the admin to inspect. Delivery is never awaited by
 * OCPP handlers — a slow partner endpoint must not slow a charger.
 */
export const WEBHOOK_SIGNATURE_HEADER = 'x-voltara-signature';
const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 10_000;

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** For receivers (and tests): constant-time comparison of a signature header. */
export function verifyWebhookSignature(secret: string, body: string, header: string): boolean {
  const expected = Buffer.from(signWebhookBody(secret, body));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  event: string;
  payload: unknown;
  attempts: number;
  url: string;
  secret: string;
}

export class WebhookDispatcher {
  private sweep: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly logger: Logger,
    private readonly sweepIntervalMs = 60_000,
  ) {}

  start(): void {
    this.sweep = setInterval(() => void this.deliverDue(), this.sweepIntervalMs);
    this.sweep.unref();
  }

  async stop(): Promise<void> {
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
  }

  /** Records the event for every subscribed endpoint and attempts delivery now. */
  emit(tenantId: string, event: string, payload: Record<string, unknown>): void {
    void (async () => {
      try {
        const rows = await this.db<DeliveryRow[]>`
          insert into public.webhook_deliveries (tenant_id, webhook_id, event, payload)
          select w.tenant_id, w.id, ${event}, ${this.db.json({ event, ...payload } as never)}
          from public.webhooks w
          where w.tenant_id = ${tenantId} and w.active and ${event} = any (w.events)
          returning id, webhook_id, event, payload, attempts,
            (select url from public.webhooks x where x.id = webhook_id) as url,
            (select secret from public.webhooks x where x.id = webhook_id) as secret
        `;
        for (const row of rows) await this.deliver(row);
      } catch (err) {
        this.logger.error({ err, event }, 'webhook emit failed');
      }
    })();
  }

  /** Retries anything pending whose backoff has elapsed. */
  async deliverDue(): Promise<void> {
    const rows = await this.db<DeliveryRow[]>`
      select d.id, d.webhook_id, d.event, d.payload, d.attempts, w.url, w.secret
      from public.webhook_deliveries d
      join public.webhooks w on w.id = d.webhook_id
      where d.status = 'pending' and d.next_attempt_at <= now() and w.active
      order by d.next_attempt_at
      limit 25
    `;
    for (const row of rows) await this.deliver(row);
  }

  private async deliver(row: DeliveryRow): Promise<void> {
    const body = JSON.stringify(row.payload);
    const attempt = row.attempts + 1;
    let statusCode: number | null = null;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(row.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'voltara-csms-webhooks/1',
          'x-voltara-event': row.event,
          'x-voltara-delivery': row.id,
          [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(row.secret, body),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      statusCode = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (!error) {
      await this.db`
        update public.webhook_deliveries
        set status = 'delivered', attempts = ${attempt}, last_status_code = ${statusCode},
            last_error = null, delivered_at = now()
        where id = ${row.id}
      `;
      return;
    }

    const exhausted = attempt >= MAX_ATTEMPTS;
    // 1, 2, 4, 8 minutes between attempts.
    const backoffMinutes = 2 ** (attempt - 1);
    await this.db`
      update public.webhook_deliveries
      set status = ${exhausted ? 'failed' : 'pending'},
          attempts = ${attempt},
          last_status_code = ${statusCode},
          last_error = ${error},
          next_attempt_at = now() + (${backoffMinutes}::text || ' minutes')::interval
      where id = ${row.id}
    `;
    this.logger.warn({ deliveryId: row.id, attempt, error, exhausted }, 'webhook delivery failed');
  }
}
