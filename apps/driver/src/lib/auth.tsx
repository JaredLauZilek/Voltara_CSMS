import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

/**
 * Restores the session from the keychain, tracks changes, and completes a
 * magic-link sign-in when the app is opened from the email link
 * (voltara://auth#access_token=…&refresh_token=… or ?code=…).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const params = { ...(parsed.queryParams ?? {}) } as Record<string, string>;
      // Tokens arrive in the fragment for implicit-flow links.
      const hash = url.split('#')[1];
      if (hash) for (const [k, v] of new URLSearchParams(hash)) params[k] = v;
      if (params.access_token && params.refresh_token) {
        await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
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
