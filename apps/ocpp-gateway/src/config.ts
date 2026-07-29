import { hostname } from 'node:os';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // 0 is legal and means "any free port" — the integration suite runs real
  // gateways on ephemeral ports so parallel test files never collide.
  GATEWAY_PORT: z.coerce.number().int().nonnegative().default(9221),
  GATEWAY_INSTANCE: z.string().default(() => hostname()),
  LOG_LEVEL: z.string().default('info'),

  // Realtime broadcast is optional: without it the gateway still records
  // everything, dashboards just don't update live.
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  /**
   * ocpp-rpc validates inbound frames against the official JSON schemas.
   * Configurable because a single non-conforming charger model must be
   * survivable without a redeploy — drop to false, capture frames, then add a
   * quirk. See apps/ocpp-gateway/CLAUDE.md.
   */
  OCPP_STRICT_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Seconds the charger should wait between heartbeats (BootNotification reply). */
  HEARTBEAT_INTERVAL_S: z.coerce.number().int().positive().default(300),

  /** How long to wait for a charger to answer a central-system command. */
  CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  /** Minimum gap between `meter` broadcasts per connector (CLAUDE.md §8). */
  METER_BROADCAST_THROTTLE_MS: z.coerce.number().int().nonnegative().default(5_000),

  /**
   * A StartTransaction whose timestamp is older than this was buffered by the
   * charger while offline and is being replayed, not observed live.
   */
  OFFLINE_REPLAY_THRESHOLD_MS: z.coerce.number().int().positive().default(120_000),
});

export type GatewayConfig = z.infer<typeof envSchema> & { databaseMaxConnections: number };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid gateway configuration — ${issues}`);
  }
  return { ...parsed.data, databaseMaxConnections: 10 };
}
