import { OrderDirectPayment } from '../../src/components/OrderDirectPayment';
import { OrderCustomerExtras } from '../../src/components/OrderCustomerExtras';
import { OrderExperienceCard } from '../../src/components/OrderExperienceCard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { resolvePublicAssetUrl } from '../../src/config/env';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useReorder } from '../../src/hooks/useReorder';
import {
  buildOrderProgress,
  CANCELLABLE_STATUSES,
  TERMINAL_STATUSES,
} from '../../src/lib/orderProgress';
import { useToast } from '../../src/providers/ToastProvider';
import { ApiRequestError } from '../../src/services/api/client';
import { ordersApi } from '../../src/services/api/orders.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type {
  OrderDelivery,
  OrderItemDetail,
  OrderStatus,
  OrderWithPayment,
} from '../../src/types/domain';

/**
 * Seguimiento del pedido.
 *
 * Hasta ahora esta pantalla se leía una sola vez: quien esperaba su comida veía
 * «En preparación» congelado hasta que se le ocurría tirar hacia abajo. Ahora
 * sondea igual que la web (15 s), y el sondeo se detiene solo cuando el pedido
 * llega a un estado terminal o cuando la app pasa a segundo plano.
 */
const POLL_MS = 15_000;

/* ------------------------------------------------------------------ */
/* Reparto                                                             */
/* ------------------------------------------------------------------ */

const DELIVERY_LABEL: Record<OrderDelivery['status'], string> = {
  PENDING: 'Buscando repartidor',
  ASSIGNED: 'Repartidor asignado',
  PICKED_UP: 'Recogido del local',
  ON_ROUTE: 'En ruta hacia ti',
  DELIVERED: 'Entregado',
  FAILED: 'Entrega con incidencia',
};

/* ------------------------------------------------------------------ */
/* Pantalla                                                            */
/* ------------------------------------------------------------------ */

interface StatusView {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  copy: string;
}

const STATUS: Record<OrderStatus, StatusView> = {
  PENDING_PAYMENT: {
    label: 'Pago pendiente',
    icon: 'credit-card-clock-outline',
    color: colors.accent600,
    copy: 'Tu pedido está reservado. Cocina lo recibe apenas se confirme el pago.',
  },
  CONFIRMED: {
    label: 'Confirmado',
    icon: 'check-decagram-outline',
    color: colors.brand600,
    copy: 'Cocina ya tiene tu pedido en cola.',
  },
  PREPARING: {
    label: 'En preparación',
    icon: 'chef-hat',
    color: colors.accent600,
    copy: 'La cocina está preparando tus productos.',
  },
  READY: {
    label: 'Listo',
    icon: 'package-variant-closed',
    color: colors.brand600,
    copy: 'Tu pedido ya está listo.',
  },
  OUT_FOR_DELIVERY: {
    label: 'En camino',
    icon: 'moped-outline',
    color: '#3a86c8',
    copy: 'Tu pedido salió del local y va hacia ti.',
  },
  DELIVERED: {
    label: 'Entregado',
    icon: 'silverware-fork-knife',
    color: colors.success,
    copy: 'Tu pedido fue entregado. ¡Que lo disfrutes!',
  },
  CANCELLED: {
    label: 'Cancelado',
    icon: 'close-circle-outline',
    color: colors.danger,
    copy: 'Este pedido se canceló. Si ya habías pagado, consulta el estado de la devolución en el detalle o con el equipo.',
  },
  REFUNDED: {
    label: 'Reembolsado',
    icon: 'cash-refund',
    color: '#8264ac',
    copy: 'Te devolvimos el importe a tu medio de pago.',
  },
};

const money = (value: number | string): string => `S/ ${Number(value).toFixed(2)}`;

const dateTime = (value: string): string =>
  new Date(value).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const dateShort = (value: string): string =>
  new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

/** Solo se abre lo que sea http(s); un comprobante con otro esquema no se toca. */
const openableUrl = (value?: string | null): string | null => {
  const resolved = resolvePublicAssetUrl(value);
  return resolved && /^https?:\/\//i.test(resolved) ? resolved : null;
};

/**
 * Rutas que las tipadas de expo-router (`.expo/types`) aún no recogen: el fichero
 * generado está desfasado y solo se regenera al arrancar el servidor. El resto de
 * la app resuelve estos dos casos igual; no hay `any` de por medio, solo el tipo
 * `Href` que la propia librería expone.
 */
const SUPPORT_ROUTE = '/support' as Href;
const REVIEWS_ROUTE = '/reviews' as Href;

export default function OrderDetailScreen() {
  const params = useLocalSearchParams<{ orderNumber?: string }>();
  const orderNumber = typeof params.orderNumber === 'string' ? params.orderNumber : '';

  const toast = useToast();
  const { reorder, reorderingNumber } = useReorder();
  const [cancelling, setCancelling] = useState(false);
  const [payingBalance, setPayingBalance] = useState(false);
  const [stoppingWhatsapp, setStoppingWhatsapp] = useState(false);

  const [terminal, setTerminal] = useState(false);
  const resource = useResource<OrderWithPayment>({
    key: orderNumber ? `orders:detail:${orderNumber}` : null,
    fetcher: () => ordersApi.detail(orderNumber),
    // El estado de un pedido caduca en segundos: al volver a la pantalla se relee.
    cacheMs: 0,
    pollIntervalMs: terminal ? 0 : POLL_MS,
  });

  const order = resource.data?.order ?? null;
  const payment = resource.data?.payment ?? null;
  const status = order?.status ?? null;

  useEffect(() => {
    if (status === null) return;
    setTerminal(TERMINAL_STATUSES.includes(status));
  }, [status]);

  /*
   * El sondeo cambia el estado sin que nadie lo pida. Anunciarlo es media razón de
   * ser de esta pantalla: quien la deja abierta encima de la mesa se entera de que
   * su pedido salió sin tener que mirarla.
   */
  const previousStatus = useRef<OrderStatus | null>(null);
  /** El cambio que provoca el propio cliente ya tiene su aviso: no se anuncia dos veces. */
  const skipAnnounce = useRef(false);

  useEffect(() => {
    if (status === null) return;
    const before = previousStatus.current;
    previousStatus.current = status;
    if (before === null || before === status) return;

    if (skipAnnounce.current) {
      skipAnnounce.current = false;
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.show({ tone: 'success', message: `Tu pedido ahora está: ${STATUS[status].label}.` });
  }, [status, toast]);

  const progress = useMemo(
    () => (order ? buildOrderProgress(order) : null),
    [order],
  );
  // `delivery` solo viene en pedidos a domicilio: en recojo y salón es null.
  const delivery = useMemo<OrderDelivery | null>(() => order?.delivery ?? null, [order]);

  const cancel = useCallback(() => {
    if (!order) return;
    Alert.alert(
      'Cancelar este pedido',
      'Solo se puede cancelar antes de que la cocina empiece. Si hubo cobro, la devolución puede requerir coordinación con el negocio.',
      [
        { text: 'Conservar pedido', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCancelling(true);
              try {
                const cancelled = await ordersApi.cancel(order.orderNumber, 'Cancelado desde la aplicación móvil');
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                toast.show({ tone: 'success', message: cancelled.refundPending ? 'Pedido cancelado. La devolución requiere coordinación con el negocio.' : cancelled.refunded ? 'Pedido cancelado. La devolución online fue procesada.' : 'Cancelamos tu pedido.' });
                skipAnnounce.current = true;
                // El historial y este detalle dejan de valer en el mismo instante.
                invalidateResource('orders:', { prefix: true });
                await resource.refetch();
              } catch (caught) {
                toast.show({
                  tone: 'error',
                  message:
                    caught instanceof Error ? caught.message : 'No pudimos cancelar tu pedido.',
                });
              } finally {
                setCancelling(false);
              }
            })();
          },
        },
      ],
    );
  }, [order, resource, toast]);

  const payBalance = useCallback(async () => {
    if (!order) return;
    setPayingBalance(true);
    try {
      const result = await ordersApi.payBalance(order.orderNumber);
      const url = openableUrl(result.checkoutUrl);
      if (url) await Linking.openURL(url);
    } catch (caught) {
      toast.show({ tone: 'error', message: caught instanceof Error ? caught.message : 'No pudimos abrir el pago del saldo.' });
    } finally {
      setPayingBalance(false);
    }
  }, [order, toast]);

  const contactSupport = useCallback(async () => {
    const digits = (order?.branch?.phone ?? '').replace(/\D/g, '');
    if (!digits) {
      router.push(SUPPORT_ROUTE);
      return;
    }
    const text = encodeURIComponent(
      `Hola Misky Challay, necesito ayuda con el pedido ${orderNumber}.`,
    );
    const url = `https://wa.me/${digits}?text=${text}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      router.push(SUPPORT_ROUTE);
      return;
    }
    await Linking.openURL(url);
  }, [order?.branch?.phone, orderNumber]);

  const goBack = useCallback(() => {
    // Se llega aquí desde una notificación con la pila vacía: sin esto no habría salida.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders');
  }, []);

  if (!orderNumber) {
    return (
      <ScreenScaffold tone="dark" showBack onBack={goBack}>
        <EmptyState
          tone="dark"
          icon="receipt-text-outline"
          title="No encontramos ese pedido"
          message="El enlace no trae un número de pedido válido."
          actionLabel="Ver mis pedidos"
          onAction={() => router.replace('/(tabs)/orders')}
        />
      </ScreenScaffold>
    );
  }

  // Un 404 o un 403 no se arreglan reintentando: ese pedido no es de esta cuenta.
  const missing =
    resource.error instanceof ApiRequestError &&
    (resource.error.status === 404 || resource.error.status === 403);

  if (!order) {
    if (resource.loading) {
      return (
        <ScreenScaffold tone="dark" showBack onBack={goBack}>
          <DetailSkeleton />
        </ScreenScaffold>
      );
    }

    return (
      <ScreenScaffold tone="dark" showBack onBack={goBack}>
        <EmptyState
          tone="dark"
          icon={missing ? 'package-variant-closed-remove' : 'cloud-alert-outline'}
          title={missing ? 'No encontramos ese pedido' : 'No pudimos cargar tu pedido'}
          message={
            missing
              ? `El número ${orderNumber} no corresponde a ningún pedido de tu cuenta.`
              : `${resource.error?.message ?? 'Revisa tu conexión.'} Tu pedido ${orderNumber} sigue registrado.`
          }
          actionLabel={missing ? 'Ver mis pedidos' : 'Reintentar'}
          onAction={
            missing ? () => router.replace('/(tabs)/orders') : () => void resource.refetch()
          }
          secondaryLabel={missing ? undefined : 'Ver mis pedidos'}
          onSecondary={missing ? undefined : () => router.replace('/(tabs)/orders')}
        />
      </ScreenScaffold>
    );
  }

  const view = STATUS[order.status];
  const isPickup = order.deliveryType !== 'DELIVERY';
  const tracking = progress !== null && !progress.isTerminal;
  /** Hay contenido pero el último refresco falló: no se puede seguir prometiendo seguimiento. */
  const stale = resource.error !== null;
  const etaMinutes =
    typeof delivery?.etaMinutes === 'number' && delivery.etaMinutes > 0 ? delivery.etaMinutes : null;

  const heroCopy =
    order.status === 'READY' && isPickup ? 'Ya puedes acercarte a recogerlo.' : view.copy;

  const isMobilePayment = payment?.provider === 'yape' || payment?.provider === 'plin';
  const isCash = payment?.provider === 'cash';
  const invoicePdf = openableUrl(order.invoicePdfUrl);
  const invoiceXml = openableUrl(order.invoiceXmlUrl);
  const discountTotal = Number(order.discountTotal);
  const deliveryFee = Number(order.deliveryFee);

  return (
    <ScreenScaffold tone="dark" showBack onBack={goBack}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={resource.refreshing}
            onRefresh={() => void resource.refresh()}
            tintColor={colors.onDark}
            colors={[colors.brand600]}
          />
        }
      >
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: view.color }]}>
            <MaterialCommunityIcons name={view.icon} size={36} color={colors.onDark} />
          </View>

          <Text style={styles.heroEyebrow}>PEDIDO {order.orderNumber}</Text>
          <Text style={styles.heroTitle}>{view.label}</Text>
          <Text style={styles.heroCopy}>{heroCopy}</Text>

          {etaMinutes !== null && !progress?.isTerminal ? (
            <View style={styles.etaPill}>
              <MaterialCommunityIcons name="timer-sand" size={17} color={colors.onDark} />
              <Text style={styles.etaText}>Llega en unos {etaMinutes} min</Text>
            </View>
          ) : null}

          <OrderDirectPayment payment={payment?.directPayment} onChanged={() => void resource.refetch()} />
          {resource.data && <OrderCustomerExtras data={resource.data} onChanged={() => void resource.refetch()} />}
          <OrderExperienceCard orderNumber={order.orderNumber} />
          {tracking ? (
            stale ? (
              <View style={styles.staleRow}>
                <MaterialCommunityIcons name="wifi-off" size={18} color={colors.accent500} />
                <Text style={styles.staleText}>
                  No estamos pudiendo actualizar el estado; lo que ves puede estar desfasado.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Actualizar ahora"
                  hitSlop={layout.iconHitSlop}
                  onPress={() => void resource.refetch()}
                  style={({ pressed }) => [styles.staleButton, pressed && styles.pressed]}
                >
                  <Text style={styles.staleButtonText}>Actualizar</Text>
                </Pressable>
              </View>
            ) : (
              <View accessibilityLiveRegion="polite" style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>
                  Seguimiento activo · esta pantalla se actualiza sola cada 15 segundos
                </Text>
              </View>
            )
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.quickCard}>
            <View style={styles.quickCell}>
              <Text style={styles.quickLabel}>TOTAL</Text>
              <Text style={styles.quickTotal}>{money(order.grandTotal)}</Text>
            </View>

            <View style={styles.quickDivider} />

            <View style={styles.quickCell}>
              <Text style={styles.quickLabel}>MODALIDAD</Text>
              <Text style={styles.quickValue}>
                {order.deliveryType === 'DELIVERY'
                  ? 'Delivery'
                  : order.deliveryType === 'PICKUP'
                    ? 'Recojo'
                    : 'En salón'}
              </Text>
            </View>

            <View style={styles.quickDivider} />

            <View style={styles.quickCell}>
              <Text style={styles.quickLabel}>
                {order.serviceMode === 'SCHEDULED' ? 'PROGRAMADO' : 'FECHA'}
              </Text>
              <Text style={styles.quickValue}>
                {order.serviceMode === 'SCHEDULED' && order.scheduledAt
                  ? dateTime(order.scheduledAt)
                  : dateShort(order.placedAt)}
              </Text>
            </View>
          </View>

          {progress ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Avance</Text>

              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`Paso ${progress.reached} de ${progress.steps.length}: ${view.label}`}
                style={styles.bar}
              >
                {progress.steps.map((step) => (
                  <View
                    key={step.status}
                    style={[
                      styles.barSegment,
                      step.done && styles.barSegmentDone,
                      step.current && !progress.isCancelled && styles.barSegmentCurrent,
                      progress.isCancelled && step.done && styles.barSegmentCancelled,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.barLegend}>
                <Text style={styles.barStep}>
                  Paso {progress.reached} de {progress.steps.length}
                </Text>
                {progress.nextLabel ? (
                  <Text style={styles.barNext}>Sigue: {progress.nextLabel}</Text>
                ) : null}
              </View>

              {order.statusHistory?.length ? (
                <View style={styles.timeline}>
                  {order.statusHistory.map((row, index) => (
                    <View key={`${row.toStatus}-${row.createdAt}-${index}`} style={styles.timelineRow}>
                      <View style={styles.timelineRail}>
                        <View
                          style={[
                            styles.timelineDot,
                            { backgroundColor: STATUS[row.toStatus]?.color ?? colors.brand600 },
                          ]}
                        />
                        {index < (order.statusHistory?.length ?? 0) - 1 ? (
                          <View style={styles.timelineLine} />
                        ) : null}
                      </View>

                      <View style={styles.timelineCopy}>
                        <Text style={styles.timelineTitle}>
                          {STATUS[row.toStatus]?.label ?? row.toStatus}
                        </Text>
                        <Text style={styles.timelineDate}>{dateTime(row.createdAt)}</Text>
                        {row.comment ? (
                          <Text style={styles.timelineComment}>{row.comment}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.muted}>El primer evento aparecerá en cuanto cocina lo tome.</Text>
              )}
            </View>
          ) : null}

          {delivery ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Reparto</Text>

              <View style={styles.deliveryRow}>
                <View style={styles.deliveryIcon}>
                  <MaterialCommunityIcons
                    name={delivery.status === 'FAILED' ? 'alert-outline' : 'moped-outline'}
                    size={22}
                    color={delivery.status === 'FAILED' ? colors.danger : colors.brand700}
                  />
                </View>

                <View style={styles.deliveryCopy}>
                  <Text style={styles.deliveryStatus}>{DELIVERY_LABEL[delivery.status]}</Text>
                  <Text style={styles.deliveryMeta}>
                    {delivery.driver
                      ? `${delivery.driver.fullName}${delivery.driver.vehicle ? ` · ${delivery.driver.vehicle}` : ''}`
                      : 'Te asignaremos un repartidor en cuanto el pedido salga de cocina.'}
                  </Text>
                  {/* Sin ETA del servidor no se inventa un tiempo: se calla. */}
                  {etaMinutes !== null ? (
                    <Text style={styles.deliveryEta}>Tiempo estimado: {etaMinutes} min</Text>
                  ) : null}
                  {delivery.pickedUpAt ? (
                    <Text style={styles.deliveryMeta}>
                      Salió del local a las {dateTime(delivery.pickedUpAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {order.status === 'PENDING_PAYMENT' && !isMobilePayment && !isCash ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retomar el pago de este pedido"
              onPress={() =>
                router.push({ pathname: '/checkout/result', params: { orderNumber } })
              }
              style={({ pressed }) => [styles.noticeWarn, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name="credit-card-clock-outline"
                size={24}
                color={colors.warning}
              />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>El pago sigue pendiente</Text>
                <Text style={styles.noticeText}>
                  Cocina espera la confirmación de la pasarela. Toca para retomarlo de forma segura.
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.warning} />
            </Pressable>
          ) : null}

          {order.status === 'PENDING_PAYMENT' && isMobilePayment && payment ? (
            <View style={styles.noticeInfo}>
              <MaterialCommunityIcons name="cellphone-check" size={24} color="#6941a5" />
              <View style={styles.noticeCopy}>
                <Text style={[styles.noticeTitle, styles.noticeTitleBrand]}>
                  Validando {payment.provider.toUpperCase()}
                </Text>
                <Text style={[styles.noticeText, styles.noticeTextBrand]}>
                  Operación {payment.mobileClaim?.operationCode ?? payment.providerReference ?? '—'}.
                  Caja debe encontrar el movimiento en la cuenta real antes de mandarlo a cocina.
                </Text>
              </View>
            </View>
          ) : null}

          {payment?.mobileClaim?.status === 'REJECTED' ? (
            <View style={styles.noticeDanger}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.danger} />
              <View style={styles.noticeCopy}>
                <Text style={[styles.noticeTitle, styles.noticeTitleDanger]}>
                  Caja no encontró ese movimiento
                </Text>
                <Text style={[styles.noticeText, styles.noticeTextDanger]}>
                  {payment.mobileClaim.rejectionReason ??
                    'Escríbenos desde soporte con tu constancia de pago.'}
                </Text>
              </View>
            </View>
          ) : null}

          {isCash ? (
            <View style={styles.noticeSoft}>
              <MaterialCommunityIcons name="cash" size={24} color={colors.brand700} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitleBrand}>
                  {payment?.status === 'SUCCEEDED'
                    ? 'Pago en efectivo cobrado'
                    : payment?.status === 'FAILED'
                      ? 'Pago en efectivo anulado'
                      : 'Pagas al recibir'}
                </Text>
                <Text style={styles.noticeTextBrand}>
                  {payment?.status === 'SUCCEEDED'
                    ? 'Ya registramos el cobro de este pedido.'
                    : `Ten listos ${money(order.grandTotal)} en efectivo cuando llegue tu pedido.`}
                </Text>
              </View>
            </View>
          ) : null}

          {order.cancelReason ? (
            <View style={styles.noticeDanger}>
              <MaterialCommunityIcons name="information-outline" size={24} color={colors.danger} />
              <View style={styles.noticeCopy}>
                <Text style={[styles.noticeTitle, styles.noticeTitleDanger]}>
                  Motivo de la cancelación
                </Text>
                <Text style={[styles.noticeText, styles.noticeTextDanger]}>
                  {order.cancelReason}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
            </Text>

            {/* Una comanda tiene un techo natural (las líneas de un carrito), así que
                aquí no hace falta virtualizar: no es una colección que crezca sola. */}
            {order.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemQuantity}>
                  <Text style={styles.itemQuantityText}>{item.quantity}×</Text>
                </View>

                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.productNameSnapshot}</Text>
                  {item.variantNameSnapshot ? (
                    <Text style={styles.itemVariant}>{item.variantNameSnapshot}</Text>
                  ) : null}
                  {item.customizations?.length ? (
                    <Text style={styles.itemOptions}>
                      {item.customizations
                        .map(
                          (row) =>
                            `${row.optionNameSnapshot}${row.quantity > 1 ? ` ×${row.quantity}` : ''}`,
                        )
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.itemTotal}>{money(item.lineTotal)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{isPickup ? 'Local' : 'Entrega'}</Text>

            <View style={styles.placeRow}>
              <MaterialCommunityIcons
                name={isPickup ? 'storefront-outline' : 'map-marker-outline'}
                size={22}
                color={colors.brand700}
              />
              <View style={styles.placeCopy}>
                <Text style={styles.placeTitle}>
                  {isPickup
                    ? (order.branch?.name ?? 'Misky Challay')
                    : (order.addressSnapshotJson?.line1 ?? 'Dirección de entrega')}
                </Text>
                <Text style={styles.placeText}>
                  {isPickup
                    ? (order.branch?.addressLine ?? '')
                    : [order.addressSnapshotJson?.districtName, order.addressSnapshotJson?.reference]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
              </View>
            </View>
          </View>

          {/* Bloque de totales sobre fondo de marca: usa la paleta `onDark`. Antes se
              pintaba con el gris pensado para fondo blanco y daba 1.9:1 de contraste,
              justo donde el cliente comprueba cuánto le cobraron. */}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{money(order.subtotal)}</Text>
            </View>

            {deliveryFee > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Envío</Text>
                <Text style={styles.totalValue}>{money(deliveryFee)}</Text>
              </View>
            ) : null}

            {discountTotal > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Descuentos</Text>
                <Text style={styles.totalDiscount}>− {money(discountTotal)}</Text>
              </View>
            ) : null}

            {order.discounts?.map((discount, index) => (
              <Text key={`${discount.code ?? 'promo'}-${index}`} style={styles.discountNote}>
                {discount.description}
                {discount.code ? ` (${discount.code})` : ''}
              </Text>
            ))}

            <View style={styles.totalsDivider} />

            <View style={styles.totalRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{money(order.grandTotal)}</Text>
            </View>

            <Text style={styles.taxNote}>
              Incluye IGV {money(order.taxTotal)} ·{' '}
              {order.invoiceStatus === 'ISSUED' && order.invoiceSeries && order.invoiceNumber
                ? `${order.documentType === 'FACTURA' ? 'Factura' : 'Boleta'} ${order.invoiceSeries}-${order.invoiceNumber}`
                : 'Ticket interno disponible · no es comprobante de pago'}
            </Text>
          </View>

          {invoicePdf ? (
            <PrimaryButton
              label="Abrir comprobante en PDF"
              variant="secondary"
              onPress={() => void Linking.openURL(invoicePdf)}
              style={styles.action}
            />
          ) : null}

          {invoiceXml ? (
            <PrimaryButton
              label="Descargar XML del comprobante"
              variant="ghost"
              onPress={() => void Linking.openURL(invoiceXml)}
              style={styles.actionTight}
            />
          ) : null}

          <PrimaryButton
            label="Volver a pedir"
            loading={reorderingNumber === order.orderNumber}
            onPress={() => void reorder(order.orderNumber)}
            style={styles.action}
          />

          {order.paymentPlan === 'DEPOSIT_BALANCE' && !order.balancePaidAt && order.depositPaidAt && !TERMINAL_STATUSES.includes(order.status) ? (
            <PrimaryButton
              label={`Pagar saldo · ${money(order.balanceAmount ?? 0)}`}
              loading={payingBalance}
              onPress={() => void payBalance()}
              style={styles.action}
            />
          ) : null}

          {order.status === 'DELIVERED' ? (
            <PrimaryButton
              label="Calificar lo que pediste"
              variant="secondary"
              onPress={() => router.push(REVIEWS_ROUTE)}
              style={styles.actionTight}
            />
          ) : null}

          {(resource.data?.customerSummary?.cancellation.allowed ?? CANCELLABLE_STATUSES.includes(order.status)) ? (
            <PrimaryButton
              label="Cancelar pedido"
              variant="secondary"
              loading={cancelling}
              onPress={cancel}
              style={styles.actionTight}
            />
          ) : null}

          <PrimaryButton
            label="Ayuda por WhatsApp"
            variant="ghost"
            onPress={() => void contactSupport()}
            style={styles.actionTight}
          />
          {order.whatsappOptInAt ? (
            <PrimaryButton
              label="Dejar de recibir avisos por WhatsApp"
              variant="ghost"
              loading={stoppingWhatsapp}
              onPress={() => {
                setStoppingWhatsapp(true);
                void ordersApi.stopWhatsapp(order.orderNumber)
                  .then(() => resource.refresh())
                  .then(() => toast.show({ tone: 'success', message: 'Avisos de este pedido desactivados.' }))
                  .catch((error) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos desactivar los avisos.' }))
                  .finally(() => setStoppingWhatsapp(false));
              }}
              style={styles.actionTight}
            />
          ) : null}
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

/** Silueta de la primera carga: la misma forma que tendrá el seguimiento. */
function DetailSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton width={84} height={84} rounded="lg" style={styles.skeletonCenter} />
      <Skeleton width="55%" height={16} rounded="sm" style={styles.skeletonCenter} />
      <Skeleton width="80%" height={26} rounded="sm" style={styles.skeletonCenter} />
      <Skeleton height={96} rounded="lg" style={styles.skeletonBlock} />
      <Skeleton height={150} rounded="lg" style={styles.skeletonBlock} />
      <Skeleton height={190} rounded="lg" style={styles.skeletonBlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroIcon: {
    width: 78,
    height: 78,
    borderRadius: radius.lg + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    ...type.label,
    color: colors.onDarkMuted,
    marginTop: spacing.md,
  },
  heroTitle: {
    ...type.display,
    color: colors.onDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  heroCopy: {
    ...type.body,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand600,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  etaText: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.onDark,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceDarkRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.accent600,
  },
  liveText: {
    ...type.caption,
    flex: 1,
    color: colors.onDarkMuted,
    lineHeight: 18,
  },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceDarkRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  staleText: {
    ...type.caption,
    flex: 1,
    color: colors.onDark,
    lineHeight: 18,
  },
  staleButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.brand600,
  },
  staleButtonText: {
    ...type.label,
    color: colors.onDark,
  },
  body: {
    flexGrow: 1,
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.md,
  },
  quickCell: {
    flex: 1,
    justifyContent: 'center',
  },
  quickDivider: {
    width: 1,
    backgroundColor: colors.lineSoft,
    marginHorizontal: spacing.sm,
  },
  quickLabel: {
    ...type.label,
    color: colors.inkMuted,
  },
  quickTotal: {
    ...type.heading,
    color: colors.brand700,
    marginTop: spacing.xs,
  },
  quickValue: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cardTitle: {
    ...type.heading,
    color: colors.ink,
    marginBottom: spacing.sm + spacing.xs,
  },
  bar: {
    flexDirection: 'row',
    gap: spacing.xs,
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
  barSegmentCurrent: {
    backgroundColor: colors.brand700,
  },
  barSegmentCancelled: {
    backgroundColor: colors.danger,
  },
  barLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  barStep: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  barNext: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  timeline: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingTop: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 26,
    backgroundColor: colors.line,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  timelineTitle: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  timelineDate: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  timelineComment: {
    ...type.caption,
    color: colors.inkMuted,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  muted: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  deliveryRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  deliveryIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  deliveryCopy: {
    flex: 1,
    gap: 3,
  },
  deliveryStatus: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  deliveryMeta: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  deliveryEta: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },
  noticeWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#fff6e3',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f2dcb0',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#f5eeff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e0d0f5',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#fff1f1',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f5d3d3',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeCopy: {
    flex: 1,
    gap: 3,
  },
  noticeTitle: {
    ...type.bodySm,
    fontWeight: '800',
    color: '#6b4700',
  },
  noticeTitleDanger: {
    color: '#8f2b2b',
  },
  noticeTitleBrand: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },
  noticeText: {
    ...type.caption,
    color: '#7b5c1d',
    lineHeight: 18,
  },
  noticeTextDanger: {
    color: '#9c4646',
  },
  noticeTextBrand: {
    ...type.caption,
    color: colors.brand800,
    lineHeight: 18,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  itemQuantity: {
    minWidth: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.brand50,
  },
  itemQuantityText: {
    ...type.label,
    color: colors.brand700,
  },
  itemCopy: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  itemVariant: {
    ...type.bodySm,
    color: colors.brand700,
  },
  itemOptions: {
    ...type.caption,
    color: colors.inkMuted,
    lineHeight: 17,
  },
  itemTotal: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  placeRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  placeCopy: {
    flex: 1,
    gap: 3,
  },
  placeTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  placeText: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  totals: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  totalLabel: {
    ...type.body,
    color: colors.onDarkMuted,
  },
  totalValue: {
    ...type.body,
    fontWeight: '700',
    color: colors.onDark,
  },
  totalDiscount: {
    ...type.body,
    fontWeight: '800',
    color: '#8fe3b6',
  },
  discountNote: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginBottom: spacing.sm,
  },
  totalsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.md,
  },
  grandLabel: {
    ...type.heading,
    color: colors.onDark,
  },
  grandValue: {
    ...type.title,
    color: colors.onDark,
  },
  taxNote: {
    ...type.caption,
    color: colors.onDarkMuted,
    textAlign: 'right',
  },
  action: {
    marginTop: spacing.md,
  },
  actionTight: {
    marginTop: spacing.sm,
  },
  skeleton: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  skeletonCenter: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
});
