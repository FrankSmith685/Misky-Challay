import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../src/providers/CartProvider';
import { colors, layout, spacing, type } from '../../src/theme/tokens';

const icon =
  (name: keyof typeof MaterialCommunityIcons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );

/** El contador del carrito deja de ser un número legible pasado de tres cifras. */
const cartBadge = (units: number): string | undefined => {
  if (units <= 0) return undefined;
  return units > 99 ? '99+' : String(units);
};

export default function TabsLayout() {
  const { units } = useCart();
  const insets = useSafeAreaInsets();

  // Android sin barra de gestos devuelve 0: sin este mínimo, la fila de pestañas
  // queda pegada al borde inferior de la pantalla.
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.brand700,
        // Antes era #748179: 3,9:1 sobre blanco, por debajo del mínimo legible.
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: {
          ...type.label,
          letterSpacing: 0,
          marginTop: 2,
        },
        tabBarItemStyle: {
          minHeight: layout.minTouch,
          paddingVertical: spacing.xs,
        },
        tabBarStyle: {
          height: 62 + bottomInset,
          paddingTop: spacing.sm,
          paddingBottom: bottomInset + spacing.sm,
          borderTopColor: colors.line,
          backgroundColor: colors.surface,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: icon('home-variant-outline') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menú', tabBarIcon: icon('food-apple-outline') }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Pedidos', tabBarIcon: icon('receipt-text-outline') }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Carrito',
          tabBarIcon: icon('shopping-outline'),
          tabBarBadge: cartBadge(units),
          tabBarBadgeStyle: {
            backgroundColor: colors.accent500,
            color: colors.surface,
            fontSize: 12,
            fontWeight: '800',
            lineHeight: 16,
            minWidth: 20,
          },
          tabBarAccessibilityLabel:
            units > 0 ? `Carrito, ${units} ${units === 1 ? 'unidad' : 'unidades'}` : 'Carrito vacío',
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Cuenta', tabBarIcon: icon('account-circle-outline') }}
      />
    </Tabs>
  );
}
