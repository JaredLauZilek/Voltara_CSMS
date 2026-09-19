import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { C, VoltaraLogo } from '@voltara/ui';
import { supabase } from '@/shared/lib/supabase';
import { decodeClaims } from '@/shared/lib/claims';
import { AuthContext } from './auth';
import { LoginScreen } from './LoginScreen';

interface Props {
  children: ReactNode;
}

/**
 * Dev-only auto sign-in. Set VITE_DEV_AUTO_LOGIN_EMAIL / _PASSWORD in
 * `.env.local` (gitignored) to skip the login screen against the local stack.
 * Double-gated: the variables only exist locally, AND `import.meta.env.DEV`
 * is false in every production bundle, so this can never fire on a deploy.
 * It still performs a real sign-in — RLS and the tenant claims hook are
 * exercised exactly as they are for a human at the form.
 */
const DEV_AUTO_LOGIN =
  import.meta.env.DEV &&
  import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL &&
  import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD
    ? {
        email: import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL as string,
        password: import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD as string,
      }
    : null;

/**
 * Real Supabase Auth (unlike the accounting dashboard's PasswordGate). Renders:
 *  - LoginScreen while signed out,
 *  - a "no tenant" notice when the JWT carries no tenant claim (user exists
 *    but has no membership — the auth hook injected nothing),
 *  - the app inside AuthContext otherwise.
 */
export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Once per page load: after an explicit sign-out the form must stay visible,
  // otherwise "Sign out" in dev would just bounce straight back in.
  const autoLoginTried = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session && DEV_AUTO_LOGIN && !autoLoginTried.current) {
        autoLoginTried.current = true;
        const { data: signedIn, error } = await supabase.auth.signInWithPassword(DEV_AUTO_LOGIN);
        if (error) console.warn('dev auto-login failed — showing the login form:', error.message);
        setSession(signedIn?.session ?? null);
        setLoading(false);
        return;
      }
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: C.seasalt,
        }}
      >
        <VoltaraLogo height={36} />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  const claims = decodeClaims(session.access_token);

  if (!claims.tenant_id || !claims.tenant_role) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: C.seasalt,
          padding: 20,
          fontFamily: 'Figtree',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: C.white,
            borderRadius: 20,
            border: `1px solid ${C.border}`,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <VoltaraLogo height={36} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>No operator account</div>
          <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.5 }}>
            {session.user.email} is not a member of any operator yet. Ask your administrator for an
            invite, then sign in again.
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              alignSelf: 'center',
              padding: '9px 18px',
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: 'transparent',
              color: C.slate,
              fontFamily: 'Figtree',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        tenantId: claims.tenant_id,
        tenantRole: claims.tenant_role,
        isPlatformAdmin: claims.platform_admin ?? false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
