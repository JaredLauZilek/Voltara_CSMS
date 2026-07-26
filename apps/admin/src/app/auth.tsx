import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { TokenClaims } from '@/shared/lib/claims';

export interface AuthState {
  session: Session;
  tenantId: string;
  tenantRole: NonNullable<TokenClaims['tenant_role']>;
  isPlatformAdmin: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthGate>.');
  return ctx;
}
