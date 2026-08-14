import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, type } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';
import type { ToneName } from '../theme/tokens';

export interface EmptyStateProps {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message?: string;
  /** Acción principal: «Ver el menú», «Añadir dirección». */
  actionLabel?: string;
  onAction?: () => void;
  /** Acción secundaria discreta debajo. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** 'dark' cuando el vacío se pinta sobre fondo de marca. */
  tone?: ToneName;
  /** Ocupa todo el alto disponible y centra: para una pantalla entera vacía. */
  fill?: boolean;
  style?: ViewStyle;
}

/** Vacío con explicación y salida. Nunca una pantalla en blanco ni un «sin datos». */
export function EmptyState({
  icon = 'bowl-mix-outline',
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = 'light',
  fill = true,
  style,
}: EmptyStateProps) {
  const isDark = tone === 'dark';

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={message ? `${title}. ${message}` : title}
      style={[styles.container, fill && styles.fill, style]}
    >
      <View style={[styles.iconBox, isDark && styles.iconBoxDark]}>
        <MaterialCommunityIcons
          name={icon}
          size={34}
          color={isDark ? colors.onDark : colors.brand600}
        />
      </View>

      <Text style={[styles.title, { color: isDark ? colors.onDark : colors.ink }]}>{title}</Text>

      {message ? (
        <Text style={[styles.message, { color: isDark ? colors.onDarkMuted : colors.inkMuted }]}>
          {message}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}

      {secondaryLabel && onSecondary ? (
        <PrimaryButton
          label={secondaryLabel}
          variant="ghost"
          onPress={onSecondary}
          style={styles.secondary}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  fill: {
    flex: 1,
    minHeight: 280,
  },
  iconBox: {
    width: 82,
    height: 82,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
    ...shadow.sm,
  },
  iconBoxDark: {
    backgroundColor: colors.surfaceDarkRaised,
  },
  title: {
    ...type.heading,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  message: {
    ...type.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.lg,
    minWidth: 200,
  },
  secondary: {
    marginTop: spacing.xs,
    minWidth: 200,
  },
});
