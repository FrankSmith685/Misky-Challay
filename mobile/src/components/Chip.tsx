import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, type } from '../theme/tokens';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Icono a la izquierda (categorías, alérgenos). */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Contador a la derecha: «Vegano · 12». */
  badge?: number | string;
  /** 'danger' para los filtros de exclusión (alérgenos que el cliente evita). */
  tone?: 'brand' | 'danger';
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: ViewStyle;
}

/** Píldora seleccionable para filtros y categorías. Es el único filtro visual de la app. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  badge,
  tone = 'brand',
  size = 'md',
  disabled = false,
  style,
}: ChipProps) {
  const compact = size === 'sm';
  const activeColor = tone === 'danger' ? colors.danger : colors.brand600;
  const contentColor = selected ? colors.surface : disabled ? colors.inkMuted : colors.ink;

  const press = () => {
    if (!onPress || disabled) return;
    void Haptics.selectionAsync();
    onPress();
  };

  const content = (
    <>
      {icon ? (
        <MaterialCommunityIcons name={icon} size={compact ? 15 : 17} color={contentColor} />
      ) : null}

      <Text numberOfLines={1} style={[styles.label, compact && styles.labelSm, { color: contentColor }]}>
        {label}
      </Text>

      {badge !== undefined ? (
        <View style={[styles.badge, selected && styles.badgeSelected]}>
          <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>{badge}</Text>
        </View>
      ) : null}
    </>
  );

  const boxStyle: ViewStyle[] = [
    styles.chip,
    compact ? styles.chipSm : styles.chipMd,
    selected ? { backgroundColor: activeColor, borderColor: activeColor } : styles.chipIdle,
    disabled ? styles.disabled : {},
  ];

  // Sin `onPress` es una etiqueta informativa, no un control: no debe anunciarse
  // como botón ni ofrecer foco al lector de pantalla.
  if (!onPress) {
    return <View style={[...boxStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      onPress={press}
      style={({ pressed }) => [...boxStyle, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipMd: {
    // 38 + 6 de hitSlop arriba y abajo supera los 44 px de área tocable.
    minHeight: 38,
    paddingHorizontal: 14,
  },
  chipSm: {
    minHeight: 32,
    paddingHorizontal: 11,
  },
  chipIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  label: {
    ...type.bodySm,
    fontWeight: '700',
  },
  labelSm: {
    ...type.label,
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
  },
  badgeSelected: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  badgeText: {
    ...type.caption,
    color: colors.brand700,
    textAlign: 'center',
  },
  badgeTextSelected: {
    color: colors.surface,
  },
});

/** Altura del chip: útil para reservar espacio en las filas horizontales de filtros. */
export const CHIP_HEIGHT = { md: 38, sm: 32 } as const;
