import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, layout, radius, shadow, spacing, type } from '../theme/tokens';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  /** Por defecto 'info'. 'error' vibra salvo que lo desactives con `haptic: false`. */
  tone?: ToastTone;
  /** Un solo botón, corto: «Ver carrito», «Deshacer». Cierra el aviso al pulsarlo. */
  action?: ToastAction;
  /** Por defecto 3,2 s; 5 s cuando lleva acción, para dar tiempo a leerla y pulsarla. */
  durationMs?: number;
  /** 'bottom' (por defecto) deja libre la barra de pestañas; 'top' evita tapar un teclado abierto. */
  placement?: 'bottom' | 'top';
  haptic?: boolean;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

interface ToastState extends Required<Omit<ToastOptions, 'action' | 'haptic'>> {
  id: number;
  action?: ToastAction;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Alto de la barra de pestañas (62 + inset) redondeado: el aviso nunca la tapa. */
const TAB_BAR_CLEARANCE = 70;
const ANIMATION_MS = 220;

const TONE_STYLE: Record<ToastTone, { background: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  success: { background: colors.brand700, icon: 'check-circle-outline' },
  error: { background: colors.danger, icon: 'alert-circle-outline' },
  warning: { background: colors.warning, icon: 'alert-outline' },
  info: { background: colors.surfaceDarkRaised, icon: 'information-outline' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [toast, setToast] = useState<ToastState | null>(null);

  const progress = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const clearTimers = useCallback(() => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    if (removeTimer.current !== null) clearTimeout(removeTimer.current);
    dismissTimer.current = null;
    removeTimer.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    progress.value = withTiming(0, {
      duration: reduceMotion ? 0 : ANIMATION_MS,
      easing: Easing.in(Easing.quad),
    });
    // Se desmonta cuando la salida ha terminado; con movimiento reducido, ya.
    removeTimer.current = setTimeout(() => setToast(null), reduceMotion ? 0 : ANIMATION_MS);
  }, [clearTimers, progress, reduceMotion]);

  const show = useCallback(
    (options: ToastOptions) => {
      const tone = options.tone ?? 'info';
      const withAction = options.action !== undefined;

      clearTimers();
      counter.current += 1;
      setToast({
        id: counter.current,
        message: options.message,
        tone,
        action: options.action,
        durationMs: options.durationMs ?? (withAction ? 5_000 : 3_200),
        placement: options.placement ?? 'bottom',
      });

      // El error es el único aviso que vibra por su cuenta: los demás gestos
      // (añadir al carrito, cambiar cantidad) ya vibran donde se originan.
      if (options.haptic ?? tone === 'error') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      progress.value = withTiming(1, {
        duration: reduceMotion ? 0 : ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
      });
    },
    [clearTimers, progress, reduceMotion],
  );

  // Un temporizador por aviso: si llega otro mientras se ve, el anterior se
  // reemplaza y su cuenta atrás se descarta con él.
  useEffect(() => {
    if (!toast) return;
    dismissTimer.current = setTimeout(hide, toast.durationMs);
    return () => {
      if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    };
  }, [hide, toast]);

  useEffect(() => clearTimers, [clearTimers]);

  const animatedStyle = useAnimatedStyle(() => {
    const travel = toast?.placement === 'top' ? -24 : 24;
    return {
      opacity: progress.value,
      // Con movimiento reducido el aviso solo aparece y desaparece: no viaja.
      transform: [{ translateY: reduceMotion ? 0 : (1 - progress.value) * travel }],
    };
  });

  const api = useMemo<ToastApi>(() => ({ show, hide }), [hide, show]);

  const placement = toast?.placement ?? 'bottom';
  const tone = TONE_STYLE[toast?.tone ?? 'info'];

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <View
          pointerEvents="box-none"
          style={[
            styles.layer,
            placement === 'bottom'
              ? { bottom: insets.bottom + TAB_BAR_CLEARANCE }
              : { top: insets.top + spacing.sm },
          ]}
        >
          <Animated.View
            accessibilityLiveRegion="polite"
            accessibilityLabel={toast.message}
            style={[styles.card, { backgroundColor: tone.background }, shadow.lg, animatedStyle]}
          >
            <MaterialCommunityIcons name={tone.icon} size={22} color={colors.onDark} />

            <Text numberOfLines={3} style={styles.message}>
              {toast.message}
            </Text>

            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={layout.iconHitSlop}
                onPress={() => {
                  const run = toast.action?.onPress;
                  hide();
                  run?.();
                }}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <Text style={styles.actionLabel}>{toast.action.label}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar aviso"
                hitSlop={layout.iconHitSlop}
                onPress={hide}
                style={styles.close}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.onDarkMuted} />
              </Pressable>
            )}
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider');
  return context;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 56,
    paddingVertical: 12,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
  },
  message: {
    ...type.body,
    flex: 1,
    color: colors.onDark,
  },
  action: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionPressed: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  actionLabel: {
    ...type.label,
    color: colors.onDark,
    textTransform: 'uppercase',
  },
  close: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
