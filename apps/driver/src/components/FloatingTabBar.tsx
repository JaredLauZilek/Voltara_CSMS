import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/lib/theme';

/** Height the bar takes above the bottom inset — screens pad by this to clear it. */
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_GAP = 10;

type IconName = keyof typeof Ionicons.glyphMap;

/** Tab route name → label and icons. Order here is the order on screen. */
const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Map', icon: 'map-outline', iconActive: 'map' },
  charging: { label: 'Charging', icon: 'battery-charging-outline', iconActive: 'battery-charging' },
  history: { label: 'History', icon: 'receipt-outline', iconActive: 'receipt' },
  profile: { label: 'Me', icon: 'person-circle-outline', iconActive: 'person-circle' },
};

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

/**
 * The app's bottom bar: a floating pill with two tabs either side of a round
 * Scan button. Scanning is the one thing a driver standing at a charger wants,
 * so it sits under the thumb on every tab.
 */
export function FloatingTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => r.name in TABS);
  const half = Math.ceil(routes.length / 2);

  const tab = (route: { key: string; name: string }) => {
    const def = TABS[route.name]!;
    const active = state.routes[state.index]?.key === route.key;
    return (
      <Pressable
        key={route.key}
        onPress={() => navigation.navigate(route.name)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={def.label}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          height: TAB_BAR_HEIGHT - 12,
          borderRadius: 99,
          backgroundColor: active ? C.honeydew : 'transparent',
        }}
      >
        <Ionicons
          name={active ? def.iconActive : def.icon}
          size={22}
          color={active ? C.green : C.slate}
        />
        <Text
          style={{
            fontSize: 11,
            fontWeight: active ? '700' : '600',
            color: active ? C.green : C.slate,
          }}
        >
          {def.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom, 12) + TAB_BAR_GAP - 6,
      }}
    >
      <View
        style={{
          height: TAB_BAR_HEIGHT,
          borderRadius: 99,
          backgroundColor: C.white,
          borderWidth: 1,
          borderColor: C.border,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {routes.slice(0, half).map(tab)}
        <View style={{ width: 76, alignItems: 'center' }}>
          <Pressable
            onPress={() => router.push('/scan' as Href)}
            accessibilityRole="button"
            accessibilityLabel="Scan a charger's QR code"
            style={({ pressed }) => ({
              width: 60,
              height: 60,
              borderRadius: 30,
              marginTop: -18,
              backgroundColor: C.green,
              borderWidth: 4,
              borderColor: C.white,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            })}
          >
            <Ionicons name="qr-code-outline" size={26} color={C.yellow} />
          </Pressable>
        </View>
        {routes.slice(half).map(tab)}
      </View>
    </View>
  );
}

/** Bottom padding a scrolling screen needs so its last row clears the bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + TAB_BAR_GAP + TAB_BAR_HEIGHT + 12;
}
