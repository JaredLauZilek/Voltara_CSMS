// Animated state-of-charge ring. Pure SVG (no chart libraries, §14), with a
// short easing so one-second status updates read as a smooth fill.
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, type CircleProps } from 'react-native-svg';

// react-native-svg's class component types do not satisfy Animated's generic; the cast is type-only.
const AnimatedCircle = Animated.createAnimatedComponent(
  Circle as unknown as ComponentType<CircleProps>,
);

export function SocRing({
  progress,
  size = 200,
  stroke = 14,
  color,
  track,
  glow,
  children,
}: {
  /** 0–1 */
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  track: string;
  /** Optional soft outer ring (pulse while charging). */
  glow?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, anim]);

  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {glow && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r + stroke / 2 + 3}
            stroke={glow}
            strokeWidth={2}
            fill="none"
            opacity={0.5}
          />
        )}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
