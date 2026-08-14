import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BottomSheet } from '../../src/components/BottomSheet';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useReorder } from '../../src/hooks/useReorder';
import {
  buildOrderProgress,
  CANCELLABLE_STATUSES,
  TERMINAL_STATUSES,
} from '../../src/lib/orderProgress';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { ordersApi } from '../../src/services/api/orders.service';
import type { PagedResult } from '../../src/services/api/client';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { OrderStatus, OrderSummary } from '../../src/types/domain';

/**
 * Historial de pedidos.
 *
 * Antes se pedía una sola página y se dibujaba con `ScrollView` + `map`: un
 * cliente fiel con ochenta pedidos veía solo los veinte últimos y montaba todas
 * las tarjetas de golpe. Ahora la lista está virtualizada, pide la página
 * siguiente al llegar al final y, mientras haya un pedido en marcha, se relee
 * sola para que el estado de la tarjeta no mienta.
 */
const PAGE_SIZE = 20;
const LIVE_POLL_MS = 20_000;

type OrderFilter = 'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';

const FILTERS: Array<{ value: OrderFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'En curso' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

interface StatusBadge {
  label: string;
  color: string;
  background: string;
}

/** Cada par color/fondo está elegido para leerse sobre la tarjeta blanca. */
const STATUS: Record<OrderStatus, StatusBadge> = {
  PENDING_PAYMENT: { label: 'Pago pendiente', color: '#7d5200', background: '#fff3d8' },
  CONFIRMED: { label: 'Confirmado', color: colors.brand700, background: colors.brand50 },
  PREPARING: { label: 'En preparación', color: '#8a5300', background: '#fff1d9' },
  READY: { label: 'Listo', color: '#0f6b48', background: '#ddf4e8' },
  OUT_FOR_DELIVERY: { label: 'En camino', color: '#245a92', background: '#e6f1ff' },
  DELIVERED: { label: 'Entregado', color: '#0f6b48', background: '#ddf4e8' },
  CANCELLED: { label: 'Cancelado', color: '#9a3535', background: '#ffefef' },
  REFUNDED: { label: 'Reembolsado', color: '#65468a', background: '#f2ecff' },
};

/**
 * Campos que el backend sí manda en cada fila del historial pero que
 * `OrderSummary` todavía no declara. Se leen con una intersección, no con `any`,
 * y desaparecen en cuanto el tipo compartido los recoja.
 */
interface OrderRowExtras {
  serviceMode?: 'ASAP' | 'SCHEDULED';
  scheduledAt?: string | null;
  cancelReason?: string | null;
  addressSnapshotJson?: { districtName?: string | null } | null;
}

const extrasOf = (order: OrderSummary): OrderRowExtras => order as OrderSummary & OrderRowExtras;

const isActive = (order: OrderSummary): boolean => !TERMINAL_STATUSES.includes(order.status);

const money = (value: number | string): string => `S/ ${Number(value).toFixed(2)}`;

const dateShort = (value: string): string =>
  new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

const dateTime = (value: string): string =>
  new Date(value).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const openDetail = (orderNumber: string): void => {
  router.push({ pathname: '/order/[orderNumber]', params: { orderNumber } });
};

/** Las rutas tipadas de expo-router (`.expo/types`) todavía no recogen esta pantalla. */
const SUPPORT_ROUTE = '/support' as Href;

export default function OrdersScreen() {
  const { status: sessionStatus } = useSession();
  const authenticated = sessionStatus === 'authenticated';
  const toast = useToast();
  const { reorder, reorderingNumber } = useReorder();

  const [filter, setFilter] = useState<OrderFilter>('ALL');
  /** Páginas 2, 3… El hook de datos gobierna solo la primera. */
  const [extraOrders, setExtraOrders] = useState<OrderSummary[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [sheetOrder, setSheetOrder] = useState<OrderSummary | null>(null);
  const [cancellingNumber, setCancellingNumber] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const firstPage = useResource<PagedResult<OrderSummary>>({
    key: authenticated ? 'orders:list:1' : null,
    fetcher: () => ordersApi.listPaged({ page: 1, pageSize: PAGE_SIZE }),
    cacheMs: 15_000,
    // Con un pedido en marcha la lista se relee sola; sin ninguno, no hay nada
    // que refrescar y el sondeo solo gastaría batería.
    pollIntervalMs: live ? LIVE_POLL_MS : 0,
  });

  const orders = useMemo(() => {
    // Un pedido nuevo desplaza la paginación mientras se lee: sin esta criba, el
    // que estaba en el límite de la página aparecería dos veces.
    const seen = new Set<number>();
    const unique: OrderSummary[] = [];

    [...(firstPage.data?.items ?? []), ...extraOrders].forEach((order) => {
      if (seen.has(order.id)) return;
      seen.add(order.id);
      unique.push(order);
    });

    return unique;
  }, [extraOrders, firstPage.data]);

  useEffect(() => {
    setLive(orders.some(isActive));
  }, [orders]);

  const meta = firstPage.data?.meta ?? null;
  const hasMore = meta !== null && nextPage <= meta.totalPages;

  /*
   * `onEndReached` puede dispararse dos veces en el mismo fotograma, antes de que
   * el estado se entere de la primera. Con la bandera en una ref, la segunda
   * llamada se descarta de verdad: si no, ambas pedirían la MISMA página y
   * `nextPage` avanzaría dos veces, saltándose una entera del historial.
   */
  const loadingMoreRef = useRef(false);
  /** Sube en cada refresco: descarta la página que venía en camino desde antes. */
  const generationRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (!authenticated || loadingMoreRef.current || !hasMore) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await ordersApi.listPaged({ page: nextPage, pageSize: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      setExtraOrders((current) => [...current, ...page.items]);
      setNextPage((value) => value + 1);
    } catch (caught) {
      if (generation !== generationRef.current) return;
      setMoreError(caught instanceof Error ? caught.message : 'No pudimos cargar más pedidos.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [authenticated, hasMore, nextPage]);

  /** Tirar hacia abajo rehace el historial entero, no solo la primera página. */
  const refreshAll = useCallback(async () => {
    generationRef.current += 1;
    setExtraOrders([]);
    setNextPage(2);
    setMoreError(null);
    await firstPage.refresh();
  }, [firstPage]);

  const cancelOrder = useCallback(
    (order: OrderSummary) => {
      Alert.alert(
        `Cancelar el pedido ${order.orderNumber}`,
        'Solo se puede cancelar antes de que la cocina empiece. Si hubo cobro, la devolución seguirá tu medio de pago.',
        [
          { text: 'Conservar pedido', style: 'cancel' },
          {
            text: 'Sí, cancelar',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setCancellingNumber(order.orderNumber);
                try {
                  await ordersApi.cancel(
                    order.orderNumber,
                    'Cancelado desde la aplicación móvil',
                  );
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  toast.show({ tone: 'success', message: 'Cancelamos tu pedido.' });
                  setSheetOrder(null);
                  invalidateResource('orders:', { prefix: true });
                  await refreshAll();
                } catch (caught) {
                  toast.show({
                    tone: 'error',
                    message:
                      caught instanceof Error ? caught.message : 'No pudimos cancelar tu pedido.',
                  });
                } finally {
                  setCancellingNumber(null);
                }
              })();
            },
          },
        ],
      );
    },
    [refreshAll, toast],
  );

  const counts = useMemo(
    () => ({
      ALL: orders.length,
      ACTIVE: orders.filter(isActive).length,
      DELIVERED: orders.filter((order) => order.status === 'DELIVERED').length,
      CANCELLED: orders.filter(
        (order) => order.status === 'CANCELLED' || order.status === 'REFUNDED',
      ).length,
    }),
    [orders],
  );

  /** Lo que el cliente vino a mirar va primero, aunque sea de ayer. */
  const sorted = useMemo(
    () =>
      [...orders].sort((left, right) => {
        const activeDiff = Number(isActive(right)) - Number(isActive(left));
        if (activeDiff !== 0) return activeDiff;
        return new Date(right.placedAt).getTime() - new Date(left.placedAt).getTime();
      }),
    [orders],
  );

  const featured = filter === 'ALL' ? (sorted.find(isActive) ?? null) : null;

  const rows = useMemo(
    () =>
      sorted.filter((order) => {
        if (order.id === featured?.id) return false;
        if (filter === 'ACTIVE') return isActive(order);
        if (filter === 'DELIVERED') return order.status === 'DELIVERED';
        if (filter === 'CANCELLED')
          return order.status === 'CANCELLED' || order.status === 'REFUNDED';
        return true;
      }),
    [featured?.id, filter, sorted],
  );

  if (sessionStatus === 'bootstrapping') {
    return (
      <ScreenScaffold showBack={false} edges={['top', 'left', 'right']}>
        <OrdersSkeleton />
      </ScreenScaffold>
    );
  }

  if (!authenticated) {
    return (
      <ScreenScaffold showBack={false} edges={['top', 'left', 'right']}>
        <EmptyState
          icon="receipt-text-outline"
          title="Tus pedidos, en un solo lugar"
          message="Inicia sesión para seguir la preparación en vivo, revisar entregas anteriores y repetir tu bowl favorito."
          actionLabel="Iniciar sesión"
          onAction={() => router.push('/(auth)/login')}
          secondaryLabel="Crear cuenta"
          onSecondary={() => router.push('/(auth)/register')}
        />
      </ScreenScaffold>
    );
  }

  const failed = firstPage.error !== null && orders.length === 0;
  const showSkeleton = firstPage.loading && orders.length === 0;

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>TU ACTIVIDAD</Text>
      <Text style={styles.title}>Mis pedidos</Text>
      <Text style={styles.subtitle}>
        {live
          ? 'Tienes un pedido en marcha: esta pantalla se mantiene al día sola.'
          : 'Sigue el estado, revisa el detalle y repite lo que más te gustó.'}
      </Text>

      {orders.length > 0 ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                badge={counts[item.value]}
                selected={filter === item.value}
                onPress={() => setFilter(item.value)}
              />
            ))}
          </ScrollView>

          {meta !== null && meta.total > orders.length ? (
            <Text style={styles.countHint}>
              Mostrando {orders.length} de {meta.total} pedidos
            </Text>
          ) : null}
        </>
      ) : null}

      {featured ? (
        <FeaturedOrder
          order={featured}
          onPress={() => openDetail(featured.orderNumber)}
        />
      ) : null}
    </View>
  );

  const empty = showSkeleton ? (
    <OrdersSkeleton />
  ) : failed ? (
    <EmptyState
      icon="cloud-alert-outline"
      title="No pudimos cargar tus pedidos"
      message={`${firstPage.error?.message ?? 'Revisa tu conexión.'} Tus compras siguen registradas.`}
      actionLabel="Reintentar"
      onAction={() => void firstPage.refetch()}
    />
  ) : orders.length === 0 ? (
    <EmptyState
      icon="shopping-outline"
      title="Todavía no tienes pedidos"
      message="Cuando hagas tu primera compra podrás seguirla en vivo y revisar su detalle desde aquí."
      actionLabel="Explorar el menú"
      onAction={() => router.push('/(tabs)/menu')}
    />
  ) : (
    <EmptyState
      icon="filter-remove-outline"
      title="No hay pedidos en esta categoría"
      message="Puedes volver a ver todo tu historial de compras."
      actionLabel="Ver todos"
      onAction={() => setFilter('ALL')}
      fill={false}
    />
  );

  const footer = moreError ? (
    <View style={styles.footer}>
      <Text style={styles.footerError}>{moreError}</Text>
      <PrimaryButton
        label="Reintentar"
        variant="secondary"
        onPress={() => void loadMore()}
        style={styles.footerButton}
      />
    </View>
  ) : loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.brand600} />
      <Text style={styles.footerText}>Trayendo más pedidos…</Text>
    </View>
  ) : hasMore ? (
    <View style={styles.footer}>
      <PrimaryButton
        label="Cargar más pedidos"
        variant="secondary"
        onPress={() => void loadMore()}
        style={styles.footerButton}
      />
    </View>
  ) : orders.length > PAGE_SIZE ? (
    <Text style={styles.footerText}>Ese es todo tu historial: {orders.length} pedidos.</Text>
  ) : null;

  const renderItem = ({ item }: ListRenderItemInfo<OrderSummary>) => (
    <OrderCard
      order={item}
      onPress={() => openDetail(item.orderNumber)}
      onActions={() => setSheetOrder(item)}
    />
  );

  return (
    <ScreenScaffold showBack={false} edges={['top', 'left', 'right']}>
      <FlatList
        data={showSkeleton || failed ? [] : rows}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        // El pie se pinta también con la lista filtrada vacía: los pedidos que
        // faltan por traer pueden ser justo los de la categoría elegida.
        ListFooterComponent={showSkeleton || failed ? null : footer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loadingMore && !moreError) void loadMore();
        }}
        refreshControl={
          <RefreshControl
            refreshing={firstPage.refreshing}
            onRefresh={() => void refreshAll()}
            tintColor={colors.brand600}
            colors={[colors.brand600]}
          />
        }
        initialNumToRender={6}
        windowSize={9}
        removeClippedSubviews
      />

      <BottomSheet
        visible={sheetOrder !== null}
        onClose={() => setSheetOrder(null)}
        title={sheetOrder ? `Pedido ${sheetOrder.orderNumber}` : 'Pedido'}
        subtitle={
          sheetOrder
            ? `${STATUS[sheetOrder.status].label} · ${money(sheetOrder.grandTotal)}`
            : undefined
        }
        footer={
          sheetOrder ? (
            <PrimaryButton
              label={isActive(sheetOrder) ? 'Ver el seguimiento' : 'Ver el detalle'}
              onPress={() => {
                const orderNumber = sheetOrder.orderNumber;
                setSheetOrder(null);
                openDetail(orderNumber);
              }}
            />
          ) : undefined
        }
      >
        {sheetOrder ? (
          <View style={styles.sheet}>
            <PrimaryButton
              label="Volver a pedir"
              variant="secondary"
              loading={reorderingNumber === sheetOrder.orderNumber}
              onPress={() => {
                const orderNumber = sheetOrder.orderNumber;
                setSheetOrder(null);
                void reorder(orderNumber);
              }}
              style={styles.sheetAction}
            />

            {CANCELLABLE_STATUSES.includes(sheetOrder.status) ? (
              <PrimaryButton
                label="Cancelar pedido"
                variant="secondary"
                loading={cancellingNumber === sheetOrder.orderNumber}
                onPress={() => cancelOrder(sheetOrder)}
                style={styles.sheetAction}
              />
            ) : null}

            <PrimaryButton
              label="Necesito ayuda"
              variant="ghost"
              onPress={() => {
                setSheetOrder(null);
                router.push(SUPPORT_ROUTE);
              }}
              style={styles.sheetAction}
            />
          </View>
        ) : null}
      </BottomSheet>
    </ScreenScaffold>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas de la lista                                                  */
/* ------------------------------------------------------------------ */

/** Punto que late mientras el pedido está vivo. Se queda quieto con movimiento reducido. */
function LiveDot() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(0.25, { duration: 780, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View style={[styles.ribbonDot, animatedStyle]} />;
}

interface FeaturedOrderProps {
  order: OrderSummary;
  onPress: () => void;
}

/**
 * El pedido en curso no puede leerse igual que uno de hace tres meses: es lo
 * único que el cliente vino a mirar, así que sube arriba con su avance a la vista.
 */
function FeaturedOrder({ order, onPress }: FeaturedOrderProps) {
  const badge = STATUS[order.status];
  const progress = buildOrderProgress(order);
  const extras = extrasOf(order);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pedido en curso ${order.orderNumber}, ${badge.label}. Ver seguimiento`}
      onPress={onPress}
      style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
    >
      <View style={styles.ribbon}>
        <LiveDot />
        <Text style={styles.ribbonText}>PEDIDO EN CURSO</Text>
      </View>

      <View style={styles.featuredBody}>
        <View style={styles.featuredTop}>
          <View style={styles.featuredHeading}>
            <Text style={styles.featuredNumber}>Pedido {order.orderNumber}</Text>
            <Text style={styles.featuredDate}>
              {extras.serviceMode === 'SCHEDULED' && extras.scheduledAt
                ? `Programado para el ${dateTime(extras.scheduledAt)}`
                : dateShort(order.placedAt)}
            </Text>
          </View>

          <View style={[styles.badge, { backgroundColor: badge.background }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.bar}>
          {progress.steps.map((step) => (
            <View
              key={step.status}
              style={[styles.barSegment, step.done && styles.barSegmentDone]}
            />
          ))}
        </View>

        <View style={styles.featuredLegend}>
          <Text style={styles.featuredStep}>
            Paso {progress.reached} de {progress.steps.length}
          </Text>
          {progress.nextLabel ? (
            <Text style={styles.featuredNext}>Sigue: {progress.nextLabel}</Text>
          ) : null}
        </View>

        <View style={styles.featuredFooter}>
          <View>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.featuredTotal}>{money(order.grandTotal)}</Text>
          </View>

          <View style={styles.featuredCta}>
            <Text style={styles.featuredCtaText}>Ver seguimiento</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.surface} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

interface OrderCardProps {
  order: OrderSummary;
  onPress: () => void;
  onActions: () => void;
}

function OrderCard({ order, onPress, onActions }: OrderCardProps) {
  const badge = STATUS[order.status];
  const extras = extrasOf(order);
  const items = order.items ?? [];
  const units = items.reduce((total, item) => total + item.quantity, 0);
  const destination =
    order.deliveryType === 'DELIVERY'
      ? (extras.addressSnapshotJson?.districtName ?? 'Entrega a domicilio')
      : (order.branch?.name ?? 'Recojo en tienda');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Pedido ${order.orderNumber}, ${badge.label}, ${money(order.grandTotal)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardNumber}>Pedido {order.orderNumber}</Text>
          <Text style={styles.cardDate}>{dateShort(order.placedAt)}</Text>
        </View>

        <View style={[styles.badge, { backgroundColor: badge.background }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>

      {items.length > 0 ? (
        <View style={styles.cardItems}>
          {items.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.cardItemRow}>
              <Text style={styles.cardItemQuantity}>{item.quantity}×</Text>
              <Text numberOfLines={1} style={styles.cardItemName}>
                {item.productNameSnapshot ?? 'Producto'}
              </Text>
            </View>
          ))}

          {items.length > 3 ? (
            <Text style={styles.cardItemsMore}>
              y {items.length - 3} {items.length - 3 === 1 ? 'producto más' : 'productos más'}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardMeta}>
        <MaterialCommunityIcons
          name={order.deliveryType === 'DELIVERY' ? 'moped-outline' : 'storefront-outline'}
          size={18}
          color={colors.brand700}
        />
        <Text numberOfLines={1} style={styles.cardMetaText}>
          {order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'} · {destination}
          {units > 0 ? ` · ${units} ${units === 1 ? 'unidad' : 'unidades'}` : ''}
        </Text>
      </View>

      {extras.cancelReason ? (
        <Text style={styles.cardCancelReason}>Motivo: {extras.cancelReason}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.cardTotal}>{money(order.grandTotal)}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Acciones del pedido ${order.orderNumber}`}
          hitSlop={layout.iconHitSlop}
          onPress={onActions}
          style={({ pressed }) => [styles.cardActions, pressed && styles.pressed]}
        >
          <Text style={styles.cardActionsText}>Acciones</Text>
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.brand700} />
        </Pressable>
      </View>
    </Pressable>
  );
}

/** Silueta de la primera carga: tres tarjetas con la forma de las de verdad. */
function OrdersSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton width="45%" height={14} rounded="sm" />
      <Skeleton width="70%" height={30} rounded="sm" style={styles.skeletonGap} />

      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonCard}>
          <Skeleton width="55%" height={16} rounded="sm" />
          <Skeleton width="35%" height={12} rounded="sm" style={styles.skeletonLine} />
          <Skeleton height={10} rounded="pill" style={styles.skeletonLine} />
          <Skeleton width="40%" height={20} rounded="sm" style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: 112,
    flexGrow: 1,
    backgroundColor: '#f3f7f4',
  },
  header: {
    paddingTop: spacing.sm,
  },
  eyebrow: {
    ...type.label,
    color: colors.brand600,
  },
  title: {
    ...type.hero,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
  },
  countHint: {
    ...type.caption,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  featured: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    ...shadow.md,
  },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand900,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ribbonDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent500,
  },
  ribbonText: {
    ...type.label,
    color: colors.onDark,
  },
  featuredBody: {
    padding: spacing.lg,
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  featuredHeading: {
    flex: 1,
  },
  featuredNumber: {
    ...type.heading,
    color: colors.ink,
  },
  featuredDate: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  bar: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  barSegment: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  barSegmentDone: {
    backgroundColor: colors.brand600,
  },
  featuredLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  featuredStep: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  featuredNext: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingTop: spacing.md,
  },
  totalLabel: {
    ...type.label,
    color: colors.inkMuted,
  },
  featuredTotal: {
    ...type.heading,
    color: colors.brand700,
    marginTop: 2,
  },
  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brand600,
  },
  featuredCtaText: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.surface,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm + spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeading: {
    flex: 1,
  },
  cardNumber: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  cardDate: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: 6,
  },
  badgeText: {
    ...type.caption,
  },
  cardItems: {
    marginTop: spacing.sm + spacing.xs,
    gap: spacing.xs,
  },
  cardItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardItemQuantity: {
    ...type.caption,
    minWidth: 26,
    color: colors.brand700,
    backgroundColor: colors.brand50,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textAlign: 'center',
    overflow: 'hidden',
  },
  cardItemName: {
    ...type.bodySm,
    flex: 1,
    color: colors.ink,
  },
  cardItemsMore: {
    ...type.caption,
    color: colors.brand700,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm + spacing.xs,
  },
  cardMetaText: {
    ...type.bodySm,
    flex: 1,
    color: colors.inkMuted,
  },
  cardCancelReason: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm + spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingTop: spacing.sm + spacing.xs,
  },
  cardTotal: {
    ...type.heading,
    color: colors.brand700,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.sm + spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.brand50,
  },
  cardActionsText: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },
  sheet: {
    paddingBottom: spacing.sm,
  },
  sheetAction: {
    marginTop: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  footerButton: {
    minWidth: 220,
  },
  footerText: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  footerError: {
    ...type.bodySm,
    color: colors.danger,
    textAlign: 'center',
  },
  skeleton: {
    paddingTop: spacing.sm,
  },
  skeletonGap: {
    marginTop: spacing.sm,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  skeletonLine: {
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
