export interface PhoneLink {
  url: string | null;
  qrSvg: string | null;
  updatedAt: string;
}

export type ServiceState = 'up' | 'down' | 'checking';

export interface ServiceStatus {
  expo: ServiceState;
  supabase: ServiceState;
}
