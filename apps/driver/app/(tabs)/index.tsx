import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mapLinks } from '@voltara/shared';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { useCoords, useNearbyChargers } from '@/features/chargers/hooks';
import { SiteMap, type MapFocus } from '@/features/chargers/SiteMap';
import { formatDistance, groupSites, siteState, type Site } from '@/features/chargers/sites';
import { C, STATUS } from '@/lib/theme';

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 5,
} as const;

/**
 * The home screen: every site a driver can use, on a map. Search and two
 * filters on top; tap a pin for the site, its chargers and directions.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const coords = useCoords();
  const { data = [], isLoading } = useNearbyChargers(coords);

  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyDc, setOnlyDc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const sites = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groupSites(data).filter(
      (site) =>
        (!onlyFree || site.available > 0) &&
        (!onlyDc || site.hasDc) &&
        (!s ||
          `${site.site_name} ${site.operator_name} ${site.city ?? ''} ${site.address ?? ''}`
            .toLowerCase()
            .includes(s)),
    );
  }, [data, q, onlyFree, onlyDc]);

  const selected = sites.find((s) => s.location_id === selectedId) ?? null;

  const goTo = (site: Site) => {
    setSelectedId(site.location_id);
    setListOpen(false);
    if (site.lat != null && site.lng != null) {
      setFocus({ lat: site.lat, lng: site.lng, key: Date.now(), zoom: 'site' });
    }
  };

  const locate = () => {
    if (coords) setFocus({ lat: coords.lat, lng: coords.lng, key: Date.now(), zoom: 'area' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.seasalt }}>
      <SiteMap
        sites={sites}
        selectedId={selectedId}
        onSelect={(site) => (site ? goTo(site) : setSelectedId(null))}
        focus={
          focus ?? (coords ? { lat: coords.lat, lng: coords.lng, key: 0, zoom: 'area' } : null)
        }
        showsUser={Boolean(coords)}
      />

      {/* Search and filters */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 10 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: C.white,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.border,
            paddingHorizontal: 16,
            ...shadow,
          }}
        >
          <Ionicons name="search" size={18} color={C.slate} />
          <TextInput
            value={q}
            onChangeText={(t) => {
              setQ(t);
              if (t.trim()) setListOpen(true);
            }}
            placeholder="Search a place or station"
            placeholderTextColor={C.slate}
            returnKeyType="search"
            style={{ flex: 1, paddingVertical: 14, fontSize: 16, color: C.ink }}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={C.slate} />
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip
            label="Available now"
            icon="flash"
            on={onlyFree}
            onPress={() => setOnlyFree((v) => !v)}
          />
          <Chip
            label="DC fast"
            icon="speedometer-outline"
            on={onlyDc}
            onPress={() => setOnlyDc((v) => !v)}
          />
        </View>
      </View>

      {/* Stations count and locate-me, or the selected site */}
      {!listOpen && !selected && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={() => setListOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: C.white,
              borderRadius: 99,
              borderWidth: 1,
              borderColor: C.border,
              paddingHorizontal: 18,
              paddingVertical: 12,
              ...shadow,
            }}
          >
            <Ionicons name="list" size={18} color={C.green} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.green }}>
              {isLoading || coords === undefined
                ? 'Finding stations…'
                : `${sites.length} station${sites.length === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
          <Pressable
            onPress={locate}
            disabled={!coords}
            accessibilityLabel="Centre the map on me"
            style={{
              marginLeft: 'auto',
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: C.white,
              borderWidth: 1,
              borderColor: C.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: coords ? 1 : 0.5,
              ...shadow,
            }}
          >
            <Ionicons name="navigate-outline" size={20} color={C.green} />
          </Pressable>
        </View>
      )}

      {!listOpen && selected && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom }}>
          <SiteCard site={selected} onClose={() => setSelectedId(null)} />
        </View>
      )}

      {listOpen && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: insets.top + 124,
            backgroundColor: C.white,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 1,
            borderColor: C.border,
            ...shadow,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: C.divider,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.green }}>
              {sites.length} station{sites.length === 1 ? '' : 's'}
            </Text>
            <Pressable
              onPress={() => setListOpen(false)}
              hitSlop={10}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="map-outline" size={16} color={C.green} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.green }}>Map</Text>
            </Pressable>
          </View>
          <FlatList
            data={sites}
            keyExtractor={(s) => s.location_id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: bottom }}
            ListEmptyComponent={
              <Text style={{ padding: 32, textAlign: 'center', color: C.slate, fontSize: 14 }}>
                {isLoading ? 'Finding stations…' : 'No stations match.'}
              </Text>
            }
            renderItem={({ item }) => <SiteRow site={item} onPress={() => goTo(item)} />}
          />
        </View>
      )}
    </View>
  );
}

function Chip({
  label,
  icon,
  on,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 99,
        backgroundColor: on ? C.green : C.white,
        borderWidth: 1,
        borderColor: on ? C.green : C.border,
        ...shadow,
      }}
    >
      <Ionicons name={icon} size={14} color={on ? C.yellow : C.green} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? C.white : C.ink }}>{label}</Text>
    </Pressable>
  );
}

const STATE_BADGE = { available: 'Available', busy: 'Charging', offline: 'Offline' } as const;

function freeLabel(site: Site): string {
  return site.online ? `${site.available} of ${site.guns} free` : 'Offline';
}

function SiteRow({ site, onPress }: { site: Site; onPress: () => void }) {
  const s = STATUS[STATE_BADGE[siteState(site)]]!;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
        backgroundColor: pressed ? C.hoverRow : C.white,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }} numberOfLines={1}>
          {site.site_name}
        </Text>
        <Text style={{ fontSize: 12, color: C.slate }} numberOfLines={1}>
          {[
            site.operator_name,
            formatDistance(site.distance_km),
            site.maxKw ? `up to ${site.maxKw} kW` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: s.bg,
          borderRadius: 99,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: s.color }}>{freeLabel(site)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.slate} />
    </Pressable>
  );
}

/** The sheet for one site: what is free, what it costs, how to get there, and its chargers. */
function SiteCard({ site, onClose }: { site: Site; onClose: () => void }) {
  const links = mapLinks(site.lat, site.lng);
  const s = STATUS[STATE_BADGE[siteState(site)]]!;
  return (
    <View
      style={{
        backgroundColor: C.white,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        gap: 12,
        ...shadow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: C.slate,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {site.operator_name}
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.green }} numberOfLines={2}>
            {site.site_name}
          </Text>
          <Text style={{ fontSize: 13, color: C.slate }} numberOfLines={1}>
            {[
              formatDistance(site.distance_km),
              site.maxKw ? `up to ${site.maxKw} kW` : null,
              site.tariff_text,
            ]
              .filter(Boolean)
              .join(' · ') ||
              site.address ||
              ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={C.slate} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            backgroundColor: s.bg,
            borderRadius: 99,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: s.color }}>{freeLabel(site)}</Text>
        </View>
        {links && (
          <>
            <Pressable
              onPress={() => void Linking.openURL(links.googleMaps)}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="navigate" size={14} color={C.green} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>Google Maps</Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(links.waze)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 12 }}
            >
              <Ionicons name="navigate" size={14} color={C.green} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.green }}>Waze</Text>
            </Pressable>
          </>
        )}
      </View>

      <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ gap: 8 }}>
        {site.chargers.map((c) => {
          const online = c.connection_state === 'online';
          const free = online ? c.connectors.filter((k) => k.status === 'Available').length : 0;
          const lots = c.connectors.map((k) => k.parking_lot).filter(Boolean);
          const kw = Math.max(0, ...c.connectors.map((k) => Number(k.max_kw ?? 0)));
          return (
            <Pressable
              key={c.charge_point_id}
              onPress={() => router.push(`/charger/${c.charge_point_id}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: pressed ? C.hoverRow : C.seasalt,
              })}
            >
              <Ionicons name="flash" size={18} color={online && free > 0 ? C.green : C.slate} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }} numberOfLines={1}>
                  {lots.length ? `Lot ${lots.join(' · ')}` : c.charge_point_name}
                </Text>
                <Text style={{ fontSize: 12, color: C.slate }}>
                  {[c.connectors[0]?.type, kw ? `${kw} kW` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: online ? C.green : C.slate }}>
                {online ? `${free}/${c.connectors.length} free` : 'Offline'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={C.slate} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
