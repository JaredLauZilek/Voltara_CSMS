import { supabase } from '@/shared/lib/supabase';

/**
 * Dev-only sign-ins. `.env.local` (gitignored) may name up to two accounts —
 * VITE_DEV_AUTO_LOGIN_EMAIL/_PASSWORD and VITE_DEV_AUTO_LOGIN_EMAIL_2/_PASSWORD_2 —
 * so two operators (say, one per country) can be tried without a login
 * screen. The sidebar offers the switch; the choice is remembered per
 * browser. Empty in every production bundle (`import.meta.env.DEV` is false).
 */
export interface DevAccount {
  email: string;
  password: string;
}

const env = import.meta.env;

export const DEV_ACCOUNTS: DevAccount[] = env.DEV
  ? [
      { email: env.VITE_DEV_AUTO_LOGIN_EMAIL, password: env.VITE_DEV_AUTO_LOGIN_PASSWORD },
      { email: env.VITE_DEV_AUTO_LOGIN_EMAIL_2, password: env.VITE_DEV_AUTO_LOGIN_PASSWORD_2 },
    ].filter((a): a is DevAccount => Boolean(a.email && a.password))
  : [];

const STORAGE_KEY = 'voltara.dev.account';

/** The account dev auto sign-in uses: the one last switched to, else the first. */
export function currentDevAccount(): DevAccount | null {
  let chosen: string | null = null;
  try {
    chosen = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: fall through to the first account.
  }
  return DEV_ACCOUNTS.find((a) => a.email === chosen) ?? DEV_ACCOUNTS[0] ?? null;
}

/** Signs in as another dev account and reloads, so no cached data crosses operators. */
export async function switchDevAccount(email: string): Promise<void> {
  const account = DEV_ACCOUNTS.find((a) => a.email === email);
  if (!account) return;
  try {
    localStorage.setItem(STORAGE_KEY, email);
  } catch {
    // Storage blocked: the switch still works until the next reload.
  }
  const { error } = await supabase.auth.signInWithPassword(account);
  if (error) throw error;
  window.location.assign('/');
}
