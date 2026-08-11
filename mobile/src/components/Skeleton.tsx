import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '../theme/tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Radio del bloque. `pill` para avatares y chips. */
  rounded?: 'sm' | 'md' | 'lg' | 'pill';
  /** Cuántos bloques iguales apilar (una lista en carga). */
  count?: number;
  gap?: number;
  style?: ViewStyle;
}

const RADIUS: Record<NonNullable<SkeletonProps['rounded']>, number> = {
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  pill: radius.pill,
};

/**
 * Bloque gris con pulso para la primera carga. El spinner queda reservado a los
 * botones: en una pantalla vacía el esqueleto dice además cómo será el contenido.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = 'sm',
  count = 1,
  gap = spacing.sm,
  style,
}: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.65;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const blocks = Array.from({ length: Math.max(1, count) }, (_, index) => index);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando contenido" style={style}>
      {blocks.map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.block,
            { width, height, borderRadius: RADIUS[rounded] },
            index > 0 && { marginTop: gap },
            animatedStyle,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.line,
  },
});
