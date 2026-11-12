import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useActor } from '@/features/profile';
import { useAuth } from '@/lib/auth';
import { C, FONT } from '@/lib/theme';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { data: actor } = useActor();
  if (!loading && !session) return <Redirect href="/auth/sign-in" />;
  const installer = !!actor?.dealer_role || !!actor?.staff_role;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTitleStyle: { fontFamily: FONT.bold, color: C.green },
        headerShadowVisible: false,
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.slate,
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 11, fontFamily: FONT.semibold },
        sceneStyle: { backgroundColor: C.seasalt },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chargers',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="installer"
        options={{
          title: 'Install',
          href: installer ? '/(tabs)/installer' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
