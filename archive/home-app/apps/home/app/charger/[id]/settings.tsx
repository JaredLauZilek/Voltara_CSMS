import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCharger,
  useEvents,
  useReleaseCharger,
  useRenameCharger,
  useSettings,
  useUpdateSettings,
} from '@/features/chargers';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { forgetPin } from '@/lib/pins';
import { C } from '@/lib/theme';
import { Body, Button, Card, Empty, ErrorText, Input, KV, Label, Screen } from '@/lib/ui';

export default function ChargerSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data: charger } = useCharger(id ?? null);
  const { data: settings } = useSettings(id ?? null);
  const { data: events = [] } = useEvents(id ?? null);
  const rename = useRenameCharger();
  const update = useUpdateSettings(id ?? '');
  const release = useReleaseCharger();
  const [name, setName] = useState('');
  const [confirmRelease, setConfirmRelease] = useState(false);

  useEffect(() => {
    if (charger) setName(charger.name);
  }, [charger]);

  if (!charger) {
    return (
      <Screen>
        <Empty>Loading…</Empty>
      </Screen>
    );
  }
  const isOwner = charger.owner_user_id === session?.user.id;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 10 }}>
          <Label>Name</Label>
          <Input value={name} onChangeText={setName} editable={isOwner} />
          {isOwner && (
            <Button
              title={rename.isPending ? 'Saving…' : 'Save name'}
              onPress={() => rename.mutate({ id: charger.id, name: name.trim() || charger.name })}
              loading={rename.isPending}
              disabled={name.trim() === charger.name}
            />
          )}
          {rename.error && <ErrorText>{rename.error.message}</ErrorText>}
        </Card>

        <Card style={{ gap: 10 }}>
          <Label>Charger</Label>
          <KV k="Model" v={charger.model_name ?? ''} />
          <KV k="Serial" v={charger.serial} />
          <KV k="Rated circuit" v={`${charger.rated_current_a} A · ${charger.phase_mode}`} />
          <KV k="Firmware" v={charger.firmware_version ?? '–'} />
          <KV k="Installed by" v={charger.installer_name ?? charger.dealer_name ?? '–'} />
          <KV
            k="Site"
            v={[charger.site_label, charger.city, charger.state].filter(Boolean).join(', ') || '–'}
          />
        </Card>

        {settings && (
          <Card style={{ gap: 12 }}>
            <Label>Behaviour</Label>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Body>Lock cable to charger</Body>
              <Switch
                value={settings.cable_locked}
                onValueChange={(v) => update.mutate({ cable_locked: v })}
                trackColor={{ true: C.green, false: C.border }}
              />
            </View>
            <KV k="Current limit" v={`${settings.max_current_a} A`} />
            <KV
              k="Applied to charger"
              v={
                settings.applied_version === settings.version
                  ? 'Up to date'
                  : 'Pending next connection'
              }
            />
            {update.error && <ErrorText>{update.error.message}</ErrorText>}
          </Card>
        )}

        <Card style={{ gap: 6 }}>
          <Label>Recent events</Label>
          {events.length === 0 && <Body muted>No events.</Body>}
          {events.slice(0, 12).map((e) => (
            <KV key={e.id} k={formatDateTime(e.created_at)} v={e.message ?? e.type} />
          ))}
        </Card>

        {isOwner && (
          <Card style={{ gap: 10 }}>
            <Label>Danger zone</Label>
            {!confirmRelease ? (
              <Button
                title="Remove this charger from my account"
                variant="secondary"
                onPress={() => setConfirmRelease(true)}
              />
            ) : (
              <>
                <Body>
                  Permanent — household members lose access and the unit can be claimed again.
                </Body>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title="Confirm remove"
                    variant="danger"
                    loading={release.isPending}
                    onPress={() =>
                      release.mutate(charger.id, {
                        onSuccess: async () => {
                          await forgetPin(charger.serial);
                          router.replace('/(tabs)');
                        },
                      })
                    }
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setConfirmRelease(false)}
                    style={{ flex: 1 }}
                  />
                </View>
                {release.error && <ErrorText>{release.error.message}</ErrorText>}
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
