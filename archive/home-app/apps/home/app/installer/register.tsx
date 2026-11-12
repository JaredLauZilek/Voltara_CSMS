import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useModels } from '@/features/chargers';
import { useRegisterCharger } from '@/features/installer';
import type { Registered } from '@/features/installer';
import { C, font } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Input, Label, Screen, Title } from '@/lib/ui';

/** Put a unit on the books; the claim code is shown exactly once. */
export default function RegisterUnit() {
  const { data: models = [] } = useModels();
  const register = useRegisterCharger();
  const [serial, setSerial] = useState('');
  const [modelId, setModelId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Registered | null>(null);

  if (result) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Title>Registered</Title>
          <Card style={{ gap: 10, backgroundColor: C.green, borderColor: C.green }}>
            <Text style={{ fontSize: 11, ...font('bold'), color: C.honeydew, letterSpacing: 0.6 }}>
              CLAIM CODE · SHOWN ONCE
            </Text>
            <Text style={{ fontSize: 40, ...font('extrabold'), color: C.yellow, letterSpacing: 6 }}>
              {result.claim_code}
            </Text>
            <Text style={{ color: C.white, ...font('semibold') }}>{result.serial}</Text>
          </Card>
          <Body>
            Write this code on the unit's label (or print the QR) — the homeowner needs it to claim
            the charger, and the app uses it as the Bluetooth PIN.
          </Body>
          <Button
            title="Copy code"
            variant="secondary"
            onPress={() => void Clipboard.setStringAsync(`${result.serial};${result.claim_code}`)}
          />
          <Button
            title="Commission now"
            onPress={() => router.replace(`/installer/commission/${result.id}`)}
          />
          <Button title="Done" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 10 }}>
          <Label>Serial number</Label>
          <Input
            value={serial}
            onChangeText={(t) => setSerial(t.toUpperCase())}
            placeholder="HC-XXXX-0000"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Label>Model</Label>
          <View style={{ gap: 8 }}>
            {models.map((m) => {
              const active = m.id === modelId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setModelId(m.id)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: active ? C.green : C.border,
                    backgroundColor: active ? C.honeydew : C.white,
                  }}
                >
                  <Text style={{ ...font('bold'), color: C.ink }}>{m.name}</Text>
                  <Body muted style={{ fontSize: 12 }}>
                    {m.brand} {m.model} · {m.rated_kw} kW · {m.rated_amps} A · {m.phases}-phase
                  </Body>
                </Pressable>
              );
            })}
          </View>
          <Label>Claim code (optional — generated if blank)</Label>
          <Input
            value={code}
            onChangeText={setCode}
            placeholder="6 digits"
            keyboardType="number-pad"
            maxLength={6}
          />
          {register.error && <ErrorText>{register.error.message}</ErrorText>}
          <Button
            title={register.isPending ? 'Registering…' : 'Register'}
            loading={register.isPending}
            disabled={
              serial.trim().length < 4 || !modelId || (code !== '' && !/^\d{6}$/.test(code))
            }
            onPress={() =>
              register.mutate(
                { serial, modelId: modelId!, claimCode: code || undefined },
                { onSuccess: setResult },
              )
            }
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
