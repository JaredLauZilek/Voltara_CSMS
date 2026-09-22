import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useJoinSite } from '@/features/chargers/hooks';
import { C } from '@/lib/theme';
import { Body, Button, Card, Label, Screen } from '@/lib/ui';

/** Redeem a site's join code — a condo resident's way in, and how the tariff for residents applies. */
export default function Join() {
  const [code, setCode] = useState('');
  const join = useJoinSite();
  return (
    <Screen style={{ padding: 20, gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <Label>Site code</Label>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="e.g. VANTAGE24"
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 10,
            padding: 12,
            fontSize: 20,
            letterSpacing: 2,
            fontFamily: 'monospace',
            backgroundColor: C.white,
          }}
        />
        <Body muted>
          Your building or workplace gives you this code. It links your account to their charging
          rates and billing.
        </Body>
        {join.error && <Body style={{ color: C.error }}>{(join.error as Error).message}</Body>}
        {join.data && (
          <Body style={{ color: C.green, fontWeight: '700' }}>
            Joined{join.data.label ? ` · ${join.data.label}` : ''}. Your rate at this site now
            applies.
          </Body>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
          <Button
            title={join.data ? 'Done' : 'Join'}
            onPress={() => (join.data ? router.back() : join.mutate(code))}
            loading={join.isPending}
            disabled={!join.data && code.length < 6}
            style={{ flex: 1 }}
          />
        </View>
      </Card>
    </Screen>
  );
}
