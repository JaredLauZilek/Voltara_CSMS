import type { Database } from '@voltara/shared/database.types';

export type ChargingSession = Database['public']['Tables']['charging_sessions']['Row'];
export type DailyEnergy = Database['public']['Views']['vw_daily_energy']['Row'];
