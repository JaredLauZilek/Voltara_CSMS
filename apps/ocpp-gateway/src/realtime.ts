import {
  BROADCAST_EVENTS,
  siteChannel,
  tenantChannel,
  type CpStatusEvent,
  type MeterEvent,
  type SessionUpdateEvent,
} from '@voltara/shared';
import type { GatewayConfig } from './config.js';
import type { Logger } from './logger.js';

/**
 * Publishes live events to per-tenant private Broadcast channels.
 *
 * Broadcast, not postgres_changes: telemetry fan-out must not be coupled to
 * the WAL, where RLS is re-evaluated per subscriber per change (ADR-0003).
 *
 * Publishing is fire-and-forget by design. A dashboard missing a status flip
 * is a cosmetic problem that the next event or a refetch corrects; a charger
 * whose StatusNotification is delayed because the realtime API was slow is an
 * operational one.
 */
export class RealtimePublisher {
  private readonly endpoint: string | null;
  private readonly key: string | null;
  private readonly meterLastSentAt = new Map<string, number>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly logger: Logger,
  ) {
    this.endpoint = config.SUPABASE_URL
      ? `${config.SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/broadcast`
      : null;
    this.key = config.SUPABASE_SERVICE_ROLE_KEY ?? null;

    if (!this.enabled) {
      logger.warn('realtime broadcast disabled — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    }
  }

  get enabled(): boolean {
    return Boolean(this.endpoint && this.key);
  }

  /**
   * Connector status goes to the tenant's private channel (operators) and,
   * when the charger has a site, to that site's public channel (drivers).
   * The public copy carries the same payload — it holds nothing a public
   * charger directory would not show.
   */
  cpStatus(tenantId: string, payload: CpStatusEvent, locationId?: string | null): void {
    this.send(tenantId, BROADCAST_EVENTS.cpStatus, payload);
    if (locationId) this.sendTo(siteChannel(locationId), BROADCAST_EVENTS.cpStatus, payload);
  }

  sessionUpdate(tenantId: string, payload: SessionUpdateEvent): void {
    this.send(tenantId, BROADCAST_EVENTS.sessionUpdate, payload);
  }

  /**
   * Throttled per connector. Chargers sample as often as every few seconds and
   * a whole tenant's dashboards subscribe to one channel, so unthrottled meter
   * events are the fastest way to exhaust the project's message quota.
   */
  meter(tenantId: string, payload: MeterEvent): void {
    const key = `${payload.chargePointId}:${payload.ocppConnectorId}`;
    const now = Date.now();
    const last = this.meterLastSentAt.get(key) ?? 0;
    if (now - last < this.config.METER_BROADCAST_THROTTLE_MS) return;

    this.meterLastSentAt.set(key, now);
    this.send(tenantId, BROADCAST_EVENTS.meter, payload);
  }

  forgetConnector(chargePointId: string): void {
    for (const key of this.meterLastSentAt.keys()) {
      if (key.startsWith(`${chargePointId}:`)) this.meterLastSentAt.delete(key);
    }
  }

  private send(tenantId: string, event: string, payload: unknown): void {
    this.sendTo(tenantChannel(tenantId), event, payload);
  }

  private sendTo(topic: string, event: string, payload: unknown): void {
    if (!this.endpoint || !this.key) return;

    void fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: true }],
      }),
    })
      .then((res) => {
        if (!res.ok) {
          this.logger.debug({ status: res.status, event }, 'broadcast rejected');
        }
      })
      .catch((err: unknown) => {
        this.logger.debug({ err, event }, 'broadcast failed');
      });
  }
}
