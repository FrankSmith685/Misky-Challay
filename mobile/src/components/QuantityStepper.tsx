import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, layout, radius, spacing, type } from '../theme/tokens';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /**
   * Qué pasa al restar estando en el mínimo:
   *   'block'  no hace nada (por defecto)
   *   'remove' llama a `onRemove`, que es quien pregunta antes de borrar
   */
  minBehavior?: 'block' | 'remove';
  onRemove?: () => void;
  /** Nombre de lo que se cuenta, para el lector de pantalla: «Cantidad de Bowl Andino». */
  label?: string;
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Selector de cantidad único de la app. Antes había tres implementaciones
 * distintas y una de ellas borraba la línea del carrito al bajar de 1 sin avisar.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  minBehavior = 'block',
  onRemove,
  label,
  size = 'md',
  disabled = false,
  style,
}: QuantityStepperProps) {
  const compact = size === 'sm';
  const removes = minBehavior === 'remove' && onRemove !== undefined;

  const canDecrease = !disabled && (value > min || removes);
  const canIncrease = !disabled && value < max;

  const tap = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const decrease = () => {
    if (!canDecrease) return;
    tap();
    // Bajar del mínimo nunca borra por sorpresa: se delega en quien sabe
    // preguntar («¿Quitar del carrito?») y solo entonces se elimina.
    if (value <= min) {
      onRemove?.();
      return;
    }
    onChange(value - 1);
  };

  const increase = () => {
    if (!canIncrease) return;
    tap();
    onChange(value + 1);
  };

  const subject = label ? ` de ${label}` : '';

  return (
    <View style={[styles.container, compact && styles.containerSm, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          removes && value <= min ? `Quitar${subject}` : `Restar una unidad${subject}`
        }
        accessibilityState={{ disabled: !canDecrease }}
        disabled={!canDecrease}
        hitSlop={4}
        onPress={decrease}
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonSm,
          pressed && canDecrease && styles.pressed,
          !canDecrease && styles.buttonDisabled,
        ]}
      >
        <MaterialCommunityIcons
          name={removes && value <= min ? 'trash-can-outline' : 'minus'}
          size={compact ? 17 : 20}
          color={canDecrease ? colors.brand700 : colors.inkMuted}
        />
      </Pressable>

      <Text
        accessibilityLabel={`Cantidad${subject}: ${value}`}
        style={[styles.value, compact && styles.valueSm]}
      >
        {value}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sumar una unidad${subject}`}
        accessibilityState={{ disabled: !canIncrease }}
        disabled={!canIncrease}
        hitSlop={4}
        onPress={increase}
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonSm,
          pressed && canIncrease && styles.pressed,
          !canIncrease && styles.buttonDisabled,
        ]}
      >
        <MaterialCommunityIcons
          name="plus"
          size={compact ? 17 : 20}
          color={canIncrease ? colors.brand700 : colors.inkMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 3,
  },
  containerSm: {
    padding: 2,
  },
  button: {
    // 44 px reales: es el mínimo tocable y no se negocia.
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
  },
  buttonSm: {
    width: 38,
    height: 38,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
  value: {
    ...type.heading,
    color: colors.ink,
    minWidth: 40,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  valueSm: {
    ...type.body,
    fontWeight: '800',
    minWidth: 32,
  },
});
