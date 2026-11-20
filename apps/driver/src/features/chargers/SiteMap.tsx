import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';
import { siteState, type Site, type SiteState } from './sites';

export interface MapFocus {
  lat: number;
  lng: number;
  /** Changes whenever the map should move, even to the same point. */
  key: number;
  /** Street-level for one site, wider for "around me". */
  zoom?: 'site' | 'area';
}

export interface SiteMapProps {
  sites: Site[];
  selectedId: string | null;
  onSelect: (site: Site | null) => void;
  focus: MapFocus | null;
  showsUser: boolean;
}

/** Klang Valley — where the map opens before it knows anything better. */
const FALLBACK = { latitude: 3.139, longitude: 101.6869 };

const PIN: Record<SiteState, { bg: string; fg: string }> = {
  available: { bg: C.green, fg: C.yellow },
  busy: { bg: C.info, fg: C.white },
  offline: { bg: C.slate, fg: C.white },
};

/**
 * The map itself (native only — see SiteMap.web.tsx). One pin per site,
 * coloured by whether a car could charge there now, with the number of free
 * guns on it. Apple Maps on iOS, Google Maps on Android, as the platform ships.
 */
export function SiteMap({ sites, selectedId, onSelect, focus, showsUser }: SiteMapProps) {
  const map = useRef<MapView>(null);
  const placed = sites.filter((s) => s.lat != null && s.lng != null);

  useEffect(() => {
    if (!focus) return;
    const delta = focus.zoom === 'site' ? 0.012 : 0.08;
    map.current?.animateToRegion(
      { latitude: focus.lat, longitude: focus.lng, latitudeDelta: delta, longitudeDelta: delta },
      450,
    );
  }, [focus]);

  const first = placed[0];
  return (
    <MapView
      ref={map}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: focus?.lat ?? first?.lat ?? FALLBACK.latitude,
        longitude: focus?.lng ?? first?.lng ?? FALLBACK.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
      showsUserLocation={showsUser}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      onPress={() => onSelect(null)}
    >
      {placed.map((s) => {
        const state = siteState(s);
        const selected = s.location_id === selectedId;
        const pin = PIN[state];
        return (
          <Marker
            key={s.location_id}
            coordinate={{ latitude: s.lat!, longitude: s.lng! }}
            anchor={{ x: 0.5, y: 1 }}
            onPress={(e) => {
              e.stopPropagation();
              onSelect(s);
            }}
            accessibilityLabel={`${s.site_name}, ${s.available} of ${s.guns} free`}
          >
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  minWidth: selected ? 46 : 38,
                  height: selected ? 46 : 38,
                  paddingHorizontal: 8,
                  borderRadius: 14,
                  backgroundColor: pin.bg,
                  borderWidth: 3,
                  borderColor: C.white,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <Ionicons name="flash" size={selected ? 16 : 14} color={pin.fg} />
                {state !== 'offline' && (
                  <Text style={{ color: pin.fg, fontWeight: '800', fontSize: selected ? 15 : 13 }}>
                    {s.available}
                  </Text>
                )}
              </View>
              <View
                style={{
                  width: 0,
                  height: 0,
                  marginTop: -2,
                  borderLeftWidth: 6,
                  borderRightWidth: 6,
                  borderTopWidth: 8,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderTopColor: C.white,
                }}
              />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}
