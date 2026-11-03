import { OrderDirectPayment } from '../../src/components/OrderDirectPayment';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { env } from '../../src/config/env';
import { useResource } from '../../src/hooks/useResource';
import { useToast } from '../../src/providers/ToastProvider';
import { ApiRequestError } from '../../src/services/api/client';
import { ordersApi } from '../../src/services/api/orders.service';
import { colors, radius, spacing, type } from '../../src/theme/tokens';
import type { OrderStatus, OrderWithPayment } from '../../src/types/domain';

type OrderPayment = NonNullable<OrderWithPayment['payment']>;

/** Cada cuánto se vuelve a preguntar mientras el pago sigue sin resolverse. */
const POLL_MS = 4_000;
/** Sondear eternamente no ayuda: pasado este plazo se ofrece revisar más tarde. */
const POLL_LIMIT_MS = 120_000;

const money = (value: number | string) => `S/ ${Number(value).toFixed(2)}`;

const HOST_PATTERN = /^(https?):\/\/([^/?#]+)/i;

const hostOf = (value: string): string => HOST_PATTERN.exec(value.trim())?.[2]?.toLowerCase() ?? '';

/** Nuestros propios orígenes: el simulador de pago vive en el mismo host que la web. */
const OWN_HOSTS = [env.webUrl, env.apiUrl].map(hostOf).filter(Boolean);

/**
 * La URL de pago SOLO puede venir del backend, y aun así se comprueba antes de
 * abrirla: https siempre vale, y http únicamente contra nuestro propio host
 * (el simulador local). Cualquier otro esquema —intent://, javascript:, un
 * enlace `verdebowl://` fabricado— se descarta.
 */
const isSafeCheckoutUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  const match = HOST_PATTERN.exec(value.trim());
  if (!match) return false;
  if (match[1].toLowerCase() === 'https') return true;
  return OWN_HOSTS.includes(match[2].toLowerCase());
};

interface StatusCopy {
  eyebrow: string;
  title: string;
  copy: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
}

const STATUS_COPY: Record<OrderStatus, StatusCopy> = {
  PENDING_PAYMENT: {
    eyebrow: 'PEDIDO CREADO',
    title: 'Completa tu pago',
    copy: 'Tu pedido está reservado. Cocina lo recibe apenas se confirme el pago.',
    icon: 'credit-card-clock-outline',
    label: 'Esperando pago',
  },
  CONFIRMED: {
    eyebrow: 'PEDIDO CONFIRMADO',
    title: '¡Todo listo!',
    copy: 'Cocina ya recibió tu pedido y podrás seguir cada cambio desde la app.',
    icon: 'check-bold',
    label: 'Confirmado',
  },
  PREPARING: {
    eyebrow: 'EN COCINA',
    title: 'Lo estamos preparando',
    copy: 'Tu pedido está en la cocina. Te avisamos en cuanto salga.',
    icon: 'chef-hat',
    label: 'En preparación',
  },
  READY: {
    eyebrow: 'PEDIDO LISTO',
    title: 'Tu pedido está listo',
    copy: 'Ya puedes recogerlo o espera a que salga el repartidor.',
    icon: 'package-variant-closed',
    label: 'Listo',
  },
  OUT_FOR_DELIVERY: {
    eyebrow: 'EN CAMINO',
    title: 'Tu pedido salió',
    copy: 'El repartidor ya va hacia ti. Sigue el avance desde el seguimiento.',
    icon: 'moped-outline',
    label: 'En camino',
  },
  DELIVERED: {
    eyebrow: 'ENTREGADO',
    title: 'Que lo disfrutes',
    copy: 'Tu pedido fue entregado. Puedes calificarlo desde tus pedidos.',
    icon: 'silverware-fork-knife',
    label: 'Entregado',
  },
  CANCELLED: {
    eyebrow: 'PEDIDO CANCELADO',
    title: 'Este pedido se canceló',
    copy: 'Si ya habías pagado, la devolución se procesa a tu medio de pago.',
    icon: 'close-circle-outline',
    label: 'Cancelado',
  },
  REFUNDED: {
    eyebrow: 'PEDIDO DEVUELTO',
    title: 'Te devolvimos el importe',
    copy: 'La devolución ya está en camino a tu medio de pago.',
    icon: 'cash-refund',
    label: 'Devuelto',
  },
};

export default function CheckoutResultScreen() {
  const params = useLocalSearchParams<{ orderNumber?: string; payment?: string }>();
  const orderNumber = typeof params.orderNumber === 'string' ? params.orderNumber : '';
  /*
   * Del enlace de retorno solo se acepta el número de pedido y una PISTA de lo
   * que dijo la pasarela. El estado, el total y la URL de pago se preguntan
   * siempre al backend: antes se pintaban tal cual venían en el enlace, así que
   * un `verdebowl://` fabricado mostraba un pedido confirmado falso y un botón
   * que abría cualquier dirección.
   */
  const cancelledHint = params.payment === 'cancelado';

  const toast = useToast();
  const [polling, setPolling] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const order = useResource<OrderWithPayment>({
    key: orderNumber ? `orders:detail:${orderNumber}` : null,
    fetcher: () => ordersApi.detail(orderNumber),
    cacheMs: 0,
    pollIntervalMs: polling ? POLL_MS : 0,
  });

  const detail = order.data?.order ?? null;
  const payment = order.data?.payment ?? null;
  const status: OrderStatus | null = detail?.status ?? null;

  const statusRef = useRef(status);
  statusRef.current = status;
  const refetchRef = useRef(order.refetch);
  refetchRef.current = order.refetch;

  // El sondeo se apaga en cuanto el pedido deja de esperar el pago.
  useEffect(() => {
    if (status === null) return;
    if (status !== 'PENDING_PAYMENT') setPolling(false);
  }, [status]);

  /*
   * Volver a la pantalla reanuda el sondeo. Es el caso de quien regresa de la
   * pasarela: el webhook confirma el pago un segundo después y sin esto la
   * pantalla se quedaba en «Completa tu pago» con el pedido ya confirmado.
   */
  useFocusEffect(
    useCallback(() => {
      setPolling(
        (current) => current || statusRef.current === null || statusRef.current === 'PENDING_PAYMENT',
      );
      if (orderNumber) {
        void ordersApi.reconcilePayment(orderNumber)
          .then(() => refetchRef.current())
          .catch(() => undefined);
      }
    }, [orderNumber]),
  );

  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => setPolling(false), POLL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [polling]);

  useEffect(() => {
    if (celebrated || status === null) return;
    if (status === 'PENDING_PAYMENT' || status === 'CANCELLED' || status === 'REFUNDED') return;
    setCelebrated(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [celebrated, status]);

  const isMobilePayment = payment?.provider === 'yape' || payment?.provider === 'plin';
  const isCash = payment?.provider === 'cash';
  const waitingPayment = status === 'PENDING_PAYMENT';
  /** Yape y Plin no tienen pasarela que reabrir: los revisa Caja a mano. */
  const canResumePayment = waitingPayment && !isMobilePayment && !isCash;

  const openUrl = useCallback(
    async (url: string) => {
      const supported = await Linking.canOpenURL(url).catch(() => false);
      if (!supported) {
        toast.show({ message: 'Tu teléfono no pudo abrir la página de pago.', tone: 'error' });
        return;
      }
      await Linking.openURL(url);
    },
    [toast],
  );

  const resumePayment = useCallback(async () => {
    setResuming(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // El backend consulta el estado real antes de devolver una URL vigente.
      const retry = await ordersApi.retryPayment(orderNumber);
      if (!isSafeCheckoutUrl(retry.checkoutUrl)) {
        toast.show({
          message: 'No pudimos abrir un pago seguro. Escríbenos a soporte con tu número de pedido.',
          tone: 'error',
        });
        return;
      }
      await openUrl(retry.checkoutUrl);
      void order.refetch();
    } catch (caught) {
      /*
       * 409: otra petición está abriendo la sesión en este mismo instante. No es
       * un fallo del cliente, solo hay que dejar que aquella termine.
       */
      const racing = caught instanceof ApiRequestError && caught.status === 409;
      toast.show({
        message: racing
          ? 'Estamos abriendo tu pago. Vuelve a intentarlo en unos segundos.'
          : caught instanceof Error
            ? caught.message
            : 'No pudimos reabrir tu pago.',
        tone: racing ? 'warning' : 'error',
      });
    } finally {
      setResuming(false);
    }
  }, [openUrl, order, orderNumber, toast]);

  const copy = useMemo<StatusCopy | null>(() => {
    if (status === null) return null;
    const base = STATUS_COPY[status];

    if (status !== 'PENDING_PAYMENT') return base;

    if (isMobilePayment) {
      return {
        ...base,
        eyebrow: 'VALIDACIÓN DE CAJA',
        title: 'Recibimos tu código',
        copy: 'Caja contrasta el movimiento con la cuenta real. Cocina recibe tu pedido cuando lo apruebe.',
        icon: 'cellphone-check',
        label: 'Validando pago',
      };
    }
    if (cancelledHint) {
      return {
        ...base,
        eyebrow: 'PAGO NO COMPLETADO',
        title: 'Tu pedido sigue reservado',
        copy: 'Puedes retomar el pago ahora o cancelarlo desde su detalle para liberar la reserva.',
      };
    }
    if (!polling) {
      return {
        ...base,
        copy: 'La confirmación está tardando. Revisa tu pedido en unos segundos o retoma el pago.',
      };
    }
    return base;
  }, [cancelledHint, isMobilePayment, polling, status]);

  if (!orderNumber) {
    return (
      <ScreenScaffold tone="dark" title="Pedido" showBack={false}>
        <EmptyState
          tone="dark"
          icon="receipt-text-outline"
          title="No encontramos ese pedido"
          message="El enlace no trae un número de pedido válido. Revísalo desde tu historial."
          actionLabel="Ver mis pedidos"
          onAction={() => router.replace('/(tabs)/orders')}
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold tone="dark" showBack={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={order.refreshing}
            onRefresh={() => void order.refresh()}
            tintColor={colors.onDarkMuted}
            colors={[colors.brand600]}
          />
        }
      >
        <OrderDirectPayment payment={payment?.directPayment} onChanged={() => void order.refetch()} />
        {order.error && !detail ? (
          <EmptyState
            tone="dark"
            icon="cloud-alert-outline"
            title="No pudimos consultar tu pedido"
            message={`${order.error.message} Tu pedido ${orderNumber} sigue registrado: vuelve a intentarlo.`}
            actionLabel="Reintentar"
            onAction={() => void order.refetch()}
            secondaryLabel="Ver mis pedidos"
            onSecondary={() => router.replace('/(tabs)/orders')}
          />
        ) : !copy ? (
          <View style={styles.loading}>
            <Skeleton height={90} width={90} rounded="lg" style={styles.loadingIcon} />
            <Skeleton height={24} width="70%" rounded="sm" style={styles.loadingLine} />
            <Skeleton height={16} width="90%" rounded="sm" style={styles.loadingLine} />
            <Skeleton height={170} rounded="lg" style={styles.loadingCard} />
            <Text style={styles.checking}>
              Consultando el estado real de tu pedido {orderNumber}…
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.badge}>
              <MaterialCommunityIcons name={copy.icon} size={44} color={colors.onDark} />
            </View>

            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.lead}>{copy.copy}</Text>

            {waitingPayment && polling ? (
              <View style={styles.liveRow}>
                <MaterialCommunityIcons
                  name="progress-clock"
                  size={17}
                  color={colors.onDarkMuted}
                />
                <Text style={styles.liveText}>
                  Comprobando con el servidor; no confiamos en la pantalla del proveedor.
                </Text>
              </View>
            ) : null}

            <View style={styles.receipt}>
              <View style={styles.row}>
                <Text style={styles.label}>Pedido</Text>
                <Text style={styles.value}>{orderNumber}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Estado</Text>
                <Text style={styles.value}>{copy.label}</Text>
              </View>

              {detail ? (
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {detail.deliveryType === 'PICKUP' ? 'Recojo en' : 'Entrega'}
                  </Text>
                  <Text style={styles.value} numberOfLines={1}>
                    {detail.branch?.name ?? 'Misky Challay'}
                  </Text>
                </View>
              ) : null}

              {isCash ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Pago</Text>
                  <Text style={styles.value}>Efectivo al recibir</Text>
                </View>
              ) : null}

              <View style={styles.divider} />

              <View style={styles.row}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.total}>{money(detail?.grandTotal ?? 0)}</Text>
              </View>
            </View>

            {payment?.mobileClaim?.status === 'REJECTED' ? (
              <View style={styles.alert}>
                <MaterialCommunityIcons name="alert-outline" size={20} color={colors.accent500} />
                <Text style={styles.alertText}>
                  Caja no encontró ese movimiento
                  {payment.mobileClaim.rejectionReason
                    ? `: ${payment.mobileClaim.rejectionReason}`
                    : '.'}{' '}
                  Escríbenos desde soporte con tu constancia.
                </Text>
              </View>
            ) : null}

            {canResumePayment ? (
              <PrimaryButton
                loading={resuming}
                label="Retomar el pago seguro"
                onPress={() => void resumePayment()}
                style={styles.primaryAction}
              />
            ) : null}

            <PrimaryButton
              label="Ver el seguimiento"
              variant={canResumePayment ? 'secondary' : 'primary'}
              onPress={() =>
                router.replace({ pathname: '/order/[orderNumber]', params: { orderNumber } })
              }
              style={styles.action}
            />

            <PrimaryButton
              label="Volver al menú"
              variant="ghost"
              onPress={() => router.replace('/(tabs)/menu')}
              style={styles.ghostAction}
            />

            <View style={styles.note}>
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={19}
                color={colors.onDarkMuted}
              />
              <Text style={styles.noteText}>
                {isMobilePayment
                  ? 'Un código escrito no basta para cocinar: Caja debe encontrar el movimiento en la cuenta real.'
                  : 'Este estado sale de tu cuenta en el servidor, no del enlace por el que llegaste.'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  loading: {
    width: '100%',
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  loadingIcon: {
    alignSelf: 'center',
  },
  loadingLine: {
    width: '100%',
    marginTop: spacing.md,
  },
  loadingCard: {
    width: '100%',
    marginTop: spacing.xl,
  },
  checking: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  badge: {
    width: 90,
    height: 90,
    borderRadius: radius.lg + 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
    marginTop: spacing.md,
  },
  eyebrow: {
    ...type.label,
    color: colors.onDarkMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
  },
  title: {
    ...type.display,
    color: colors.onDark,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  lead: {
    ...type.body,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceDarkRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  liveText: {
    ...type.caption,
    flex: 1,
    color: colors.onDarkMuted,
    lineHeight: 18,
  },
  receipt: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  value: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    ...type.heading,
    color: colors.ink,
  },
  total: {
    ...type.title,
    color: colors.brand700,
  },
  alert: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: colors.surfaceDarkRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  alertText: {
    ...type.bodySm,
    flex: 1,
    color: colors.onDark,
  },
  primaryAction: {
    width: '100%',
    marginTop: spacing.lg,
    backgroundColor: colors.accent600,
    borderColor: colors.accent600,
  },
  action: {
    width: '100%',
    marginTop: spacing.sm + spacing.xs,
  },
  ghostAction: {
    width: '100%',
    marginTop: spacing.xs,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: colors.surfaceDarkRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noteText: {
    ...type.caption,
    flex: 1,
    color: colors.onDarkMuted,
    lineHeight: 18,
  },
});
