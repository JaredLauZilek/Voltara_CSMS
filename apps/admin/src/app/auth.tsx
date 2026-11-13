import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CountryProfile } from '@voltara/shared';
import type { TokenClaims } from '@/shared/lib/claims';

export interface AuthState {
  session: Session;
  tenantId: string;
  tenantRole: NonNullable<TokenClaims['tenant_role']>;
  isPlatformAdmin: boolean;
  /** The operator's country: field names, phone code, currency. Never changes. */
  country: CountryProfile;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthGate>.');
  return ctx;
}
