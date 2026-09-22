import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { Body, Button, Card, Label, Screen, Title } from '@/lib/ui';

/**
 * Email magic link. Supabase emails a link that opens the app via the
 * voltara:// scheme (in Expo Go: the exp:// URL). The paste box is the
 * fallback when the link cannot open this device — including local dev,
 * where the email lands in Mailpit — using the OTP the same email
 * carries.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    // The link must come back to THIS build: voltara://auth in a store build,
    // exp://… while running in Expo Go. Linking.createURL knows which.
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: Linking.createURL('auth'), shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  /**
   * Accepts the code from the email (Supabase's OTP length is configurable,
   * 6–10 digits), or the whole sign-in link pasted from the email for devices
   * the link cannot open. Gmail wraps links (google.com/url?q=…), so the
   * pasted text is decoded until a token appears.
   */
  const verify = async () => {
    setBusy(true);
    setError(null);
    const raw = code.trim();
    let err: { message: string } | null = null;
    if (/^\d{6,10}$/.test(raw)) {
      ({ error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: raw,
        type: 'email',
      }));
    } else {
      let text = raw;
      for (let i = 0; i < 3; i += 1) {
        try {
          text = decodeURIComponent(text);
        } catch {
          break;
        }
      }
      const hash = /token_hash=([^&\s]+)/.exec(text)?.[1] ?? /[?&]token=([^&\s]+)/.exec(text)?.[1];
      if (!hash) {
        setBusy(false);
        setError('Paste the code or the full sign-in link from the email.');
        return;
      }
      ({ error: err } = await supabase.auth.verifyOtp({ token_hash: hash, type: 'magiclink' }));
    }
    setBusy(false);
    if (err) setError(err.message);
    else router.replace('/(tabs)');
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 96, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: C.green,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28, color: C.yellow }}>⚡</Text>
            </View>
            <Title>Voltara</Title>
            <Body muted>Charge, pay and go.</Body>
          </View>

          <Card style={{ gap: 12 }}>
            {!sent ? (
              <>
                <Label>Email</Label>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={{
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 16,
                    backgroundColor: C.white,
                  }}
                />
                <Button
                  title="Email me a sign-in link"
                  onPress={send}
                  loading={busy}
                  disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
                />
              </>
            ) : (
              <>
                <Body>
                  We sent a link to <Text style={{ fontWeight: '700' }}>{email.trim()}</Text>. Tap
                  it on this phone to sign in.
                </Body>
                <Body muted>Or enter the code from that email — or paste the whole link:</Body>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="Code from the email, or the sign-in link"
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 16,
                    minHeight: 56,
                    backgroundColor: C.white,
                  }}
                />
                <Button
                  title="Sign in"
                  onPress={verify}
                  loading={busy}
                  disabled={code.trim().length < 6}
                />
                <Button
                  title="Use a different email"
                  variant="secondary"
                  onPress={() => {
                    setSent(false);
                    setCode('');
                  }}
                />
              </>
            )}
            {error && <Body style={{ color: C.error }}>{error}</Body>}
          </Card>

          <Body muted style={{ textAlign: 'center', fontSize: 12 }}>
            No password to remember. By continuing you agree to the operator's charging terms shown
            at each site.
          </Body>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
