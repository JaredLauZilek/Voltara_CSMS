import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { C, KPICard, Toolbar } from '@voltara/ui';
import { billing, formatDuration, formatKwh } from '@voltara/shared';
import { downloadText, monthRange, toCsv } from '@/shared/lib/csv';
import { useRevenueSummary } from './hooks';
import type { RevenueRow } from './api';

const inputStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 13,
  outline: 'none',
  background: C.white,
};

interface Group {
  key: string;
  name: string;
  sessions: number;
  unbillable: number;
  energyWh: number;
  idleS: number;
  subtotalSen: number;
  taxSen: number;
  totalSen: number;
}

function groupBy(
  rows: RevenueRow[],
  key: (r: RevenueRow) => string,
  name: (r: RevenueRow) => string,
): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const k = key(r);
    const g = map.get(k) ?? {
      key: k,
      name: name(r),
      sessions: 0,
      unbillable: 0,
      energyWh: 0,
      idleS: 0,
      subtotalSen: 0,
      taxSen: 0,
      totalSen: 0,
    };
    g.sessions += r.sessions;
    g.unbillable += r.unbillable_sessions;
    g.energyWh += r.energy_wh;
    g.idleS += r.idle_s;
    g.subtotalSen += r.subtotal_sen;
    g.taxSen += r.tax_sen;
    g.totalSen += r.total_sen;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.totalSen - a.totalSen);
}

/** Revenue by site, charger and driver group for a period. Every number comes from CDRs. */
export function ReportsScreen() {
  const [params, setParams] = useSearchParams();
  const cur = monthRange(0);
  const last = monthRange(-1);
  const from = params.get('from') ?? cur.from;
  const to = params.get('to') ?? cur.to;
  const { data: rows = [], isLoading } = useRevenueSummary(from, to);
  const setRange = (f: string, t: string) => {
    const p = new URLSearchParams(params);
    p.set('from', f);
    p.set('to', t);
    setParams(p, { replace: true });
  };

  const totals = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          sessions: s.sessions + r.sessions,
          unbillable: s.unbillable + r.unbillable_sessions,
          energyWh: s.energyWh + r.energy_wh,
          idleS: s.idleS + r.idle_s,
          subtotalSen: s.subtotalSen + r.subtotal_sen,
          taxSen: s.taxSen + r.tax_sen,
          totalSen: s.totalSen + r.total_sen,
        }),
        {
          sessions: 0,
          unbillable: 0,
          energyWh: 0,
          idleS: 0,
          subtotalSen: 0,
          taxSen: 0,
          totalSen: 0,
        },
      ),
    [rows],
  );
  const bySite = useMemo(
    () =>
      groupBy(
        rows,
        (r) => r.location_id ?? 'none',
        (r) => r.location_name ?? 'No site',
      ),
    [rows],
  );
  const byCharger = useMemo(
    () =>
      groupBy(
        rows,
        (r) => r.charge_point_id ?? 'none',
        (r) => r.charge_point_name ?? 'Unknown charger',
      ),
    [rows],
  );
  const byGroup = useMemo(
    () =>
      groupBy(
        rows,
        (r) => r.driver_group_id ?? 'adhoc',
        (r) => r.driver_group_name ?? 'Ad-hoc / no group',
      ),
    [rows],
  );

  const exportCsv = () =>
    downloadText(
      `revenue-${from}-to-${to}.csv`,
      toCsv(rows, [
        { header: 'Site', value: (r) => r.location_name ?? '' },
        { header: 'Charger', value: (r) => r.charge_point_name ?? '' },
        { header: 'Driver group', value: (r) => r.driver_group_name ?? 'ad-hoc' },
        { header: 'Sessions', value: (r) => r.sessions },
        { header: 'Unbillable', value: (r) => r.unbillable_sessions },
        { header: 'Energy (kWh)', value: (r) => (r.energy_wh / 1000).toFixed(3) },
        { header: 'Idle (min)', value: (r) => Math.round(r.idle_s / 60) },
        { header: 'Excl. tax (RM)', value: (r) => (r.subtotal_sen / 100).toFixed(2) },
        { header: 'Tax (RM)', value: (r) => (r.tax_sen / 100).toFixed(2) },
        { header: 'Total (RM)', value: (r) => (r.total_sen / 100).toFixed(2) },
      ]),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPICard
          label="Revenue"
          value={billing.formatSen(totals.totalSen)}
          sub={`${billing.formatSen(totals.subtotalSen)} excl. · ${billing.formatSen(totals.taxSen)} tax`}
          accent
        />
        <KPICard
          label="Energy"
          value={formatKwh(totals.energyWh, 1)}
          sub={`${totals.sessions} sessions`}
        />
        <KPICard
          label="Avg per session"
          value={
            totals.sessions - totals.unbillable > 0
              ? billing.formatSen(
                  Math.round(totals.totalSen / (totals.sessions - totals.unbillable)),
                )
              : '—'
          }
          sub={`${formatDuration(totals.idleS)} idle in total`}
        />
        <KPICard label="Unbillable" value={totals.unbillable} sub="Sessions without a tariff" />
      </div>

      <Toolbar
        filters={[last.label, cur.label]}
        filter={from === last.from ? last.label : from === cur.from ? cur.label : ''}
        onFilterChange={(f) =>
          f === last.label ? setRange(last.from, last.to) : setRange(cur.from, cur.to)
        }
        extra={
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setRange(e.target.value, to)}
              style={inputStyle}
            />
            <span style={{ color: C.slate, fontSize: 12 }}>to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setRange(from, e.target.value)}
              style={inputStyle}
            />
          </>
        }
        primaryLabel="Export CSV"
        onPrimary={exportCsv}
      />

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}
      >
        <Table
          title="By site"
          groups={bySite}
          max={bySite[0]?.totalSen ?? 0}
          isLoading={isLoading}
        />
        <Table
          title="By driver group"
          groups={byGroup}
          max={byGroup[0]?.totalSen ?? 0}
          isLoading={isLoading}
        />
      </div>
      <Table
        title="By charger"
        groups={byCharger}
        max={byCharger[0]?.totalSen ?? 0}
        isLoading={isLoading}
      />
    </div>
  );
}

function Table({
  title,
  groups,
  max,
  isLoading,
}: {
  title: string;
  groups: Group[];
  max: number;
  isLoading: boolean;
}) {
  return (
    <div
      style={{
        background: C.white,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${C.border}`,
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </div>
      {groups.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
          {isLoading ? '' : 'No sessions in this period.'}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} style={{ borderBottom: `1px solid ${C.divider}` }}>
                <td style={{ padding: '10px 24px', width: '40%' }}>
                  <div style={{ fontWeight: 600, color: C.ink }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>
                    {g.sessions} sessions · {formatKwh(g.energyWh, 1)}
                    {g.unbillable ? ` · ${g.unbillable} unbillable` : ''}
                  </div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 99,
                      background: C.divider,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${max > 0 ? (g.totalSen / max) * 100 : 0}%`,
                        height: '100%',
                        background: C.green,
                      }}
                    />
                  </div>
                </td>
                <td
                  style={{
                    padding: '10px 24px',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: C.green,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {billing.formatSen(g.totalSen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
