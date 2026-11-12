import { useEffect, useState } from 'react';
import { C, VoltaraLogo } from '@voltara/ui';
import { supabase } from '@/shared/lib/supabase';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: C.slate,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: 'Figtree',
  fontSize: 14,
  outline: 'none',
  background: C.white,
  boxSizing: 'border-box',
};

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.getElementById('voltara-login-email')?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      const isBadCredentials = authError.code === 'invalid_credentials' || authError.status === 400;
      setError(isBadCredentials ? 'Invalid email or password.' : authError.message);
      setPassword('');
      setBusy(false);
    }
  };

  const canSubmit = !!email && !!password && !busy;

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
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 380,
          background: C.white,
          borderRadius: 20,
          border: `1px solid ${C.border}`,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <VoltaraLogo height={40} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>Voltara Home</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
            Sign in to the staff and dealer portal.
          </div>
        </div>
        <div>
          <label htmlFor="voltara-login-email" style={labelStyle}>
            Email
          </label>
          <input
            id="voltara-login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="voltara-login-password" style={labelStyle}>
            Password
          </label>
          <input
            id="voltara-login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            style={{ ...inputStyle, borderColor: error ? C.error : C.border }}
          />
          {error && (
            <div style={{ fontSize: 11, color: C.error, fontWeight: 600, marginTop: 6 }}>
              {error}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '11px 16px',
            borderRadius: 10,
            border: 'none',
            background: canSubmit ? C.green : C.slate,
            color: C.white,
            fontFamily: 'Figtree',
            fontSize: 14,
            fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
