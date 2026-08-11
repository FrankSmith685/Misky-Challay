import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, layout, radius, spacing, type } from '../theme/tokens';
import type { ToneName } from '../theme/tokens';

export interface ScreenScaffoldProps {
  children: ReactNode;
  /**
   * 'light' = fondo claro con texto oscuro (lo habitual).
   * 'dark'  = fondo de marca oscuro; monta la barra de estado en blanco, que es
   *           exactamente lo que faltaba en las ocho pantallas ilegibles.
   */
  tone?: ToneName;
  title?: string;
  subtitle?: string;
  /** Muestra la flecha de volver. Por defecto se muestra si hay a dónde volver. */
  showBack?: boolean;
  /** Acción propia del botón atrás; si se omite, vuelve en la pila de navegación. */
  onBack?: () => void;
  /** Un icono o botón a la derecha de la cabecera (campana, favoritos…). */
  headerRight?: ReactNode;
  /** Barra fija inferior para la acción principal (el CTA del checkout). */
  footer?: ReactNode;
  /** Fondo propio cuando el contenido va a sangre (un mapa, una foto). */
  background?: string;
  /** Añade el margen lateral estándar al contenido. Desactívalo con listas a sangre. */
  padded?: boolean;
  contentStyle?: ViewStyle;
  /** Bordes seguros. Con footer, el inferior lo gestiona la propia barra. */
  edges?: readonly Edge[];
}

export function ScreenScaffold({
  children,
  tone = 'light',
  title,
  subtitle,
  showBack,
  onBack,
  headerRight,
  footer,
  background,
  padded = false,
  contentStyle,
  edges,
}: ScreenScaffoldProps) {
  const router = useRouter();
  const isDark = tone === 'dark';

  const canGoBack = router.canGoBack();
  const backVisible = showBack ?? canGoBack;
  const hasHeader = Boolean(title) || backVisible || Boolean(headerRight);

  const surface = background ?? (isDark ? colors.surfaceDark : colors.surfaceMuted);
  const titleColor = isDark ? colors.onDark : colors.ink;
  const subtitleColor = isDark ? colors.onDarkMuted : colors.inkMuted;

  const safeEdges: readonly Edge[] =
    edges ?? (footer ? (['top', 'left', 'right'] as const) : (['top', 'left', 'right', 'bottom'] as const));

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (canGoBack) router.back();
  };

  return (
    <SafeAreaView edges={safeEdges} style={[styles.root, { backgroundColor: surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {hasHeader && (
        <View style={styles.header}>
          {backVisible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={goBack}
              style={({ pressed }) => [
                styles.backButton,
                isDark ? styles.backButtonDark : styles.backButtonLight,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={26}
                color={isDark ? colors.onDark : colors.brand700}
              />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}

          <View style={styles.headerText}>
            {title ? (
              <Text numberOfLines={1} style={[styles.title, { color: titleColor }]}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text numberOfLines={1} style={[styles.subtitle, { color: subtitleColor }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerRight}>{headerRight}</View>
        </View>
      )}

      <View style={[styles.content, padded && styles.contentPadded, contentStyle]}>{children}</View>

      {footer && (
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={[
            styles.footer,
            {
              backgroundColor: isDark ? colors.surfaceDarkRaised : colors.surface,
              borderTopColor: isDark ? colors.brand800 : colors.line,
            },
          ]}
        >
          {footer}
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  backButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  backButtonDark: {
    backgroundColor: colors.surfaceDarkRaised,
  },
  headerSpacer: {
    width: spacing.xs,
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...type.heading,
  },
  subtitle: {
    ...type.bodySm,
    marginTop: 2,
  },
  headerRight: {
    minWidth: spacing.xs,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentPadded: {
    paddingHorizontal: spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
