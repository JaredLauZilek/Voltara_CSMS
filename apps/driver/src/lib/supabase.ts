import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import type { Database } from '@voltara/shared/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing — see apps/driver/.env.example');
}

// Sessions live in the device keychain. SecureStore caps values at 2 KB on
// some Android versions; the Supabase session fits, but split-on-overflow is
// the documented mitigation and cheap to add here.
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return SecureStore.getItemAsync(key);
    let out = '';
    for (let i = 0; i < Number(count); i += 1) out += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? '';
    return out;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
    if (value.length <= CHUNK) {
      await SecureStore.deleteItemAsync(`${key}.n`);
      return SecureStore.setItemAsync(key, value);
    }
    const parts = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < parts; i += 1) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(parts));
    await SecureStore.deleteItemAsync(key);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
    const count = await SecureStore.getItemAsync(`${key}.n`);
    for (let i = 0; i < Number(count ?? 0); i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'anon', {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // The magic link lands via deep link and we parse it ourselves.
    detectSessionInUrl: false,
  },
});

// Refresh tokens while the app is in the foreground only.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
