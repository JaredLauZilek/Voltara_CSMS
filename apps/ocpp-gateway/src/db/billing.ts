import { billing } from '@voltara/shared';
import type { Queryable } from './client.js';

/**
 * Tariff resolution at StartTransaction (docs/phase3-billing-design.md §3).
 *
 * One query answers "which tariff applies to this driver, on this connector,
 * right now": payer from the ID tag, the driver groups that payer belongs to,
 * then the most specific matching assignment — connector › charge point ›
 * location › tenant; within a scope, a group match beats ad-hoc, which beats
 * 'all'; then priority; then newest. The tariff's LATEST version is used and
 * frozen into the session as a snapshot; nothing after this instant can move
 * the price of a running session.
 */
export interface ResolvedTariff {
  snapshot: billing.TariffSnapshot;
  tariffId: string;
  tariffVersionId: string;
  billingAccountId: string | null;
  driverGroupId: string | null;
}

interface ResolveRow {
  assignment_id: string;
  tariff_id: string;
  scope_type: string;
  audience: string;
  driver_group_id: string | null;
  billing_account_id: string | null;
  name: string;
  currency: string;
  tariff_version_id: string;
  version: number;
  elements: unknown;
  min_price_sen: string | number | null;
  max_price_sen: string | number | null;
  tax_included: boolean;
  display_text: string | null;
  tax_rate_bps: number;
  tax_code: string;
  timezone: string;
}

export async function resolveTariff(
  db: Queryable,
  input: {
    tenantId: string;
    chargePointId: string;
    connectorId: string | null;
    idTagId: string | null;
  },
): Promise<ResolvedTariff | null> {
  const rows = await db<ResolveRow[]>`
    with cp as (
      select location_id from public.charge_points where id = ${input.chargePointId}
    ),
    payer as (
      select t.billing_account_id
      from public.id_tags t
      where t.id = ${input.idTagId}::uuid
    ),
    groups as (
      select distinct m.driver_group_id
      from public.driver_group_members m
      where m.tenant_id = ${input.tenantId}
        and (
          m.id_tag_id = ${input.idTagId}::uuid
          or (m.billing_account_id is not null
              and m.billing_account_id = (select billing_account_id from payer))
        )
    ),
    candidates as (
      select a.id, a.tariff_id, a.scope_type, a.audience, a.driver_group_id, a.priority, a.created_at,
             case a.scope_type
               when 'connector' then 4 when 'charge_point' then 3 when 'location' then 2 else 1
             end as scope_rank,
             case a.audience when 'group' then 3 when 'ad_hoc' then 2 else 1 end as audience_rank
      from public.tariff_assignments a
      where a.tenant_id = ${input.tenantId}
        and a.valid_from <= now()
        and (a.valid_to is null or a.valid_to > now())
        and (
          a.scope_type = 'tenant'
          or (a.scope_type = 'location' and a.location_id = (select location_id from cp))
          or (a.scope_type = 'charge_point' and a.charge_point_id = ${input.chargePointId})
          or (a.scope_type = 'connector' and a.connector_id = ${input.connectorId}::uuid)
        )
        and (
          a.audience = 'all'
          or (a.audience = 'group' and a.driver_group_id in (select driver_group_id from groups))
          or (a.audience = 'ad_hoc' and not exists (select 1 from groups))
        )
    )
    select c.id as assignment_id, c.tariff_id, c.scope_type, c.audience, c.driver_group_id,
           (select billing_account_id from payer) as billing_account_id,
           t.name, t.currency,
           v.id as tariff_version_id, v.version, v.elements, v.min_price_sen, v.max_price_sen,
           v.tax_included, v.display_text,
           coalesce(tp.rate_bps, dtp.rate_bps, 0) as tax_rate_bps,
           coalesce(tp.code, dtp.code, 'SST') as tax_code,
           coalesce((select l.timezone from public.locations l where l.id = (select location_id from cp)), 'Asia/Kuala_Lumpur') as timezone
    from candidates c
    join public.tariffs t on t.id = c.tariff_id and t.status = 'active'
    join lateral (
      select * from public.tariff_versions v where v.tariff_id = t.id order by v.version desc limit 1
    ) v on true
    left join public.tax_profiles tp on tp.id = v.tax_profile_id
    left join public.tax_profiles dtp on dtp.tenant_id = ${input.tenantId} and dtp.is_default
    order by c.scope_rank desc, c.audience_rank desc, c.priority desc, c.created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const snapshot = billing.tariffSnapshotSchema.parse({
    tariff_id: row.tariff_id,
    tariff_version_id: row.tariff_version_id,
    version: row.version,
    name: row.name,
    display_text: row.display_text,
    currency: row.currency,
    elements: row.elements,
    min_price_sen: row.min_price_sen === null ? null : Number(row.min_price_sen),
    max_price_sen: row.max_price_sen === null ? null : Number(row.max_price_sen),
    tax_included: row.tax_included,
    tax_rate_bps: row.tax_rate_bps,
    tax_code: row.tax_code,
    timezone: row.timezone,
    resolved_by: {
      assignment_id: row.assignment_id,
      scope_type: row.scope_type,
      audience: row.audience,
      driver_group_id: row.driver_group_id,
    },
  });

  return {
    snapshot,
    tariffId: row.tariff_id,
    tariffVersionId: row.tariff_version_id,
    billingAccountId: row.billing_account_id,
    driverGroupId: row.audience === 'group' ? row.driver_group_id : null,
  };
}

/**
 * Records the moment the EV stopped drawing power. Charging again clears it,
 * so idle time is measured from the LAST time charging ended to the stop.
 */
export async function markChargingEnded(
  db: Queryable,
  sessionId: string,
  at: Date,
  ended: boolean,
): Promise<void> {
  if (ended) {
    await db`
      update public.charging_sessions
      set charging_ended_at = coalesce(charging_ended_at, ${at})
      where id = ${sessionId} and ended_at is null
    `;
  } else {
    await db`
      update public.charging_sessions
      set charging_ended_at = null
      where id = ${sessionId} and ended_at is null
    `;
  }
}

/** Cumulative energy register samples for a session, oldest first (Wh). */
export async function listEnergySamples(
  db: Queryable,
  sessionId: string,
): Promise<{ at: string; energyWh: number }[]> {
  const rows = await db<{ sampled_at: Date; value: string }[]>`
    select sampled_at, value
    from public.meter_values
    where charging_session_id = ${sessionId}
      and measurand = 'Energy.Active.Import.Register'
      and (phase is null or phase = '')
    order by sampled_at asc
  `;
  return rows.map((r) => ({ at: new Date(r.sampled_at).toISOString(), energyWh: Number(r.value) }));
}

export interface CdrInsert {
  tenantId: string;
  chargingSessionId: string | null;
  chargePointId: string;
  ocppConnectorId: number;
  billingAccountId: string | null;
  driverGroupId: string | null;
  idTag: string | null;
  authMethod: 'whitelist' | 'auth_request' | 'command' | 'ad_hoc';
  startAt: Date;
  endAt: Date;
  tariffId: string | null;
  tariffVersionId: string | null;
  tariffSnapshot: billing.TariffSnapshot | null;
  periods: billing.ChargingPeriod[];
  /** Session facts — recorded whether or not a tariff priced them. */
  totals: { energyWh: number; timeS: number; parkingTimeS: number };
  cost: billing.CostBreakdown | null;
  billable: boolean;
  unbillableReason: string | null;
  remark?: string | null;
}

/** Writes the immutable priced record. Called inside the StopTransaction transaction. */
export async function insertCdr(db: Queryable, input: CdrInsert): Promise<{ id: string }> {
  const c = input.cost;
  const rows = await db<{ id: string }[]>`
    insert into public.cdrs (
      tenant_id, charging_session_id, charge_point_id, location_id, ocpp_connector_id, ocpp_identity,
      billing_account_id, driver_group_id, id_tag, auth_method, start_at, end_at,
      total_energy_wh, total_time_s, total_parking_time_s, currency,
      tariff_id, tariff_version_id, tariff_snapshot, charging_periods, lines,
      total_energy_cost_sen, total_time_cost_sen, total_parking_cost_sen, total_fixed_cost_sen,
      subtotal_sen, tax_rate_bps, tax_sen, total_sen, billable, unbillable_reason, remark
    ) values (
      ${input.tenantId}, ${input.chargingSessionId}, ${input.chargePointId},
      (select location_id from public.charge_points where id = ${input.chargePointId}),
      ${input.ocppConnectorId},
      (select ocpp_identity from public.charge_points where id = ${input.chargePointId}),
      ${input.billingAccountId}, ${input.driverGroupId}, ${input.idTag}, ${input.authMethod},
      ${input.startAt}, ${input.endAt},
      ${Math.round(input.totals.energyWh)}, ${Math.round(input.totals.timeS)},
      ${Math.round(input.totals.parkingTimeS)},
      ${c?.currency ?? input.tariffSnapshot?.currency ?? 'MYR'},
      ${input.tariffId}, ${input.tariffVersionId},
      ${input.tariffSnapshot ? db.json(input.tariffSnapshot as never) : null},
      ${db.json(input.periods as never)}, ${db.json((c?.lines ?? []) as never)},
      ${c?.totalEnergyCostSen ?? 0}, ${c?.totalTimeCostSen ?? 0}, ${c?.totalParkingCostSen ?? 0},
      ${c?.totalFixedCostSen ?? 0},
      ${c?.subtotalSen ?? 0}, ${c?.taxRateBps ?? 0}, ${c?.taxSen ?? 0}, ${c?.totalSen ?? 0},
      ${input.billable}, ${input.unbillableReason}, ${input.remark ?? null}
    )
    returning id
  `;
  return rows[0];
}

/** Stamps the priced totals back onto the session row for list views. */
export async function applySessionCost(
  db: Queryable,
  sessionId: string,
  cost: billing.CostBreakdown | null,
  idleSeconds: number,
): Promise<void> {
  await db`
    update public.charging_sessions set
      amount_gross = ${cost ? cost.totalSen / 100 : null},
      amount_tax = ${cost ? cost.taxSen / 100 : null},
      currency = ${cost?.currency ?? null},
      idle_seconds = ${idleSeconds}
    where id = ${sessionId}
  `;
}
