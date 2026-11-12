// Small hand-rolled kit in the Voltara idiom — no component library (§14).
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { STATUS, font, useTheme } from './theme';

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
        ...font('bold'),
        color: t.slate,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: object }) {
  const t = useTheme();
  return (
    <Text
      style={[{ fontSize: 22, ...font('extrabold'), color: t.green, letterSpacing: -0.4 }, style]}
    >
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
    <Text
      style={[
        { fontSize: 14, ...font('regular'), color: muted ? t.slate : t.ink, lineHeight: 20 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** KPI numeral: 32/700/-0.04em in the design system. */
export function Numeral({
  value,
  unit,
  accent = false,
}: {
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text
        style={{
          fontSize: 32,
          ...font('bold'),
          letterSpacing: -1.2,
          color: accent ? t.yellow : t.green,
        }}
      >
        {value}
      </Text>
      {unit ? (
        <Text style={{ fontSize: 14, ...font('semibold'), color: accent ? t.honeydew : t.slate }}>
          {unit}
        </Text>
      ) : null}
    </View>
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
      <Text style={{ fontSize: 11, ...font('bold'), color: s.color }}>{label ?? status}</Text>
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
        <Text style={{ color: fg, fontSize: 15, ...font('bold') }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.slate}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 10,
          padding: 12,
          fontSize: 16,
          ...font('regular'),
          backgroundColor: t.white,
          color: t.ink,
        },
        props.style,
      ]}
    />
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>
  );
}

/** Key–value line used in detail cards: label left, value right. */
export function KV({ k, v }: { k: string; v: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: t.divider,
      }}
    >
      <Text style={{ fontSize: 13, ...font('regular'), color: t.slate }}>{k}</Text>
      {typeof v === 'string' || typeof v === 'number' ? (
        <Text style={{ fontSize: 14, ...font('semibold'), color: t.ink }}>{v}</Text>
      ) : (
        v
      )}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{ padding: 32, textAlign: 'center', color: t.slate, fontSize: 14, ...font('regular') }}
    >
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 12, color: t.error, ...font('semibold'), lineHeight: 18 }}>
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
