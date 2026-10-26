import { useEffect, useState, type ReactNode } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
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
 * `.env.local` (gitignored) and the login screen is never rendered: the app
 * signs in by itself and, if the local stack is down, waits for it and
 * retries. Double-gated: the variables only exist locally, AND
 * `import.meta.env.DEV` is false in every production bundle, so this can
 * never fire on a deploy. It still performs a real sign-in — RLS and the
 * tenant claims hook are exercised exactly as they are for a human at the
 * form. The login screen is production behaviour only until launch.
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

const DEV_RETRY_MS = 3_000;

/** A fetch that never reached Supabase surfaces as an empty message. */
function describeAuthError(error: AuthError | null): string {
  const msg = error?.message?.trim();
  return msg && msg !== '{}' ? msg : 'the local Supabase stack is not reachable';
}

/**
 * Real Supabase Auth (unlike the accounting dashboard's PasswordGate). Renders:
 *  - in dev with auto-login configured: a "connecting" notice until the local
 *    stack answers, then the app — never the login screen;
 *  - LoginScreen while signed out (production, or dev without auto-login),
 *  - a "no tenant" notice when the JWT carries no tenant claim (user exists
 *    but has no membership — the auth hook injected nothing),
 *  - the app inside AuthContext otherwise.
 */
export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [devError, setDevError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempting = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const devSignIn = async () => {
      if (!DEV_AUTO_LOGIN || attempting || cancelled) return;
      attempting = true;
      const { data, error } = await supabase.auth.signInWithPassword(DEV_AUTO_LOGIN);
      attempting = false;
      if (cancelled) return;
      if (error || !data.session) {
        setDevError(describeAuthError(error));
        retry = setTimeout(devSignIn, DEV_RETRY_MS);
        return;
      }
      setDevError(null);
      setSession(data.session);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
      if (!data.session) void devSignIn();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Dev: a sign-out or an expired session just signs straight back in.
      if (!next) void devSignIn();
    });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div style={centred}>
        <VoltaraLogo height={36} />
      </div>
    );
  }

  if (!session) {
    if (!DEV_AUTO_LOGIN) return <LoginScreen />;
    return (
      <div style={{ ...centred, padding: 20, fontFamily: 'Figtree' }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <VoltaraLogo height={36} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>
            {devError ? 'Waiting for the local stack' : 'Signing in…'}
          </div>
          <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.5 }}>
            {devError ? (
              <>
                {devError[0].toUpperCase() + devError.slice(1)}.<br />
                Run <code>pnpm dev</code> in the codespace — this page retries on its own.
              </>
            ) : (
              <>Dev sign-in as {DEV_AUTO_LOGIN.email}.</>
            )}
          </div>
        </div>
      </div>
    );
  }

  const claims = decodeClaims(session.access_token);

  if (!claims.tenant_id || !claims.tenant_role) {
    return (
      <div style={{ ...centred, padding: 20, fontFamily: 'Figtree' }}>
        <div style={card}>
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

const centred: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: C.seasalt,
};

const card: React.CSSProperties = {
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
};
