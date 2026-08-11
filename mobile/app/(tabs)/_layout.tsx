import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/tokens';
import { useCart } from '../../src/providers/CartProvider';

const icon = (name: keyof typeof MaterialCommunityIcons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const { units } = useCart();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: '#748179',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginTop: 1 },
        tabBarStyle: {
          height: 62 + bottomInset,
          paddingTop: 7,
          paddingBottom: bottomInset + 7,
          borderTopColor: colors.line,
          backgroundColor: colors.surface,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home-variant-outline') }} />
      <Tabs.Screen name="menu" options={{ title: 'Menú', tabBarIcon: icon('food-apple-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Pedidos', tabBarIcon: icon('receipt-text-outline') }} />
      <Tabs.Screen name="cart" options={{ title: 'Carrito', tabBarIcon: icon('shopping-outline'), tabBarBadge: units || undefined, tabBarBadgeStyle: { backgroundColor: colors.accent500, fontSize: 9 } }} />
      <Tabs.Screen name="account" options={{ title: 'Cuenta', tabBarIcon: icon('account-circle-outline') }} />
    </Tabs>
  );
}
