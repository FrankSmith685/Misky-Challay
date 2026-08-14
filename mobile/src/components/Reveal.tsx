import { useEffect, type ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: ViewStyle;
}

/** Entrada breve y sobria. Respeta la preferencia de movimiento reducido. */
export function Reveal({ children, delay = 0, distance = 14, style }: RevealProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    progress.value = withDelay(
      reduceMotion ? 0 : delay,
      withTiming(1, {
        duration: reduceMotion ? 0 : 360,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [delay, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[styles.base, style, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  base: { width: '100%' },
});
