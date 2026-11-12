// Hand-rolled SVG bar chart (no chart libraries). Tallest bar carries the
// value; the rest are read against it.
import { Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { C, font } from '@/lib/theme';

export interface Bar {
  label: string;
  value: number;
}

export function DailyBars({
  bars,
  height = 110,
  unit = 'kWh',
  accent = C.green,
  muted = C.honeydew,
}: {
  bars: Bar[];
  height?: number;
  unit?: string;
  accent?: string;
  muted?: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const n = Math.max(1, bars.length);
  const gap = 6;
  const chartH = height - 18;
  return (
    <View>
      <View style={{ height: chartH, flexDirection: 'row', alignItems: 'flex-end' }}>
        {bars.map((b, i) => {
          const h = Math.max(3, (b.value / max) * chartH);
          const isMax = b.value === max && b.value > 0;
          return (
            <View
              key={`${b.label}-${i}`}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginHorizontal: gap / 2,
              }}
            >
              {isMax && (
                <Text style={{ fontSize: 10, ...font('bold'), color: accent, marginBottom: 2 }}>
                  {b.value.toFixed(b.value >= 10 ? 0 : 1)} {unit}
                </Text>
              )}
              <Svg width="100%" height={h}>
                <Rect
                  x={0}
                  y={0}
                  width="100%"
                  height={h}
                  rx={4}
                  fill={b.value > 0 ? (isMax ? accent : muted) : C.divider}
                />
              </Svg>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {bars.map((b, i) => (
          <Text
            key={`${b.label}-l${i}`}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 9,
              ...font('semibold'),
              color: C.slate,
            }}
            numberOfLines={1}
          >
            {n > 10 && i % 2 === 1 ? '' : b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
