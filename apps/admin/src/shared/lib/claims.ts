// Claims injected by the custom access token auth hook live inside the JWT
// itself — session.user.app_metadata only mirrors auth.users.raw_app_meta_data,
// so we decode the access token payload directly. Never read user_metadata
// for anything authorization-shaped.

export interface TokenClaims {
  tenant_id?: string;
  tenant_role?: 'owner' | 'admin' | 'operator' | 'viewer';
  platform_admin?: boolean;
}

export function decodeClaims(accessToken: string): TokenClaims {
  try {
    const part = accessToken.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { app_metadata?: TokenClaims };
    return payload.app_metadata ?? {};
  } catch {
    return {};
  }
}
