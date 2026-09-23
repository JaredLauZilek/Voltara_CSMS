// Dev-only: no supabase.from() here — this feature talks to the local
// dev servers through the Vite proxies in vite.config.ts.
import type { PhoneLink, ServiceState, ServiceStatus } from './types';

async function probe(url: string, init?: RequestInit): Promise<ServiceState> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4_000) });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export async function fetchPhoneLink(): Promise<PhoneLink> {
  const res = await fetch(`/dev-phone.json?t=${Date.now()}`);
  if (!res.ok) return { url: null, qrSvg: null, updatedAt: '' };
  return (await res.json()) as PhoneLink;
}

export async function fetchServiceStatus(): Promise<ServiceStatus> {
  const [supabase, gateway, expo] = await Promise.all([
    probe('/supabase/auth/v1/health'),
    probe('/gateway/healthz'),
    probe('/expo/', { headers: { 'expo-platform': 'ios' } }),
  ]);
  return { supabase, gateway, expo };
}
