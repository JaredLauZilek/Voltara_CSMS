import type { Database } from '@voltara/shared/database.types';
import { TICKET_STATUSES } from '@voltara/shared';
import type { TicketStatus } from '@voltara/shared';

export type Ticket = Database['public']['Tables']['support_tickets']['Row'];
export type TicketUpdate = Database['public']['Tables']['support_tickets']['Update'];
export type ProfileLite = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email'
>;

export { TICKET_STATUSES, TICKET_STATUS_PILL } from '@voltara/shared';
export type { TicketStatus } from '@voltara/shared';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_FILTERS = ['All', 'Open', 'In progress', 'Resolved', 'Closed'] as const;
export type TicketFilter = (typeof TICKET_FILTERS)[number];

export function isTicketStatus(v: string): v is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(v);
}

export function ticketLabel(status: string): string {
  return isTicketStatus(status) ? TICKET_STATUS_LABELS[status] : status;
}
