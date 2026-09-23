/** Written by scripts/dev.mjs; served by Vite from public/ in dev only. */
export interface PhoneLink {
  url: string | null;
  qrSvg: string | null;
  updatedAt: string;
}

export type ServiceState = 'up' | 'down' | 'checking';

export interface ServiceStatus {
  supabase: ServiceState;
  gateway: ServiceState;
  expo: ServiceState;
}
