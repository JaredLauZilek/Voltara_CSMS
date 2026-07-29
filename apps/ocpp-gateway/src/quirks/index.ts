import { z } from 'zod';

/**
 * Vendor compatibility flags.
 *
 * Real chargers deviate from the spec in small, specific ways, and the cost of
 * absorbing that in the handlers is a protocol module nobody can read a year
 * later. Deviations live here instead, resolved once per connection from the
 * vendor registry (`charge_point_vendors.quirks`) with per-charger overrides
 * (`charge_points.quirks_override`) layered on top.
 *
 * New flags arrive from real `charger_compat` reports — never speculatively.
 * See apps/ocpp-gateway/CLAUDE.md.
 */
export const quirksSchema = z.object({
  /**
   * Some firmware emits a StatusNotification on connectorId 0 for every
   * connector transition, doubling the status log. connectorId 0 addresses the
   * charge point as a whole, so these carry no per-connector meaning.
   */
  ignoreConnectorZeroStatus: z.boolean().default(false),

  /**
   * A sampledValue with no `unit` means Wh per the spec, but some meters
   * report kWh and omit the unit, which understates energy by 1000x.
   */
  assumeKwhWhenUnitMissing: z.boolean().default(false),

  /** Overrides the heartbeat interval handed back at BootNotification. */
  heartbeatIntervalS: z.number().int().positive().optional(),

  /**
   * Answer StartTransaction with Accepted even when the idTag is unknown.
   * For sites where physical access is the real authorisation (a locked condo
   * basement) and a rejected tag means a resident cannot charge.
   */
  alwaysAuthorize: z.boolean().default(false),
});

export type Quirks = z.infer<typeof quirksSchema>;

export const DEFAULT_QUIRKS: Quirks = quirksSchema.parse({});

/**
 * Merges vendor defaults with per-charger overrides. Unknown keys are dropped
 * rather than throwing: a typo in an operator-entered override must not stop a
 * charger from connecting.
 */
export function resolveQuirks(vendorQuirks: unknown, chargePointOverride: unknown): Quirks {
  const merged = {
    ...(isRecord(vendorQuirks) ? vendorQuirks : {}),
    ...(isRecord(chargePointOverride) ? chargePointOverride : {}),
  };
  const parsed = quirksSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_QUIRKS;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
