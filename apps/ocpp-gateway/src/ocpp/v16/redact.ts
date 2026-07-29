import { ocpp16 } from '@voltara/shared';

const REDACTED = '[redacted]';

/**
 * Strips credentials from a payload before it is persisted to the frame log.
 *
 * The frame log is deliberately verbatim — it is the evidence that settles
 * arguments with charger vendors — which makes it exactly the wrong place for
 * the charger's own Basic Auth key. `AuthorizationKey` travels in
 * ChangeConfiguration when we rotate a key, and comes back in GetConfiguration
 * responses; both shapes are handled here. See CLAUDE.md §6, §10.
 */
export function redactPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map(redactPayload);
  if (typeof payload !== 'object') return payload;

  const source = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // ChangeConfiguration.req and each entry of GetConfiguration.conf share the
  // same {key, value} shape, so one rule covers both directions.
  if (ocpp16.isSecretConfigKey(source.key) && 'value' in source) {
    for (const [k, v] of Object.entries(source)) {
      out[k] = k === 'value' ? REDACTED : redactPayload(v);
    }
    return out;
  }

  for (const [k, v] of Object.entries(source)) {
    out[k] = ocpp16.isSecretConfigKey(k) ? REDACTED : redactPayload(v);
  }
  return out;
}
