import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { C, VoltaraLogo } from '@voltara/ui';
import { supabase } from '@/shared/lib/supabase';
import { AuthContext, type Actor } from './auth';
import { LoginScreen } from './LoginScreen';

/**
 * Dev-only auto sign-in: VITE_DEV_AUTO_LOGIN_EMAIL / _PASSWORD in .env.local.
 * `import.meta.env.DEV` is false in production bundles, so it cannot fire on a
 * deploy. It still performs a real sign-in so RLS is exercised.
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

function Centered({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

/**
 * Renders LoginScreen while signed out, a "no access" notice when the person
 * is neither staff nor a dealer member, and the app inside AuthContext
 * otherwise. Roles come from `my_actor()` (role tables), never the JWT body.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const actorQuery = useQuery({
    queryKey: ['actor', session?.user.id ?? null],
    queryFn: async (): Promise<Actor> => {
      const { data, error } = await supabase.rpc('my_actor');
      if (error) throw error;
      return data as unknown as Actor;
    },
    enabled: !!session,
    staleTime: 300_000,
  });

  if (loading || (session && actorQuery.isLoading)) {
    return (
      <Centered>
        <VoltaraLogo height={36} />
      </Centered>
    );
  }

  if (!session) return <LoginScreen />;

  const actor = actorQuery.data;
  if (!actor || (!actor.staff_role && !actor.dealer_role)) {
    return (
      <Centered>
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
          <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>No portal access</div>
          <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.5 }}>
            {session.user.email} is not Voltara staff or a dealer member. Ask an administrator for
            an invite, then sign in again.
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
      </Centered>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        actor,
        isStaff: !!actor.staff_role,
        isStaffAdmin: actor.staff_role === 'admin',
        isStaffSupport: actor.staff_role === 'admin' || actor.staff_role === 'support',
        isDealer: !!actor.dealer_role,
        isDealerAdmin: actor.dealer_role === 'dealer_admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
