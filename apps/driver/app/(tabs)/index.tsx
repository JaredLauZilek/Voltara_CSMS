import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoords, useNearbyChargers } from '@/features/chargers/hooks';
import type { NearbyCharger } from '@/features/chargers/api';
import { C, STATUS } from '@/lib/theme';
import { Badge, Body, Empty, Label, Screen } from '@/lib/ui';

/** Nearest chargers first; each row is one charge point with its connectors. */
export default function Chargers() {
  const coords = useCoords();
  const { data = [], isLoading, refetch, isRefetching } = useNearbyChargers(coords);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? data.filter((r) => `${r.site_name} ${r.operator_name} ${r.city ?? ''} ${r.charge_point_name}`.toLowerCase().includes(s)) : data;
  }, [data, q]);

  return (
    <Screen>
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, borderRadius: 99, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 }}>
          <Ionicons name="search" size={16} color={C.slate} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search sites or operators" style={{ flex: 1, paddingVertical: 10, fontSize: 15 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Body muted style={{ fontSize: 12 }}>{coords === undefined ? 'Finding you…' : coords === null ? 'Location off · showing all sites' : `${rows.length} chargers near you`}</Body>
          <Link href="/join" asChild>
            <Pressable style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="key-outline" size={14} color={C.green} />
              <Text style={{ color: C.green, fontWeight: '700', fontSize: 13 }}>Join a site</Text>
            </Pressable>
          </Link>
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.charge_point_id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.green} />}
        ListEmptyComponent={!isLoading ? <Empty>{coords === undefined ? '' : 'No chargers found. Pull to refresh, or widen your search.'}</Empty> : null}
        renderItem={({ item }) => <ChargerRow r={item} />}
      />
    </Screen>
  );
}

function ChargerRow({ r }: { r: NearbyCharger }) {
  const online = r.connection_state === 'online';
  const available = online ? r.connectors.filter((k) => k.status === 'Available').length : 0;
  return (
    <Pressable onPress={() => router.push(`/charger/${r.charge_point_id}`)} style={({ pressed }) => ({ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 8, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: online ? C.honeydew : C.divider, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: online ? C.green : C.slate }}>⚡</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }} numberOfLines={1}>{r.site_name}</Text>
          <Body muted style={{ fontSize: 12 }} >{r.operator_name}{r.city ? ` · ${r.city}` : ''}{r.distance_km != null ? ` · ${r.distance_km < 1 ? `${Math.round(r.distance_km * 1000)} m` : `${r.distance_km.toFixed(1)} km`}` : ''}</Body>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Badge status={online ? (available > 0 ? 'Available' : 'Charging') : 'Offline'} label={online ? `${available}/${r.connectors.length} free` : 'Offline'} />
          {r.tariff_text && <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>{r.tariff_text}</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {r.connectors.map((k) => {
          const s = STATUS[online ? k.status : 'Offline'] ?? STATUS.Unknown;
          return (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: s.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: s.color }}>{k.type}{k.max_kw ? ` ${k.max_kw} kW` : ''}</Text>
            </View>
          );
        })}
      </View>
      {r.charge_point_name !== r.site_name && <Label>{r.charge_point_name}</Label>}
    </Pressable>
  );
}
