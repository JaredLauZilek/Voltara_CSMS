import { useEffect, useState, type ReactNode } from 'react';
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
 * Real Supabase Auth (unlike the accounting dashboard's PasswordGate). Renders:
 *  - LoginScreen while signed out,
 *  - a "no tenant" notice when the JWT carries no tenant claim (user exists
 *    but has no membership — the auth hook injected nothing),
 *  - the app inside AuthContext otherwise.
 */
export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
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
