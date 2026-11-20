import { displayCurrencySymbol, formatDateTime, gunLetter } from '@voltara/shared';
import { downloadText, toCsv, type CsvColumn } from '@/shared/lib/csv';
import type { DateRange } from './dateRange';
import {
  SESSION_STATUS_LABELS,
  billingType,
  currentType,
  listAmount,
  paymentStatus,
  sessionMinutes,
} from './types';
import type { SessionReportRow, SessionStatus } from './types';

const money = (v: number | null) => (v === null ? '' : v.toFixed(2));

/** The CSV mirrors the table, one fact per column, numbers left unformatted. */
function csvColumns(): CsvColumn<SessionReportRow>[] {
  const cur = displayCurrencySymbol();
  return [
    { header: 'Vehicle no.', value: (s) => s.vehicle_plate },
    { header: 'Driver', value: (s) => s.driver_name },
    { header: 'Driver email', value: (s) => s.driver_email },
    { header: 'Driver phone', value: (s) => s.driver_phone },
    { header: 'ID tag', value: (s) => s.id_tag },
    { header: 'Site', value: (s) => s.location_name },
    { header: 'Car park lot', value: (s) => s.parking_lot },
    { header: 'Charger ID', value: (s) => s.charge_point_identity },
    { header: 'Gun', value: (s) => (s.ocpp_connector_id ? gunLetter(s.ocpp_connector_id) : '') },
    { header: 'Connector ID', value: (s) => s.ocpp_connector_id },
    { header: 'Charger type', value: (s) => currentType(s.connector_type) },
    { header: 'Connector', value: (s) => s.connector_type },
    { header: 'Start time', value: (s) => formatDateTime(s.started_at) },
    { header: 'End time', value: (s) => (s.ended_at ? formatDateTime(s.ended_at) : '') },
    { header: 'Duration (min)', value: (s) => Math.round(sessionMinutes(s)) },
    {
      header: 'Energy supplied (kWh)',
      value: (s) => (s.energy_wh === null ? '' : (Number(s.energy_wh) / 1000).toFixed(3)),
    },
    { header: `Amount (${cur})`, value: (s) => money(listAmount(s)) },
    {
      header: `Discount (${cur})`,
      value: (s) => (s.amount_gross === null ? '' : Number(s.amount_discount ?? 0).toFixed(2)),
    },
    {
      header: `Final amount (${cur})`,
      value: (s) => money(s.amount_gross === null ? null : Number(s.amount_gross)),
    },
    {
      header: `Tax included (${cur})`,
      value: (s) => money(s.amount_tax === null ? null : Number(s.amount_tax)),
    },
    { header: 'Billing type', value: billingType },
    { header: 'Company', value: (s) => s.billing_account_name },
    { header: 'Whitelist', value: (s) => s.driver_group_name },
    { header: 'Payment status', value: paymentStatus },
    { header: 'Session status', value: (s) => SESSION_STATUS_LABELS[s.status as SessionStatus] },
    { header: 'Transaction', value: (s) => s.ocpp_transaction_id },
  ];
}

/** Saves the rows as `sessions[_<charger>]_<from>_to_<to>.csv`. */
export function downloadSessionsCsv(rows: SessionReportRow[], range: DateRange, scope?: string) {
  const name = ['sessions', scope, range.from, 'to', range.to].filter(Boolean).join('_');
  downloadText(`${name}.csv`, toCsv(rows, csvColumns()));
}
