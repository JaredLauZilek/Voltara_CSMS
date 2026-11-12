import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useClaimCharger } from '@/features/chargers';
import { savePin } from '@/lib/pins';
import { Body, Button, Card, ErrorText, Input, Label, Screen, Title } from '@/lib/ui';

/**
 * Claim a unit: serial + claim code (both printed on the charger / its QR).
 * On success the code is kept in the keychain as the BLE PIN and the live
 * screen opens, which connects over Bluetooth.
 */
export default function AddCharger() {
  const params = useLocalSearchParams<{ serial?: string; code?: string }>();
  const [serial, setSerial] = useState(params.serial ?? '');
  const [code, setCode] = useState(params.code ?? '');
  const [name, setName] = useState('');
  const claim = useClaimCharger();

  useEffect(() => {
    if (params.serial) setSerial(params.serial);
    if (params.code) setCode(params.code);
  }, [params.serial, params.code]);

  const submit = () =>
    claim.mutate(
      { serial, code, name: name.trim() || undefined },
      {
        onSuccess: async (id) => {
          await savePin(serial, code.trim());
          router.replace(`/charger/${id}`);
        },
      },
    );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Title>Add your charger</Title>
        <Body muted>
          Find the serial number and 6-digit claim code on the label of the unit, or scan the QR
          code.
        </Body>
        <Button
          title="Scan QR code"
          variant="secondary"
          onPress={() => router.push('/onboarding/scan')}
        />
        <Card style={{ gap: 10 }}>
          <Label>Serial number</Label>
          <Input
            value={serial}
            onChangeText={(t) => setSerial(t.toUpperCase())}
            placeholder="HC-XXXX-0000"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Label>Claim code</Label>
          <Input
            value={code}
            onChangeText={setCode}
            placeholder="6 digits"
            keyboardType="number-pad"
            maxLength={6}
          />
          <Label>Name (optional)</Label>
          <Input value={name} onChangeText={setName} placeholder="Porch charger" />
          {claim.error && <ErrorText>{claim.error.message}</ErrorText>}
          <Button
            title={claim.isPending ? 'Claiming…' : 'Claim charger'}
            onPress={submit}
            loading={claim.isPending}
            disabled={serial.trim().length < 4 || !/^\d{6}$/.test(code.trim())}
          />
        </Card>
        <Body muted style={{ fontSize: 12 }}>
          After claiming, the app connects to the charger over Bluetooth. Keep your phone within a
          few metres of the unit.
        </Body>
      </ScrollView>
    </Screen>
  );
}
