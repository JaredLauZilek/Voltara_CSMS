import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { C, FONT } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontsError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: C.white },
              headerTintColor: C.green,
              headerTitleStyle: { fontFamily: FONT.bold, color: C.green },
              headerShadowVisible: false,
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: C.seasalt },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="charger/[id]" options={{ title: 'Charger' }} />
            <Stack.Screen name="charger/[id]/settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="charger/[id]/household" options={{ title: 'Household' }} />
            <Stack.Screen
              name="onboarding/add"
              options={{ title: 'Add a charger', presentation: 'modal' }}
            />
            <Stack.Screen name="onboarding/scan" options={{ title: 'Scan QR code' }} />
            <Stack.Screen name="installer/register" options={{ title: 'Register a unit' }} />
            <Stack.Screen name="installer/commission/[id]" options={{ title: 'Commission' }} />
            <Stack.Screen name="dev/gatt" options={{ title: 'GATT explorer' }} />
            <Stack.Screen name="dev/bench" options={{ title: 'Simulator bench' }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
