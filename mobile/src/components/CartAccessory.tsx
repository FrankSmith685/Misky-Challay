import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useCart } from '../providers/CartProvider';
import { money } from '../lib/format';
import { colors, layout, shadow, spacing, type } from '../theme/tokens';

interface CartAccessoryProps {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}


/**
 * El carrito es una acción contextual, no una sección primaria de la app.
 * Solo ocupa espacio cuando tiene contenido y siempre se coloca por encima de
 * la navegación inferior, nunca encima de la última fila del catálogo.
 */
export function CartAccessory({ style, onPress }: CartAccessoryProps) {
  const { units, subtotal } = useCart();

  if (units <= 0) return null;

  const open = onPress ?? (() => router.push('/(tabs)/cart'));
  const countLabel = `${units} ${units === 1 ? 'producto' : 'productos'}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver pedido, ${countLabel}, ${money(subtotal)}`}
      onPress={open}
      style={({ pressed }) => [styles.root, shadow.md, style, pressed && styles.pressed]}
    >
      <View style={styles.leading}>
        <MaterialCommunityIcons name="shopping-outline" size={21} color={colors.onDark} />
        <View style={styles.copy}>
          <Text style={styles.title}>Ver pedido</Text>
          <Text style={styles.detail}>{countLabel}</Text>
        </View>
      </View>

      <View style={styles.trailing}>
        <Text style={styles.total}>{money(subtotal)}</Text>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onDark} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.brand900,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  leading: {
    minHeight: layout.minTouch,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  copy: {
    flex: 1,
  },
  title: {
    ...type.bodySm,
    color: colors.onDark,
    fontWeight: '900',
  },
  detail: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginTop: 1,
  },
  trailing: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  total: {
    ...type.heading,
    color: colors.onDark,
  },
  pressed: {
    opacity: 0.86,
  },
});
