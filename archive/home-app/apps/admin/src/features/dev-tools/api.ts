// Dev-only probes. No Supabase tables here — this feature reads files the
// local orchestration script writes and pokes local health endpoints.
import type { PhoneLink, ServiceStatus } from './types';

export async function readPhoneLink(): Promise<PhoneLink | null> {
  try {
    const res = await fetch(`/dev-phone.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PhoneLink;
  } catch {
    return null;
  }
}

async function probe(
  url: string,
  expect: number[] = [200],
  headers: Record<string, string> = {},
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(4_000),
    });
    return expect.includes(res.status);
  } catch {
    return false;
  }
}

export async function readServiceStatus(): Promise<ServiceStatus> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  const [expo, supabase] = await Promise.all([
    probe('/expo/status'),
    // The API gateway wants the publishable key even for the health endpoint.
    supabaseUrl
      ? probe(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, [200], { apikey: anonKey })
      : Promise.resolve(false),
  ]);
  return { expo: expo ? 'up' : 'down', supabase: supabase ? 'up' : 'down' };
}
