import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseChargerQr } from '@voltara/shared';
import { findChargerByCode } from '@/features/chargers/api';
import { C } from '@/lib/theme';

const FRAME = 260;

/**
 * Scan the QR code on a charger to open it, ready to start. The same screen
 * takes a typed charger ID, for a damaged sticker or a dark car park.
 */
export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The camera fires many times a second; one code is handled at a time, and
  // the same unreadable code is not retried until something else is seen.
  const lock = useRef(false);
  const lastBad = useRef<string | null>(null);

  const open = async (text: string, fromCamera: boolean) => {
    if (lock.current) return;
    if (fromCamera && text === lastBad.current) return;
    const qr = parseChargerQr(text);
    if (!qr) {
      lastBad.current = text;
      setMessage(
        fromCamera
          ? 'That is not a Voltara charger code. Look for the QR sticker on the charger.'
          : 'Check the charger ID and try again.',
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const id = await findChargerByCode(qr.code);
      if (!id) {
        lastBad.current = text;
        setMessage(`No charger found for ${qr.code}.`);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(qr.connectorId ? `/charger/${id}?gun=${qr.connectorId}` : `/charger/${id}`);
    } catch {
      setMessage('Could not look that charger up. Check your connection and try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const granted = permission?.granted === true;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {granted && !typing && (
        <CameraView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void open(data, true)}
        />
      )}

      {/* Top bar */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <RoundButton icon="close" label="Close" onPress={() => router.back()} />
        {granted && !typing && (
          <View style={{ marginLeft: 'auto' }}>
            <RoundButton
              icon={torch ? 'flashlight' : 'flashlight-outline'}
              label={torch ? 'Turn the torch off' : 'Turn the torch on'}
              active={torch}
              onPress={() => setTorch((v) => !v)}
            />
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}
        pointerEvents="box-none"
      >
        {typing ? (
          <View style={{ width: '100%', maxWidth: 360, gap: 12 }}>
            <Text style={{ color: C.white, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
              Enter the charger ID
            </Text>
            <Text style={{ color: '#D0D0D0', fontSize: 13, textAlign: 'center' }}>
              It is printed on the charger, near the QR code.
            </Text>
            <TextInput
              value={typed}
              onChangeText={(t) => {
                setTyped(t);
                setMessage(null);
              }}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. TEST-01"
              placeholderTextColor={C.slate}
              returnKeyType="go"
              onSubmitEditing={() => void open(typed, false)}
              style={{
                backgroundColor: C.white,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 18,
                fontWeight: '700',
                color: C.ink,
                textAlign: 'center',
              }}
            />
            <Pressable
              onPress={() => void open(typed, false)}
              disabled={busy || typed.trim().length < 3}
              style={{
                backgroundColor: C.yellow,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: busy || typed.trim().length < 3 ? 0.5 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color={C.green} />
              ) : (
                <Text style={{ color: C.green, fontSize: 16, fontWeight: '800' }}>
                  Find charger
                </Text>
              )}
            </Pressable>
          </View>
        ) : granted ? (
          <>
            <View
              style={{
                width: FRAME,
                height: FRAME,
                borderRadius: 28,
                borderWidth: 3,
                borderColor: busy ? C.yellow : C.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {busy && <ActivityIndicator color={C.yellow} size="large" />}
            </View>
            <Text style={{ color: C.white, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
              {busy ? 'Finding the charger…' : 'Point at the QR code on the charger'}
            </Text>
          </>
        ) : (
          <View style={{ maxWidth: 320, gap: 14, alignItems: 'center' }}>
            <Ionicons name="camera-outline" size={44} color={C.yellow} />
            <Text style={{ color: C.white, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
              Camera access is needed to scan
            </Text>
            <Text style={{ color: '#D0D0D0', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              {permission && !permission.canAskAgain
                ? 'Camera access is switched off for Voltara. Turn it on in your phone settings, or type the charger ID instead.'
                : 'Voltara uses the camera only to read the QR code on a charger.'}
            </Text>
            {(!permission || permission.canAskAgain) && (
              <Pressable
                onPress={() => void requestPermission()}
                style={{
                  backgroundColor: C.yellow,
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 28,
                }}
              >
                <Text style={{ color: C.green, fontSize: 16, fontWeight: '800' }}>
                  Allow camera
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {message && (
          <View
            style={{
              backgroundColor: C.errorBg,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              maxWidth: 340,
            }}
          >
            <Text style={{ color: C.error, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
              {message}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom + 24,
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={() => {
            setTyping((v) => !v);
            setMessage(null);
            lastBad.current = null;
          }}
          hitSlop={10}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(255,255,255,0.16)',
            borderRadius: 99,
            paddingHorizontal: 18,
            paddingVertical: 12,
          }}
        >
          <Ionicons
            name={typing ? 'qr-code-outline' : 'keypad-outline'}
            size={16}
            color={C.white}
          />
          <Text style={{ color: C.white, fontSize: 14, fontWeight: '700' }}>
            {typing ? 'Scan the QR code instead' : 'Type the charger ID instead'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: active ? C.yellow : 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={22} color={active ? C.green : C.white} />
    </Pressable>
  );
}
