import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useActor, useMyProfile, useUpdateProfile } from '@/features/profile';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, ErrorText, Input, KV, Label, Screen } from '@/lib/ui';

export default function Profile() {
  const { session } = useAuth();
  const { data: profile } = useMyProfile();
  const { data: actor } = useActor();
  const update = useUpdateProfile();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  const role = actor?.staff_role
    ? `Voltara staff · ${actor.staff_role}`
    : actor?.dealer_role === 'dealer_admin'
      ? 'Dealer admin'
      : actor?.dealer_role === 'installer'
        ? 'Installer'
        : 'Homeowner';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 10 }}>
          <Label>Account</Label>
          <KV k="Email" v={session?.user.email ?? ''} />
          <KV k="Role" v={role} />
          <Label>Name</Label>
          <Input value={name} onChangeText={setName} placeholder="Your name" />
          <Label>Phone</Label>
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="+60 12-345 6789"
            keyboardType="phone-pad"
          />
          {update.error && <ErrorText>{update.error.message}</ErrorText>}
          <Button
            title={update.isPending ? 'Saving…' : 'Save changes'}
            onPress={() => update.mutate({ full_name: name.trim(), phone: phone.trim() || null })}
            loading={update.isPending}
            disabled={!profile}
          />
        </Card>

        {__DEV__ && (
          <Card style={{ gap: 10 }}>
            <Label>Development</Label>
            <Button
              title="Simulator bench"
              variant="secondary"
              onPress={() => router.push('/dev/bench')}
            />
            <Button
              title="GATT explorer"
              variant="secondary"
              onPress={() => router.push('/dev/gatt')}
            />
            <Body muted style={{ fontSize: 12 }}>
              Bench drives the in-memory charger (SIM-0001). The explorer connects to any nearby BLE
              device to capture the HiCi profile.
            </Body>
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          <Body muted style={{ fontSize: 12 }}>
            Voltara Home {Constants.expoConfig?.version ?? ''}
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}
