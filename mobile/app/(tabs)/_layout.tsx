import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../../src/theme/tokens';

const icon =
  (
    name: keyof typeof MaterialCommunityIcons.glyphMap,
    activeName: keyof typeof MaterialCommunityIcons.glyphMap = name,
  ) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <MaterialCommunityIcons
      name={focused ? activeName : name}
      color={color}
      size={focused ? size + 2 : size}
    />
  );

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  // Android sin barra de gestos devuelve 0: sin este mínimo, la fila de pestañas
  // queda pegada al borde inferior de la pantalla.
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 20) : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.brand700,
        // Antes era #748179: 3,9:1 sobre blanco, por debajo del mínimo legible.
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: {
          ...type.caption,
          letterSpacing: 0,
          marginTop: 1,
        },
        tabBarItemStyle: {
          minHeight: 42,
          marginHorizontal: 3,
          paddingVertical: 2,
        },
        tabBarStyle: {
          height: 58 + bottomInset,
          paddingHorizontal: spacing.xs,
          paddingTop: 4,
          paddingBottom: bottomInset + 6,
          borderTopWidth: 1,
          borderColor: colors.lineSoft,
          backgroundColor: colors.surface,
          shadowColor: colors.brand900,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: icon('home-variant-outline', 'home-variant') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menú', tabBarIcon: icon('food-apple-outline', 'food-apple') }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Pedidos', tabBarIcon: icon('receipt-text-outline', 'receipt-text') }}
      />
      <Tabs.Screen
        name="cart"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Cuenta', tabBarIcon: icon('account-circle-outline', 'account-circle') }}
      />
      <Tabs.Screen name="staff" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
