import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C, font } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Input, Label, Screen, Title } from '@/lib/ui';

const DEV_LOGINS = [
  { label: 'Owner', email: 'owner@dev.voltara.com.my' },
  { label: 'Installer', email: 'installer@dev.voltara.com.my' },
  { label: 'Dealer admin', email: 'dealer@dev.voltara.com.my' },
  { label: 'Staff', email: 'admin@dev.voltara.com.my' },
];

/**
 * Email magic link. Supabase emails a link that opens the app via the
 * voltarahome:// scheme (in a dev client: exp+voltara-home://). The code box
 * is the fallback for devices the link cannot open — the same email carries
 * an OTP. In development the seeded accounts sign in with one tap.
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
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: Linking.createURL('auth'), shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

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

  const devSignIn = async (devEmail: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: devEmail,
      password: process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN_PASSWORD ?? 'voltara-dev',
    });
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
            <Title>Voltara Home</Title>
            <Body muted>Your charger, in your pocket.</Body>
          </View>

          <Card style={{ gap: 12 }}>
            {!sent ? (
              <>
                <Label>Email</Label>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
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
                  We sent a link to <Text style={{ ...font('bold') }}>{email.trim()}</Text>. Tap it
                  on this phone to sign in.
                </Body>
                <Body muted>Or enter the code from that email, or paste the whole link:</Body>
                <Input
                  value={code}
                  onChangeText={setCode}
                  placeholder="Code from the email, or the sign-in link"
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  style={{ minHeight: 56 }}
                />
                <Button title="Sign in" onPress={verify} loading={busy} disabled={!code.trim()} />
                <Button
                  title="Use a different email"
                  variant="secondary"
                  onPress={() => setSent(false)}
                />
              </>
            )}
            {error && <ErrorText>{error}</ErrorText>}
          </Card>

          {__DEV__ && (
            <Card style={{ gap: 10 }}>
              <Label>Development · seeded accounts</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DEV_LOGINS.map((d) => (
                  <Button
                    key={d.email}
                    title={d.label}
                    variant="secondary"
                    onPress={() => devSignIn(d.email)}
                    disabled={busy}
                    style={{ paddingVertical: 10, paddingHorizontal: 14 }}
                  />
                ))}
              </View>
              <Body muted style={{ fontSize: 12 }}>
                Password sign-in against supabase/seed.sql. Not in release builds.
              </Body>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
