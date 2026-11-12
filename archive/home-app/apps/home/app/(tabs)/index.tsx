import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMyChargers } from '@/features/chargers';
import type { ChargerRow } from '@/features/chargers';
import { stateLabel } from '@voltara/shared';
import type { ChargerState } from '@voltara/shared';
import { formatRelative } from '@/lib/format';
import { C, font } from '@/lib/theme';
import { Badge, Body, Button, Card, Empty, Label, Screen } from '@/lib/ui';

/** Your chargers. Tap one for the live screen; the button adds another. */
export default function MyChargers() {
  const { data: chargers = [], isLoading, refetch, isRefetching } = useMyChargers();
  const mine = chargers.filter((c) => c.lifecycle === 'claimed');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {!isLoading && mine.length === 0 && (
          <Card style={{ gap: 12 }}>
            <Label>Welcome</Label>
            <Body>
              Add your Voltara charger with the serial number and claim code printed on the unit, or
              scan its QR code.
            </Body>
            <Button title="Add a charger" onPress={() => router.push('/onboarding/add')} />
          </Card>
        )}
        {mine.map((c) => (
          <ChargerTile key={c.id} charger={c} />
        ))}
        {isLoading && <Empty>Loading…</Empty>}
        {mine.length > 0 && (
          <Button
            title="Add another charger"
            variant="secondary"
            onPress={() => router.push('/onboarding/add')}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function ChargerTile({ charger }: { charger: ChargerRow }) {
  const state = (charger.last_state ?? 'Unknown') as ChargerState;
  const live = charger.seen_recently ?? false;
  return (
    <Pressable onPress={() => router.push(`/charger/${charger.id}`)}>
      <Card style={{ gap: 8 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Label>{charger.model_name ?? 'Charger'}</Label>
          <Badge
            status={live ? state : 'Offline'}
            label={live ? stateLabel(state) : 'Not connected'}
          />
        </View>
        <Text style={{ fontSize: 20, ...font('extrabold'), color: C.green, letterSpacing: -0.4 }}>
          {charger.name}
        </Text>
        <Body muted>
          {charger.serial}
          {charger.site_label ? ` · ${charger.site_label}` : ''}
        </Body>
        <Body muted style={{ fontSize: 12 }}>
          {charger.last_seen_at
            ? `Last seen ${formatRelative(charger.last_seen_at)}`
            : 'Never connected'}
          {charger.last_power_kw && live ? ` · ${Number(charger.last_power_kw).toFixed(1)} kW` : ''}
        </Body>
      </Card>
    </Pressable>
  );
}
