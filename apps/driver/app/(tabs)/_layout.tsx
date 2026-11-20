import { Redirect, Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { useAuth } from '@/lib/auth';
import { C } from '@/lib/theme';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/auth/sign-in" />;
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTitleStyle: { fontWeight: '700', color: C.green },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: C.seasalt },
      }}
    >
      {/* The map runs edge to edge under the floating bar; the others are plain lists. */}
      <Tabs.Screen name="index" options={{ title: 'Map', headerShown: false }} />
      <Tabs.Screen name="charging" options={{ title: 'Charging' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
  );
}
