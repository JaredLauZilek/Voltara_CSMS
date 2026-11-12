import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CHARGER_LIFECYCLE_LABELS, CHARGER_LIFECYCLE_PILL } from '@voltara/shared';
import type { ChargerLifecycle } from '@voltara/shared';
import type { ChargerRow } from '@/features/chargers';
import { useDealerChargers } from '@/features/installer';
import { useActor } from '@/features/profile';
import { C, font } from '@/lib/theme';
import { Badge, Body, Button, Card, Empty, Label, Screen } from '@/lib/ui';

/**
 * Installer / dealer view: the units your dealer is responsible for. Register
 * stock, then commission each one on site (circuit rating, phase mode).
 */
export default function Installer() {
  const { data: actor } = useActor();
  const allowed = !!actor?.dealer_role || !!actor?.staff_role;
  const { data: chargers = [], isLoading, refetch, isRefetching } = useDealerChargers(allowed);

  if (actor && !allowed) {
    return (
      <Screen>
        <Empty>This tab is for installers and dealers.</Empty>
      </Screen>
    );
  }

  const pending = chargers.filter((c) => c.lifecycle === 'registered');
  const done = chargers.filter((c) => c.lifecycle !== 'registered');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <Button title="Register a new unit" onPress={() => router.push('/installer/register')} />

        <Label>Awaiting commissioning · {pending.length}</Label>
        {pending.length === 0 && !isLoading && <Empty>Nothing waiting.</Empty>}
        {pending.map((c) => (
          <UnitTile key={c.id} charger={c} />
        ))}

        <Label>Commissioned · {done.length}</Label>
        {done.map((c) => (
          <UnitTile key={c.id} charger={c} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function UnitTile({ charger }: { charger: ChargerRow }) {
  const lc = charger.lifecycle as ChargerLifecycle;
  return (
    <Pressable onPress={() => router.push(`/installer/commission/${charger.id}`)}>
      <Card style={{ gap: 6 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, ...font('bold'), color: C.ink }}>{charger.serial}</Text>
          <Badge status={CHARGER_LIFECYCLE_PILL[lc]} label={CHARGER_LIFECYCLE_LABELS[lc]} />
        </View>
        <Body muted>
          {charger.model_name} · {charger.rated_current_a} A · {charger.phase_mode}
        </Body>
        {charger.owner_name ? (
          <Body muted style={{ fontSize: 12 }}>
            Owner: {charger.owner_name}
          </Body>
        ) : null}
        {charger.site_label ? (
          <Body muted style={{ fontSize: 12 }}>
            {charger.site_label}
            {charger.city ? `, ${charger.city}` : ''}
          </Body>
        ) : null}
      </Card>
    </Pressable>
  );
}
