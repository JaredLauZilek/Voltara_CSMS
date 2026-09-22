import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { billing, formatDateTime, formatDuration, formatKwh } from '@voltara/shared';
import { useSessions } from '@/features/sessions/hooks';
import { C } from '@/lib/theme';
import { Badge, Body, Empty, Screen } from '@/lib/ui';

export default function History() {
  const { data = [], isLoading, refetch, isRefetching } = useSessions();
  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={!isLoading ? <Empty>No sessions yet.</Empty> : null}
        renderItem={({ item: s }) => {
          const open = !s.ended_at;
          const dur =
            ((open ? Date.now() : new Date(s.ended_at!).getTime()) -
              new Date(s.started_at).getTime()) /
            1000;
          return (
            <Pressable
              onPress={() => router.push(open ? '/(tabs)/charging' : `/session/${s.id}`)}
              style={{
                backgroundColor: C.white,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border,
                padding: 14,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{ fontSize: 15, fontWeight: '700', color: C.ink, flex: 1 }}
                  numberOfLines={1}
                >
                  {s.charge_points?.locations?.name ?? s.charge_points?.name ?? 'Charger'}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '800',
                    color: C.green,
                    fontFamily: 'monospace',
                  }}
                >
                  {s.amount_gross != null
                    ? billing.formatSen(Math.round(Number(s.amount_gross) * 100))
                    : open
                      ? '…'
                      : '—'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Badge
                  status={open ? 'Charging' : s.status === 'completed' ? 'Available' : 'Unknown'}
                  label={open ? 'In progress' : s.status === 'completed' ? 'Completed' : s.status}
                />
                <Body muted style={{ fontSize: 12 }}>
                  {formatDateTime(s.started_at)} · {formatKwh(s.energy_wh, 1)} ·{' '}
                  {formatDuration(Math.max(0, dur))}
                </Body>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
