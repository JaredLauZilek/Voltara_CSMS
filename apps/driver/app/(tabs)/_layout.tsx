import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/auth/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTitleStyle: { fontWeight: '700', color: C.green },
        headerShadowVisible: false,
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.slate,
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: C.seasalt },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chargers', tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} /> }} />
      <Tabs.Screen name="charging" options={{ title: 'Charging', tabBarIcon: ({ color, size }) => <Ionicons name="battery-charging" size={size} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
