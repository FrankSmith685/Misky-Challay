import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureDetector, GestureHandlerRootView, Gesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, layout, radius, shadow, spacing, type } from '../theme/tokens';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Oculta el asa y bloquea el arrastre: para hojas que exigen una decisión. */
  dismissible?: boolean;
  /** Altura máxima como fracción de la pantalla. Por defecto 0.9. */
  maxHeightRatio?: number;
  /** Etiqueta para lectores de pantalla cuando la hoja no lleva título visible. */
  accessibilityLabel?: string;
}

const ANIMATION_MS = 260;
/** Arrastre a partir del cual se cierra al soltar, o velocidad de un gesto claramente descendente. */
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 900;

/**
 * Hoja inferior real: se arrastra, se cierra tocando el velo y anima al entrar
 * y al salir. Sustituye a las tres hojas pintadas a mano que tenían un asa
 * decorativa sin ningún gesto detrás.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  dismissible = true,
  maxHeightRatio = 0.9,
  accessibilityLabel,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // El Modal se desmonta solo cuando la animación de salida ha terminado.
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(windowHeight);
  /**
   * El alto real de la hoja vive en un valor compartido, no en el estado: lo
   * necesitan el gesto y el velo en el hilo de UI, y medirlo no debe provocar
   * un render ni reiniciar la animación de entrada.
   */
  const sheetHeight = useSharedValue(windowHeight * 0.5);
  const duration = reduceMotion ? 0 : ANIMATION_MS;

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      translateY.value = sheetHeight.value; // punto de partida, fuera de pantalla
      translateY.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) });
      return;
    }

    translateY.value = withTiming(
      sheetHeight.value,
      { duration, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(unmount)();
      },
    );
  }, [duration, mounted, sheetHeight, translateY, unmount, visible]);

  const onSheetLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) sheetHeight.value = measured;
  };

  const pan = Gesture.Pan()
    .enabled(dismissible)
    // Solo interesa el arrastre hacia abajo; hacia arriba la hoja no crece.
    .activeOffsetY(12)
    .failOffsetY(-12)
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldClose = event.translationY > CLOSE_DISTANCE || event.velocityY > CLOSE_VELOCITY;
      if (shouldClose) {
        translateY.value = withTiming(sheetHeight.value, {
          duration,
          easing: Easing.in(Easing.cubic),
        });
        runOnJS(onClose)();
        return;
      }
      translateY.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    // El velo se aclara a la vez que la hoja baja: da sensación de peso.
    opacity: sheetHeight.value > 0 ? 1 - Math.min(1, translateY.value / sheetHeight.value) : 1,
  }));

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdropLayer, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            disabled={!dismissible}
            onPress={onClose}
            style={styles.backdrop}
          />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel ?? title}
            onLayout={onSheetLayout}
            style={[
              styles.sheet,
              shadow.lg,
              { maxHeight: windowHeight * maxHeightRatio, paddingBottom: insets.bottom + spacing.md },
              sheetStyle,
            ]}
          >
            {dismissible && <View style={styles.handle} />}

            {(title || subtitle) && (
              <View style={styles.header}>
                <View style={styles.headerText}>
                  {title ? <Text style={styles.title}>{title}</Text> : null}
                  {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                </View>

                {dismissible && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar"
                    hitSlop={layout.iconHitSlop}
                    onPress={onClose}
                    style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons name="close" size={20} color={colors.inkMuted} />
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.body}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.backdrop,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginTop: spacing.sm + spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...type.heading,
    color: colors.ink,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  close: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    paddingTop: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
});
