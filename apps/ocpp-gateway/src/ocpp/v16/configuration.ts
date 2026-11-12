import { ocpp16 } from '@voltara/shared';

/** What we persist from a GetConfiguration answer. */
export interface ConfigurationSnapshot {
  /** key → value, with the charger's own credential redacted. */
  values: Record<string, unknown>;
  /** Every key the charger answered for. */
  reportedKeys: string[];
  /** The subset it flagged readonly — the admin must not offer to edit these. */
  readonlyKeys: string[];
}

/**
 * Turns a 1.6 GetConfiguration response into the domain snapshot. Both the
 * boot-time read (server.ts) and an operator's refresh (commandBus.ts) go
 * through here, so the wire shape stays inside ocpp/v16/ (CLAUDE.md §6).
 */
export function configurationSnapshot(response: unknown): ConfigurationSnapshot {
  const entries =
    (response as { configurationKey?: { key: string; value?: string; readonly?: boolean }[] })
      ?.configurationKey ?? [];
  const values: Record<string, unknown> = {};
  const readonlyKeys: string[] = [];
  for (const entry of entries) {
    // Never persist the charger's own credential.
    values[entry.key] = ocpp16.isSecretConfigKey(entry.key) ? '[redacted]' : entry.value;
    if (entry.readonly) readonlyKeys.push(entry.key);
  }
  return { values, reportedKeys: Object.keys(values), readonlyKeys };
}
