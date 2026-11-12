import { PermissionsAndroid, Platform } from 'react-native';

export type BlePermission = 'granted' | 'denied' | 'unavailable';

/**
 * Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT at runtime. The
 * manifest declares SCAN with neverForLocation (app.json plugin option), so
 * no location permission is needed there. Android 6–11 need fine location
 * to receive scan results — an OS rule, not ours. iOS prompts by itself the
 * first time CoreBluetooth is used; the string lives in app.json.
 */
export async function requestBlePermissions(): Promise<BlePermission> {
  if (Platform.OS === 'web') return 'unavailable';
  if (Platform.OS !== 'android') return 'granted';

  const api =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10);
  const wanted =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(wanted);
  const ok = wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
  return ok ? 'granted' : 'denied';
}
