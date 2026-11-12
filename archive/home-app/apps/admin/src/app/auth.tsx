import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

/** Resolved server-side by `my_actor()` — never from user_metadata. */
export interface Actor {
  user_id: string | null;
  staff_role: 'admin' | 'support' | 'viewer' | null;
  dealer_id: string | null;
  dealer_role: 'dealer_admin' | 'installer' | null;
}

export interface AuthState {
  session: Session;
  actor: Actor;
  isStaff: boolean;
  isStaffAdmin: boolean;
  isStaffSupport: boolean;
  isDealer: boolean;
  isDealerAdmin: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthGate>.');
  return ctx;
}
