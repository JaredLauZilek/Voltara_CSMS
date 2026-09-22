// Small hand-rolled kit in the Voltara idiom — no component library (§14).
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { STATUS, useTheme } from './theme';

export function Screen({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.seasalt }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.white,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.border,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: t.slate,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 22, fontWeight: '800', color: t.green, letterSpacing: -0.4 }}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: object;
}) {
  const t = useTheme();
  return (
    <Text style={[{ fontSize: 14, color: muted ? t.slate : t.ink, lineHeight: 20 }, style]}>
      {children}
    </Text>
  );
}

export function Badge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? STATUS.Unknown;
  return (
    <View
      style={{
        backgroundColor: s.bg,
        borderRadius: 99,
        paddingHorizontal: 10,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: s.color }}>{label ?? status}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.green : variant === 'danger' ? t.error : t.white;
  const fg = variant === 'secondary' ? t.green : t.white;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: off ? t.slate : bg,
          borderColor: variant === 'secondary' ? t.border : 'transparent',
          opacity: pressed ? 0.85 : off ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ padding: 32, textAlign: 'center', color: t.slate, fontSize: 14 }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
