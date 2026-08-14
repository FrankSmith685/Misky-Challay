import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { AppGateProvider } from '../src/providers/AppGateProvider';
import { CartProvider, useCart } from '../src/providers/CartProvider';
import { FavoritesProvider } from '../src/providers/FavoritesProvider';
import { MobileNotificationsProvider } from '../src/providers/MobileNotificationsProvider';
import { PurchaseProvider } from '../src/providers/PurchaseProvider';
import { SessionProvider, useSession } from '../src/providers/SessionProvider';
import { ToastProvider, useToast } from '../src/providers/ToastProvider';
import { mobileAnalytics } from '../src/services/analytics';
import { colors, radius, shadow, spacing, type } from '../src/theme/tokens';
import { onboardingStorage } from './onboarding';

/*
 * El splash nativo se queda en pantalla hasta que la app tenga algo real que
 * enseñar. Antes se ocultaba solo al cargar el paquete y la secuencia era
 * blanco → verde → inicio: tres pantallas para un solo arranque. Ahora es una.
 */
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 320, fade: true });

function RootNavigator() {
  const { status } = useSession();

  /** `null` mientras se lee del almacén; luego sabemos si toca la bienvenida. */
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [redirected, setRedirected] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void onboardingStorage
      .hasSeen()
      .then((seen) => {
        if (active) setOnboardingSeen(seen);
      })
      .catch(() => {
        // Si el almacén falla, mejor entrar directo que dejar al cliente encerrado
        // en una bienvenida que no se puede marcar como vista.
        if (active) setOnboardingSeen(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const ready = status !== 'bootstrapping' && onboardingSeen !== null;
  const needsOnboarding = onboardingSeen === false;

  // La bienvenida se muestra una sola vez por teléfono. Se navega en un efecto,
  // ya con la pila montada, y con una marca para que un re-render no la repita.
  useEffect(() => {
    if (!ready || !needsOnboarding || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace('/onboarding');
    setRedirected(true);
  }, [needsOnboarding, ready]);

  /*
   * El splash se retira cuando debajo ya está la pantalla definitiva. Si toca
   * bienvenida, se espera al render posterior al `replace`: si no, el cliente
   * vería asomar la portada un instante antes de que la bienvenida la tapara.
   */
  useEffect(() => {
    if (!ready || (needsOnboarding && !redirected)) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [needsOnboarding, ready, redirected]);

  useEffect(() => {
    if (!ready) return;
    void mobileAnalytics.track('APP_OPEN');
  }, [ready]);

  /*
   * Puente verde entre el splash nativo y la primera pantalla. Casi nunca se ve
   * —el splash sigue arriba hasta que `ready` es cierto—, pero si el sistema lo
   * ocultó antes de tiempo, lo que aparece es este mismo verde y no un flash
   * blanco.
   */
  if (!ready) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <View style={styles.splashMark}>
          <MaterialCommunityIcons name="leaf" color={colors.onDark} size={34} />
        </View>
        <Text style={styles.splashName}>
          Verde<Text style={styles.accent}>Bowl</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.surfaceMuted },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen
          name="onboarding"
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="location"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="product/[slug]" />
        <Stack.Screen name="builder/[productId]" />
        <Stack.Screen name="addresses/index" />
        <Stack.Screen name="addresses/new" />
        <Stack.Screen name="addresses/[id]" />
        <Stack.Screen name="cobertura/index" />
        <Stack.Screen name="checkout/index" />
        <Stack.Screen name="checkout/result" options={{ gestureEnabled: false }} />
        <Stack.Screen name="plans/index" />
        <Stack.Screen name="plans/result" options={{ gestureEnabled: false }} />
        <Stack.Screen name="wallet/index" />
        <Stack.Screen name="favorites/index" />
        <Stack.Screen name="saved-bowls/index" />
        <Stack.Screen name="reviews/index" />
        <Stack.Screen name="preferences/index" />
        <Stack.Screen name="notifications/index" />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="profile/password" />
        <Stack.Screen name="profile/delete" />
        <Stack.Screen name="support/index" />
        <Stack.Screen name="support/track" />
        <Stack.Screen name="legal/[slug]" />
        <Stack.Screen name="scan-table" />
        <Stack.Screen name="mesa/[token]" />
        <Stack.Screen name="order/[orderNumber]" />
          <Stack.Screen name="staff/[module]" />
          <Stack.Screen name="staff/order-detail" />
          <Stack.Screen name="staff/delivery-assign" />
          <Stack.Screen name="staff/dining-close" />
          <Stack.Screen name="staff/dining-command" />
          <Stack.Screen name="staff/builder-editor" />
          <Stack.Screen name="staff/catalog-editor" />
          <Stack.Screen name="staff/business-editor" />
      </Stack>

      <SessionHousekeeping />
      <OfflineBanner />
    </View>
  );
}

/**
 * Lo que hay que hacer cuando la sesión termina, esté quien esté mirando.
 *
 * Vive aquí y no dentro de SessionProvider porque necesita el carrito y el
 * navegador, que cuelgan por debajo de él.
 */
function SessionHousekeeping() {
  const { status, expiredAt } = useSession();
  const { clear: clearCart } = useCart();
  const toast = useToast();

  const previousStatus = useRef(status);
  const handledExpiry = useRef<number | null>(null);

  // La vigilancia de la caducidad ya no vive aquí: `client.ts` llama a
  // `notifySessionExpired()` en cuanto la renovación del refresh deja de servir,
  // así que sobra sondear el almacén seguro en cada navegación.

  // El carrito guardado ya lo borra SessionProvider; esto vacía el que sigue en
  // memoria, que es el que el cliente ve en la pestaña y el que se volvería a
  // escribir en el disco en cuanto tocara una cantidad.
  useEffect(() => {
    const wasAuthenticated = previousStatus.current === 'authenticated';
    previousStatus.current = status;
    if (!wasAuthenticated || status !== 'anonymous') return;
    void clearCart();
  }, [clearCart, status]);

  // Caducidad real de la sesión: se avisa y se lleva al login en vez de dejar la
  // interfaz mostrando a alguien que ya no está dentro.
  useEffect(() => {
    if (expiredAt === null || handledExpiry.current === expiredAt) return;
    handledExpiry.current = expiredAt;

    toast.show({
      tone: 'warning',
      message: 'Tu sesión caducó. Vuelve a ingresar para seguir donde lo dejaste.',
    });
    router.replace({ pathname: '/(auth)/login', params: { returnTo: '/(tabs)' } });
  }, [expiredAt, toast]);

  return null;
}

/**
 * Banda de «sin conexión». Avisa, no bloquea: con el catálogo ya cargado se
 * puede seguir mirando el menú y armando el carrito, y lo que no se pueda hacer
 * lo dirá la pantalla que lo intente.
 */
function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        // `isInternetReachable` empieza en null mientras se comprueba: solo un
        // `false` explícito cuenta como caída, si no la banda parpadearía al abrir.
        setOffline(state.isConnected === false || state.isInternetReachable === false);
      }),
    [],
  );

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.offline, shadow.md, { top: insets.top + spacing.sm }]}
    >
      <MaterialCommunityIcons name="wifi-off" size={18} color={colors.onDark} />
      <Text style={styles.offlineText}>Sin conexión. Seguimos mostrando lo ya cargado.</Text>
    </View>
  );
}

export default function RootLayout() {
  // Una excepción durante el render cerraba la app sin dejar rastro. La red va por
  // fuera de todo lo demás para que también atrape los fallos de los providers.
  const onCrash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  /*
   * No hay <StatusBar> global: cada pantalla la declara por su cuenta según su
   * tono (ScreenScaffold lo resuelve con la prop `tone`). Una única declaración
   * «dark» era lo que dejaba ilegibles las pantallas de fondo oscuro.
   *
   * AppGateProvider va por dentro del aviso y por fuera de todo lo demás: si hay
   * mantenimiento o la versión está por debajo de la mínima, no llega a montarse
   * ni la sesión ni el carrito.
   */
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary onError={onCrash}>
          <ToastProvider>
            <AppGateProvider>
              <SessionProvider>
                <PurchaseProvider>
                  <FavoritesProvider>
                    <CartProvider>
                      <MobileNotificationsProvider>
                        <RootNavigator />
                      </MobileNotificationsProvider>
                    </CartProvider>
                  </FavoritesProvider>
                </PurchaseProvider>
              </SessionProvider>
            </AppGateProvider>
          </ToastProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDark,
  },
  splashMark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  splashName: {
    ...type.display,
    color: colors.onDark,
    marginTop: spacing.md,
  },
  accent: {
    color: colors.accent500,
  },
  offline: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warning,
  },
  offlineText: {
    ...type.bodySm,
    flex: 1,
    fontWeight: '700',
    color: colors.onDark,
  },
});
