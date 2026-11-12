import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

/**
 * Dev-only auto sign-in. Set EXPO_PUBLIC_DEV_AUTO_LOGIN_EMAIL / _PASSWORD in
 * apps/home/.env to skip the magic-link screen while building. Double-gated:
 * `__DEV__` is false in every release bundle, so this can never fire in a
 * store build. It still performs a real sign-in — RLS is exercised exactly as
 * it is for a homeowner at the form.
 */
export const DEV_AUTO_LOGIN =
  __DEV__ &&
  process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN_EMAIL &&
  process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN_PASSWORD
    ? {
        email: process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN_EMAIL,
        password: process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN_PASSWORD,
      }
    : null;

/**
 * Restores the session from the keychain, tracks changes, and completes a
 * magic-link sign-in when the app is opened from the email link
 * (voltarahome://auth#access_token=…&refresh_token=… or ?code=…).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Once per launch: after an explicit sign-out the form must stay visible.
  const autoLoginTried = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session && DEV_AUTO_LOGIN && !autoLoginTried.current) {
        autoLoginTried.current = true;
        const { data: signedIn, error } = await supabase.auth.signInWithPassword(DEV_AUTO_LOGIN);
        if (error) console.warn('dev auto-login failed — showing sign-in:', error.message);
        setSession(signedIn?.session ?? null);
        setLoading(false);
        return;
      }
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const params = { ...(parsed.queryParams ?? {}) } as Record<string, string>;
      const hash = url.split('#')[1];
      if (hash) for (const [k, v] of new URLSearchParams(hash)) params[k] = v;
      if (params.access_token && params.refresh_token) {
        await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
      } else if (params.code) {
        await supabase.auth.exchangeCodeForSession(params.code);
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const link = Linking.addEventListener('url', ({ url }) => void handleUrl(url));

    return () => {
      sub.subscription.unsubscribe();
      link.remove();
    };
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
