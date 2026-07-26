import type { Database } from '@voltara/shared/database.types';

export type Location = Database['public']['Tables']['locations']['Row'];
export type LocationInsert = Database['public']['Tables']['locations']['Insert'];
export type LocationUpdate = Database['public']['Tables']['locations']['Update'];

export { SITE_TYPES, SITE_TYPE_LABELS, MY_STATES } from '@voltara/shared';
export type { SiteType } from '@voltara/shared';
