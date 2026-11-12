import { useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Body, Button, Card, Empty, Screen } from '@/lib/ui';

/**
 * Accepts: voltarahome://claim?serial=…&code=… · JSON {"serial","code"} ·
 * "SERIAL;CODE" · or a bare serial (the code is then typed by hand).
 */
export function parseClaimQr(raw: string): { serial: string; code?: string } | null {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const serial = url.searchParams.get('serial');
    if (serial)
      return { serial: serial.toUpperCase(), code: url.searchParams.get('code') ?? undefined };
  } catch {
    // not a URL
  }
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text) as { serial?: string; code?: string };
      if (j.serial)
        return {
          serial: String(j.serial).toUpperCase(),
          code: j.code ? String(j.code) : undefined,
        };
    } catch {
      // not JSON
    }
  }
  const m = /^([A-Z0-9-]{4,40})[;:,\s]+(\d{6})$/i.exec(text);
  if (m) return { serial: m[1].toUpperCase(), code: m[2] };
  if (/^[A-Z0-9-]{4,40}$/i.test(text)) return { serial: text.toUpperCase() };
  return null;
}

export default function ScanQr() {
  const [permission, requestPermission] = useCameraPermissions();
  const [done, setDone] = useState(false);
  const [bad, setBad] = useState(false);

  if (!permission)
    return (
      <Screen>
        <Empty>…</Empty>
      </Screen>
    );
  if (!permission.granted) {
    return (
      <Screen>
        <Card style={{ margin: 16, gap: 10 }}>
          <Body>Camera access is needed to scan the QR code on the charger.</Body>
          <Button title="Allow camera" onPress={() => void requestPermission()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done) return;
          const parsed = parseClaimQr(data);
          if (!parsed) {
            setBad(true);
            return;
          }
          setDone(true);
          router.replace({ pathname: '/onboarding/add', params: parsed });
        }}
      />
      <View style={{ padding: 16 }}>
        <Body muted style={{ textAlign: 'center' }}>
          {bad
            ? 'That code is not a Voltara charger label.'
            : 'Point the camera at the label on the charger.'}
        </Body>
      </View>
    </Screen>
  );
}
