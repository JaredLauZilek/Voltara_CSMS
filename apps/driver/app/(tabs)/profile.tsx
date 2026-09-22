import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMyTags, useProfile, useSaveProfile } from '@/features/profile/hooks';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { Body, Button, Card, Label, Screen } from '@/lib/ui';

const input = {
  borderWidth: 1,
  borderColor: C.border,
  borderRadius: 10,
  padding: 12,
  fontSize: 15,
  backgroundColor: C.white,
} as const;

export default function Profile() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const { data: tags = [] } = useMyTags();
  const save = useSaveProfile();
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  useEffect(() => {
    setName(profile?.display_name ?? '');
    setPlate(profile?.vehicle_plate ?? '');
    setModel(profile?.vehicle_model ?? '');
  }, [profile]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card style={{ gap: 10 }}>
          <Label>Account</Label>
          <Body>{session?.user.email}</Body>
          <Label>Name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="How operators see you"
            style={input}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Label>Plate</Label>
              <TextInput
                value={plate}
                onChangeText={(v) => setPlate(v.toUpperCase())}
                placeholder="VBA 1234"
                autoCapitalize="characters"
                style={input}
              />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Label>Car</Label>
              <TextInput
                value={model}
                onChangeText={setModel}
                placeholder="BYD Atto 3"
                style={input}
              />
            </View>
          </View>
          {save.error && <Body style={{ color: C.error }}>{(save.error as Error).message}</Body>}
          <Button
            title={save.isPending ? 'Saving…' : 'Save'}
            onPress={() =>
              save.mutate({
                display_name: name.trim() || null,
                vehicle_plate: plate.trim() || null,
                vehicle_model: model.trim() || null,
              })
            }
            loading={save.isPending}
          />
        </Card>

        <Card style={{ gap: 8 }}>
          <Label>Sites you have joined</Label>
          {tags.length === 0 ? (
            <Body muted>None yet. Use a site's code from the Chargers tab.</Body>
          ) : (
            tags.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body>{t.label ?? 'Member'}</Body>
                <Body muted style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {t.tag}
                </Body>
              </View>
            ))
          )}
        </Card>

        <Button
          title="Sign out"
          variant="secondary"
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/auth/sign-in');
          }}
        />
        <Body muted style={{ fontSize: 11, textAlign: 'center' }}>
          Voltara driver · preview build
        </Body>
      </ScrollView>
    </Screen>
  );
}
