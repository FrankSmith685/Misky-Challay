import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../../src/components/BrandLogo';
import { AppImage } from '../../src/components/AppImage';
import { EmptyState } from '../../src/components/EmptyState';
import { LocationBar } from '../../src/components/LocationBar';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ProductCard } from '../../src/components/ProductCard';
import { Reveal } from '../../src/components/Reveal';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { useReorder } from '../../src/hooks/useReorder';
import { useResource } from '../../src/hooks/useResource';
import { buildOrderProgress } from '../../src/lib/orderProgress';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { mobileAnalytics } from '../../src/services/analytics';
import { accountApi } from '../../src/services/api/account.service';
import { businessApi } from '../../src/services/api/business.service';
import { catalogApi } from '../../src/services/api/catalog.service';
import { engagementApi } from '../../src/services/api/engagement.service';
import { ordersApi } from '../../src/services/api/orders.service';
import { plansApi } from '../../src/services/api/plans.service';
import type { PagedResult } from '../../src/services/api/client';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type {
  AccountNotificationsFeed,
  OrderStatus,
  OrderSummary,
  Product,
  PublicSettings,
  Recommendation,
  WalletSummary,
} from '../../src/types/domain';

/**
 * PORTADA.
 *
 * Hasta ahora todo el mundo veía la misma pantalla de captación: quien acababa de
 * instalar la app y quien llevaba diez pedidos. El cliente que ya compró aterrizaba
 * en un discurso de bienvenida y tenía que irse a Mi cuenta a buscar lo suyo.
 *
 * Con sesión iniciada, arriba va lo que le importa: su pedido en marcha, sus
 * últimas compras listas para repetir, su saldo y sus favoritos — la misma idea
 * que `HomeReturningCustomer` en la web. Sin sesión, la portada es la de siempre
 * y no dispara ni una petición de más.
 */

/** Los mismos estados que el filtro «En curso» del historial. */
const ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

/** Cuántos pedidos anteriores se ofrecen para repetir. */
const REPEATABLE_LIMIT = 3;

/** Las tres modalidades son fijas: no vienen del servidor ni crecen. */
const SERVICE_MODES: Array<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  copy: string;
}> = [
  {
    icon: 'bike-fast',
    title: 'Delivery',
    copy: 'Validamos la cobertura de tu dirección y asignamos la sede que llega antes.',
  },
  {
    icon: 'shopping-outline',
    title: 'Recojo en local',
    copy: 'Eliges el local, pagas desde aquí y recoges sin hacer cola.',
  },
  {
    icon: 'silverware-fork-knife',
    title: 'En restaurante',
    copy: 'Escanea el QR de tu mesa y pide sin levantarte.',
  },
];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

const money = (value: number | string): string => `S/ ${Number(value).toFixed(2)}`;

/** «14 ago» — sin Intl, que en Hermes no siempre trae los datos de la región. */
const shortDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

/** Qué se pidió, en una línea: el número de pedido no le dice nada a nadie. */
const summarizeOrder = (order: OrderSummary): string => {
  const names = (order.items ?? [])
    .map((item) => item.productNameSnapshot)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return `Pedido ${order.orderNumber}`;
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} y ${names.length - 2} más`;
};

const toRecommendations = (products: Product[]): Recommendation[] =>
  products.slice(0, 6).map((product) => ({ product, reason: 'Recomendado por Misky Challay' }));

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const favorites = useFavorites();
  const { branch } = usePurchase();
  const { status, user } = useSession();
  const { reorder, reorderingNumber } = useReorder();

  const authenticated = status === 'authenticated';
  const branchId = branch?.id ?? null;
  const [refreshing, setRefreshing] = useState(false);

  const settings = useResource<PublicSettings>({
    key: 'settings:public',
    fetcher: () => businessApi.publicSettings(),
    cacheMs: 10 * 60_000,
  });

  /**
   * Recomendaciones personales con sesión; destacados del catálogo sin ella. El
   * motor de recomendaciones es un extra: si no responde o no tiene nada que
   * decir todavía, la portada cae en los destacados en vez de quedarse vacía.
   */
  const recommendations = useResource<Recommendation[]>({
    key: `home:recommendations:${authenticated ? 'cliente' : 'publico'}:${branchId ?? 'sin-sede'}`,
    fetcher: async () => {
      if (authenticated) {
        try {
          const personal = await engagementApi.recommendations(branchId, 6);
          if (personal.length > 0) return personal;
        } catch {
          // Cae a los destacados.
        }
      }
      return toRecommendations(await catalogApi.products({ branchId, featured: true }));
    },
    cacheMs: 2 * 60_000,
  });

  // Misma clave que el historial: las dos pantallas comparten la lectura en vez
  // de pedir lo mismo dos veces.
  const orders = useResource<PagedResult<OrderSummary>>({
    key: authenticated ? 'orders:list:1' : null,
    fetcher: () => ordersApi.listPaged({ page: 1, pageSize: 20 }),
    cacheMs: 15_000,
  });

  const activeOrders = useResource<OrderSummary[]>({ key: authenticated ? 'orders:active' : null, fetcher: () => ordersApi.active(), cacheMs: 15000, pollIntervalMs: 20000 });

  const wallet = useResource<WalletSummary>({
    key: authenticated ? 'plans:wallet' : null,
    fetcher: () => plansApi.wallet(),
  });

  const notifications = useResource<AccountNotificationsFeed>({
    key: authenticated ? 'account:notifications' : null,
    fetcher: () => accountApi.notifications(),
  });

  const sortedOrders = useMemo(
    () =>
      [...(orders.data?.items ?? [])].sort(
        (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
      ),
    [orders.data],
  );

  const activeOrder = useMemo(
    () => (activeOrders.data ?? sortedOrders).find((order) => ACTIVE_STATUSES.includes(order.status)) ?? null,
    [sortedOrders, activeOrders.data],
  );

  /*
   * Un pedido sin pagar no se repite, se paga; y el que ya está arriba con su
   * seguimiento no se vuelve a ofrecer en la misma pantalla.
   */
  const repeatable = useMemo(
    () =>
      sortedOrders
        .filter((order) => order.status !== 'PENDING_PAYMENT' && order.id !== activeOrder?.id)
        .slice(0, REPEATABLE_LIMIT),
    [activeOrder, sortedOrders],
  );

  /*
   * La cabecera y el hero van sobre verde oscuro: la barra de estado tiene que ir
   * en blanco o los iconos del sistema desaparecen. Se hace al enfocar y se
   * devuelve a oscuro al salir porque las pestañas NO desmontan la pantalla: con
   * el componente <StatusBar> montado, la primera visita a otra pestaña dejaba el
   * estilo pegado al que se hubiera montado más tarde.
   */
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  const balance = wallet.data?.balance ?? 0;
  const unread = notifications.data?.unreadCount ?? 0;
  const firstName = user?.firstName?.trim() || null;

  // Se dependen las funciones, no los objetos: `refresh` es estable y así el
  // gesto de tirar para refrescar no se reconstruye en cada render.
  const refreshSettings = settings.refresh;
  const refreshRecommendations = recommendations.refresh;
  const refreshRecentOrders = orders.refresh;
  const refreshActiveOrders = activeOrders.refresh;
  const refreshOrders = useCallback(async () => { await Promise.all([refreshRecentOrders(), refreshActiveOrders()]); }, [refreshRecentOrders, refreshActiveOrders]);
  const refreshWallet = wallet.refresh;
  const refreshNotifications = notifications.refresh;

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshSettings(),
      refreshRecommendations(),
      refreshOrders(),
      refreshWallet(),
      refreshNotifications(),
    ]);
    setRefreshing(false);
  }, [
    refreshNotifications,
    refreshOrders,
    refreshRecommendations,
    refreshSettings,
    refreshWallet,
  ]);

  const openProduct = useCallback(
    (product: Product, reason: string) => {
      void mobileAnalytics.track('RECOMMENDATION_OPEN', { productId: product.id, reason }, branchId);
      router.push({ pathname: '/product/[slug]', params: { slug: product.slug } });
    },
    [branchId],
  );

  const toggleFavorite = useCallback(
    (product: Product) => {
      if (!authenticated) {
        router.push({ pathname: '/(auth)/login', params: { returnTo: '/(tabs)' } });
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void favorites.toggle(product).catch((caught: unknown) => {
        toast.show({
          tone: 'error',
          message:
            caught instanceof Error ? caught.message : 'No pudimos guardar el favorito.',
        });
      });
    },
    [authenticated, favorites, toast],
  );

  const renderRecommendation = useCallback(
    ({ item }: ListRenderItemInfo<Recommendation>) => (
      <View style={styles.railItem}>
        <View style={styles.reason}>
          <MaterialCommunityIcons name="creation" size={14} color={colors.brand700} />
          <Text numberOfLines={1} style={styles.reasonText}>
            {item.reason}
          </Text>
        </View>

        <ProductCard
          product={item.product}
          isFavorite={favorites.ids.has(item.product.id)}
          onToggleFavorite={toggleFavorite}
          onPress={(product) => openProduct(product, item.reason)}
        />
      </View>
    ),
    [favorites.ids, openProduct, toggleFavorite],
  );

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            tintColor={colors.brand600}
          />
        }
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <BrandLogo inverse />

          {authenticated ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'
              }
              hitSlop={layout.iconHitSlop}
              onPress={() => router.push('/notifications' as Href)}
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="bell-outline" size={22} color={colors.onDark} />
              {unread > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ingresar a mi cuenta"
              onPress={() => router.push({ pathname: '/(auth)/login', params: { returnTo: '/(tabs)' } })}
              style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
            >
              <Text style={styles.signInLabel}>Ingresar</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.hero}>
          <View pointerEvents="none" style={styles.heroOrbTop} />
          <View pointerEvents="none" style={styles.heroOrbBottom} />
          {authenticated ? (
            <>
              <Text style={styles.kicker}>QUÉ GUSTO VERTE DE NUEVO</Text>
              <Text style={styles.heroTitle}>
                {firstName ? `Hola, ${firstName}` : 'Hola de nuevo'}
              </Text>
              <Text style={styles.heroCopy}>
                Repite tu última torta o diseña una nueva. Tus preferencias ya están
                listas para tu próximo pedido.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.kicker}>TORTAS PARA CADA CELEBRACIÓN</Text>
              <Text style={styles.heroTitle}>Tu torta, a tu manera.</Text>
              <Text style={styles.heroCopy}>
                Elige porciones, bizcocho, relleno y decoración. Revisa el precio y la fecha
                disponible antes de pedir.
              </Text>
            </>
          )}

          <Reveal delay={80} style={styles.heroVisual}>
            <AppImage
              uri="/images/cakes/custom.png"
              style={styles.heroVisualImage}
              contentFit="cover"
            />
            <View style={styles.heroVisualShade} />
            <View style={styles.heroVisualCopy}>
              <View style={styles.heroVisualPill}>
                <MaterialCommunityIcons name="cake-variant" size={15} color={colors.brand800} />
                <Text style={styles.heroVisualPillText}>Hecha para ti</Text>
              </View>
              <Text style={styles.heroVisualTitle}>Cada detalle cuenta.</Text>
              <Text style={styles.heroVisualText}>Diseña tu torta para la fecha que necesitas.</Text>
            </View>
            <View style={styles.heroFloatingStat}>
              <MaterialCommunityIcons name="calendar-check" size={16} color={colors.accent500} />
              <Text style={styles.heroFloatingStatText}>Reserva tu fecha</Text>
            </View>
          </Reveal>

          <LocationBar inverse />

          <PrimaryButton
            label="Ver tortas y personalizar"
            icon="cake-variant"
            trailingIcon="arrow-right"
            onPress={() => router.push('/(tabs)/menu')}
            style={styles.heroButton}
          />
        </View>

        {authenticated && (
          <ReturningBlock
            activeOrder={activeOrder}
            balance={balance}
            favoriteCount={favorites.products.length}
            loading={orders.loading}
            reorderingNumber={reorderingNumber}
            repeatable={repeatable}
            onReorder={(orderNumber) => void reorder(orderNumber)}
          />
        )}

        <View style={styles.sectionHeader}>
          <SectionHeader
            eyebrow={authenticated ? 'PENSADO PARA TI' : 'RECOMENDADOS'}
            title="Lo mejor de hoy"
            actionLabel="Ver todo"
            onAction={() => router.push('/(tabs)/menu')}
          />
        </View>

        {recommendations.loading ? (
          <View style={styles.railSkeleton}>
            <Skeleton width={276} height={340} rounded="lg" />
            <Skeleton width={276} height={340} rounded="lg" />
          </View>
        ) : recommendations.error && !recommendations.data ? (
          <View style={styles.inlineError}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={26} color={colors.danger} />
            <Text style={styles.inlineErrorText}>{recommendations.error.message}</Text>
            <PrimaryButton
              label="Reintentar"
              variant="secondary"
              onPress={() => void recommendations.refetch()}
              style={styles.inlineErrorAction}
            />
          </View>
        ) : (recommendations.data?.length ?? 0) > 0 ? (
          <FlatList
            horizontal
            data={recommendations.data ?? []}
            keyExtractor={(item) => String(item.product.id)}
            renderItem={renderRecommendation}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          />
        ) : (
          <EmptyState
            fill={false}
            icon="chef-hat"
            title="La cocina está preparando novedades"
            message="Mientras publicamos recomendaciones puedes revisar el menú completo."
            actionLabel="Ver el menú"
            onAction={() => router.push('/(tabs)/menu')}
            style={styles.emptyRail}
          />
        )}

        <View style={styles.sectionHeader}>
          <SectionHeader eyebrow="ELIGE TU EXPERIENCIA" title="Tres formas de disfrutar" />
        </View>

        <View style={styles.modeGrid}>
          {SERVICE_MODES.map((mode) => (
            <View key={mode.title} style={styles.modeCard}>
              <View style={styles.modeIcon}>
                <MaterialCommunityIcons name={mode.icon} size={23} color={colors.brand700} />
              </View>

              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>{mode.title}</Text>
                <Text style={styles.modeDescription}>{mode.copy}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* La cobertura se consulta sin cuenta: quien todavía no se registró
            necesita saber si llegamos a su casa antes de dar ningún dato. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver hasta dónde llegamos"
          onPress={() => router.push('/cobertura' as Href)}
          style={({ pressed }) => [styles.coverageCard, pressed && styles.pressed]}
        >
          <View style={styles.modeIcon}>
            <MaterialCommunityIcons name="map-search-outline" size={23} color={colors.brand700} />
          </View>

          <View style={styles.modeCopy}>
            <Text style={[styles.modeTitle, styles.coverageTitle]}>Ver hasta dónde llegamos</Text>
            <Text style={styles.modeDescription}>
              Consulta la cobertura de tu zona en el mapa, sin crear una cuenta.
            </Text>
          </View>

          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
        </Pressable>

        <View style={styles.businessCard}>
          <MaterialCommunityIcons name="shield-check-outline" size={24} color={colors.brand700} />

          <View style={styles.businessCopy}>
            <Text style={styles.businessTitle}>Compra con información clara</Text>
            <Text style={styles.businessText}>
              Precios con IGV incluido · atención de{' '}
              {settings.data?.business.commercialName ?? 'Misky Challay'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bloque de continuidad para quien ya compró                          */
/* ------------------------------------------------------------------ */

interface ReturningBlockProps {
  activeOrder: OrderSummary | null;
  balance: number;
  favoriteCount: number;
  loading: boolean;
  reorderingNumber: string | null;
  repeatable: OrderSummary[];
  onReorder: (orderNumber: string) => void;
}

function ReturningBlock({
  activeOrder,
  balance,
  favoriteCount,
  loading,
  reorderingNumber,
  repeatable,
  onReorder,
}: ReturningBlockProps) {
  const progress = activeOrder ? buildOrderProgress(activeOrder) : null;
  const currentStep = progress?.steps.find((step) => step.current) ?? null;

  if (loading) {
    return (
      <View style={styles.returning}>
        <Skeleton width="100%" height={96} rounded="md" />
        <Skeleton width="100%" height={132} rounded="md" style={styles.returningSkeletonGap} />
      </View>
    );
  }

  const hasContent = activeOrder !== null || repeatable.length > 0 || balance > 0 || favoriteCount > 0;
  if (!hasContent) return null;

  return (
    <View style={styles.returning}>
      {(balance > 0 || favoriteCount > 0) && (
        <View style={styles.shortcuts}>
          {favoriteCount > 0 && (
            <Shortcut
              icon="heart-outline"
              label={`Favoritos (${favoriteCount})`}
              onPress={() => router.push('/favorites' as Href)}
            />
          )}
        </View>
      )}

      {activeOrder && progress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Seguir el pedido ${activeOrder.orderNumber}`}
          onPress={() =>
            router.push({
              pathname: '/order/[orderNumber]',
              params: { orderNumber: activeOrder.orderNumber },
            })
          }
          style={({ pressed }) => [styles.activeCard, shadow.sm, pressed && styles.pressed]}
        >
          <View style={styles.activeHead}>
            <View style={styles.activeIcon}>
              <MaterialCommunityIcons name="package-variant" size={20} color={colors.surface} />
            </View>

            <View style={styles.activeCopy}>
              <Text style={styles.activeTitle}>
                {currentStep?.label ?? 'Pedido en curso'}
              </Text>
              <Text style={styles.activeMeta}>
                {activeOrder.orderNumber} · {money(activeOrder.grandTotal)}
              </Text>
            </View>

            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.brand700} />
          </View>

          <View style={styles.progressTrack}>
            {progress.steps.map((step) => (
              <View
                key={step.status}
                style={[styles.progressStep, step.done && styles.progressStepDone]}
              />
            ))}
          </View>

          <Text style={styles.activeNext}>
            {activeOrder.status === 'PENDING_PAYMENT'
              ? 'Falta completar el pago para que entre a cocina.'
              : progress.nextLabel
                ? `Siguiente: ${progress.nextLabel}`
                : 'Te avisamos en cuanto haya novedades.'}
          </Text>
        </Pressable>
      )}

      {repeatable.length > 0 && (
        <>
          <View style={styles.returningHead}>
            <Text style={styles.returningTitle}>Vuelve a pedir</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver todos mis pedidos"
              hitSlop={layout.iconHitSlop}
              onPress={() => router.push('/(tabs)/orders')}
              style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
            >
              <Text style={styles.seeAllLabel}>Ver todos</Text>
            </Pressable>
          </View>

          <FlatList
            horizontal
            data={repeatable}
            keyExtractor={(order) => String(order.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.repeatRail}
            renderItem={({ item }) => (
              <RepeatCard
                busy={reorderingNumber === item.orderNumber}
                disabled={reorderingNumber !== null}
                order={item}
                onReorder={() => onReorder(item.orderNumber)}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={17} color={colors.brand700} />
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

interface RepeatCardProps {
  order: OrderSummary;
  busy: boolean;
  disabled: boolean;
  onReorder: () => void;
}

function RepeatCard({ order, busy, disabled, onReorder }: RepeatCardProps) {
  return (
    <View style={[styles.repeatCard, shadow.sm]}>
      <View style={styles.repeatMeta}>
        <Text style={styles.repeatDate}>{shortDate(order.placedAt)}</Text>
        <Text style={styles.repeatTotal}>{money(order.grandTotal)}</Text>
      </View>

      <Text numberOfLines={2} style={styles.repeatItems}>
        {summarizeOrder(order)}
      </Text>

      <View style={styles.repeatActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Volver a pedir ${order.orderNumber}`}
          accessibilityState={{ busy, disabled }}
          disabled={disabled}
          onPress={onReorder}
          style={({ pressed }) => [styles.repeatButton, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={17} color={colors.surface} />
              <Text style={styles.repeatButtonLabel}>Repetir</Text>
            </>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver el detalle del pedido ${order.orderNumber}`}
          onPress={() =>
            router.push({
              pathname: '/order/[orderNumber]',
              params: { orderNumber: order.orderNumber },
            })
          }
          style={({ pressed }) => [styles.repeatDetail, pressed && styles.pressed]}
        >
          <Text style={styles.repeatDetailLabel}>Detalle</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f3f7f4',
  },
  content: {
    paddingBottom: spacing.xl + spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },

  header: {
    backgroundColor: colors.brand950,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md + 2,
    backgroundColor: colors.surfaceDarkRaised,
  },
  headerBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent600,
  },
  headerBadgeText: {
    ...type.caption,
    color: colors.surface,
  },
  signIn: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceDarkRaised,
  },
  signInLabel: {
    ...type.body,
    fontWeight: '800',
    color: colors.onDark,
  },

  hero: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.brand950,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl + 8,
    borderBottomRightRadius: radius.xl + 8,
  },
  heroOrbTop: {
    position: 'absolute', width: 210, height: 210, borderRadius: 105,
    top: -120, right: -72, backgroundColor: 'rgba(35,124,82,.28)',
  },
  heroOrbBottom: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    bottom: 120, left: -120, backgroundColor: 'rgba(232,148,15,.12)',
  },
  kicker: {
    ...type.label,
    color: colors.brand100,
  },
  heroTitle: {
    ...type.hero,
    color: colors.onDark,
    marginTop: spacing.sm,
  },
  heroCopy: {
    ...type.body,
    color: colors.onDarkMuted,
    marginTop: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
  },
  heroVisual: {
    height: 230,
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.18)',
    backgroundColor: colors.surfaceDarkRaised,
    marginBottom: spacing.lg,
    ...shadow.lg,
  },
  heroVisualImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  heroVisualShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(7,42,30,.28)',
  },
  heroVisualCopy: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  heroVisualPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,.92)',
  },
  heroVisualPillText: {
    ...type.caption,
    color: colors.brand800,
    fontWeight: '900',
  },
  heroVisualTitle: {
    ...type.heading,
    color: colors.surface,
    marginTop: spacing.sm,
  },
  heroVisualText: {
    ...type.bodySm,
    color: colors.surface,
    marginTop: 2,
  },
  heroFloatingStat: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,.95)',
  },
  heroFloatingStatText: {
    ...type.caption,
    color: colors.brand900,
    fontWeight: '900',
  },
  heroButton: {
    marginTop: spacing.sm + spacing.xs,
    backgroundColor: colors.accent600,
    borderColor: colors.accent600,
    minHeight: 60,
  },
  returning: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  returningSkeletonGap: {
    marginTop: spacing.sm,
  },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm + spacing.xs,
  },
  shortcut: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
  },
  shortcutLabel: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },

  activeCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
  },
  activeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  activeIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand700,
  },
  activeCopy: {
    flex: 1,
  },
  activeTitle: {
    ...type.heading,
    color: colors.ink,
  },
  activeMeta: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  progressStep: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  progressStepDone: {
    backgroundColor: colors.brand600,
  },
  activeNext: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },

  returningHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  returningTitle: {
    ...type.heading,
    color: colors.ink,
  },
  repeatRail: {
    gap: spacing.sm + spacing.xs,
    paddingBottom: spacing.xs,
  },
  repeatCard: {
    width: 246,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.md,
  },
  repeatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repeatDate: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  repeatTotal: {
    ...type.bodySm,
    fontWeight: '900',
    color: colors.brand700,
  },
  repeatItems: {
    ...type.body,
    fontWeight: '700',
    color: colors.ink,
    marginTop: spacing.sm,
    minHeight: 44,
  },
  repeatActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  repeatButton: {
    flex: 1,
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.brand600,
  },
  repeatButtonLabel: {
    ...type.label,
    color: colors.surface,
  },
  repeatDetail: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + spacing.xs,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  repeatDetailLabel: {
    ...type.label,
    color: colors.brand700,
  },

  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.sm + spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.accent50,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  planCopy: {
    flex: 1,
  },
  planEyebrow: {
    ...type.label,
    color: colors.brand600,
  },
  planTitle: {
    ...type.body,
    fontWeight: '900',
    color: colors.ink,
    marginTop: 3,
  },
  planText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },

  sectionHeader: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitles: {
    flex: 1,
  },
  eyebrow: {
    ...type.label,
    color: colors.brand600,
  },
  sectionTitle: {
    ...type.title,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  seeAll: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  seeAllLabel: {
    ...type.bodySm,
    fontWeight: '900',
    color: colors.brand700,
  },

  rail: {
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  railItem: {
    width: 276,
  },
  reason: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    marginBottom: spacing.xs + 2,
  },
  reasonText: {
    ...type.caption,
    flexShrink: 1,
    color: colors.brand700,
  },
  railSkeleton: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  emptyRail: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  inlineError: {
    alignItems: 'center',
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  inlineErrorText: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  inlineErrorAction: {
    marginTop: spacing.md,
    minWidth: 180,
  },

  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  modeCard: {
    flexGrow: 1,
    flexBasis: 160,
    minHeight: 164,
    gap: spacing.sm + spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  modeIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  modeCopy: {
    flex: 1,
  },
  modeTitle: {
    ...type.body,
    fontWeight: '900',
    color: colors.ink,
    marginTop: spacing.md,
  },
  modeDescription: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },

  coverageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 72,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm + spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
  },
  coverageTitle: {
    marginTop: 0,
  },
  businessCard: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
  },
  businessCopy: {
    flex: 1,
  },
  businessTitle: {
    ...type.body,
    fontWeight: '900',
    color: colors.brand900,
  },
  businessText: {
    ...type.bodySm,
    color: colors.brand700,
    marginTop: 3,
  },
});
