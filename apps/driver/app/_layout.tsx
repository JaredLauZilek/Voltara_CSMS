import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { C } from '@/lib/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: C.white },
              headerTintColor: C.green,
              headerTitleStyle: { fontWeight: '700', color: C.green },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: C.seasalt },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="charger/[id]" options={{ title: 'Charger' }} />
            <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
            <Stack.Screen name="join" options={{ title: 'Join a site', presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
