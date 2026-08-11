import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PurchaseProvider } from '../src/providers/PurchaseProvider';
import { CartProvider } from '../src/providers/CartProvider';
import { MobileNotificationsProvider } from '../src/providers/MobileNotificationsProvider';
import { SessionProvider, useSession } from '../src/providers/SessionProvider';
import { FavoritesProvider } from '../src/providers/FavoritesProvider';
import { colors } from '../src/theme/tokens';
import { mobileAnalytics } from '../src/services/analytics';

function RootNavigator() {
  const { status } = useSession();
  useEffect(() => { void mobileAnalytics.track('APP_OPEN'); }, []);
  if (status === 'bootstrapping') {
    return (
      <View style={styles.splash}>
        <View style={styles.splashMark}><MaterialCommunityIcons name="leaf" color={colors.surface} size={34} /></View>
        <Text style={styles.splashName}>Verde<Text style={styles.accent}>Bowl</Text></Text>
        <Text style={styles.splashCopy}>Preparando tu experiencia…</Text>
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.surfaceMuted } }}>
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="location" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="product/[slug]" />
      <Stack.Screen name="builder/[productId]" />
      <Stack.Screen name="addresses/index" />
      <Stack.Screen name="addresses/new" />
      <Stack.Screen name="checkout/index" />
      <Stack.Screen name="checkout/result" />
      <Stack.Screen name="plans/index" />
      <Stack.Screen name="plans/result" />
      <Stack.Screen name="wallet/index" />
      <Stack.Screen name="favorites/index" />
      <Stack.Screen name="reviews/index" />
      <Stack.Screen name="preferences/index" />
      <Stack.Screen name="support/index" />
      <Stack.Screen name="scan-table" />
      <Stack.Screen name="mesa/[token]" />
      <Stack.Screen name="order/[orderNumber]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PurchaseProvider>
          <FavoritesProvider>
            <CartProvider>
              <MobileNotificationsProvider>
                <StatusBar style="dark" />
                <RootNavigator />
              </MobileNotificationsProvider>
            </CartProvider>
          </FavoritesProvider>
        </PurchaseProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand900 },
  splashMark: { width: 72, height: 72, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand600 },
  splashName: { color: colors.surface, fontSize: 29, fontWeight: '900', letterSpacing: -1, marginTop: 18 },
  accent: { color: colors.accent500 },
  splashCopy: { color: '#bfd8cb', fontSize: 13, marginTop: 9 },
});
