// The claim code printed on a unit doubles as its BLE PIN (HiCi driver). We
// keep it in the device keychain, per serial, from the moment the owner
// claims the charger — the backend only ever stores a hash of it.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const key = (serial: string) => `voltara.pin.${serial.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export async function savePin(serial: string, pin: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key(serial), pin);
  await SecureStore.setItemAsync(key(serial), pin);
}

export async function loadPin(serial: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key(serial)) ?? null;
  return SecureStore.getItemAsync(key(serial));
}

export async function forgetPin(serial: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key(serial));
  await SecureStore.deleteItemAsync(key(serial));
}
