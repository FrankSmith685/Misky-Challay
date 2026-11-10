import { RepeatDesignButton } from '../components/RepeatDesignButton';
import { OrderCustomerJourney } from '../components/OrderCustomerJourney';
import { Modal } from '@components/ui/Modal';
import { OrderFinancialSummary } from '../components/OrderFinancialSummary';
import { useLiveRefresh } from '@services/realtime';
import { OrderTermsEvidence } from '../components/OrderTermsEvidence';
import { OrderExperienceCard } from '@features/experiences/OrderExperienceCard';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ClipboardList,
  CreditCard,
  MapPin,
  MessageCircle,
  PackageSearch,
  Radio,
  RefreshCw,
  RotateCcw,
  Store,
  WifiOff,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import {
  useBusinessInfo,
  useReceiptSettings,
  useLocalPaymentSettings,
  useOnlinePaymentSettings,
} from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import { ROUTES } from '@constants/routes';
import { isMissingOrder, ordersApi } from '../services/orders.service';
import { useReorder } from '../hooks/useReorder';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { OrderTracker } from '../components/OrderTracker';
import type { OrderWithPayment } from '@features/checkout/types';
import { CakeThemeReference } from '@features/cakes/components/CakeThemeBanner';
import { OrderCakeReference } from '@features/cakes/components/OrderCakeReference';
import { CakeOrderArCard } from '@features/cakes/components/CakeOrderArCard';
import { DirectPaymentCard } from '@features/checkout/components/DirectPaymentCard';
import { directPaymentsApi } from '@features/checkout/directPayments';

const CANCELLABLE = ['PENDING_PAYMENT', 'CONFIRMED'];
// El pedido ya no cambia: se detiene el polling y el banner de "seguimiento activo".
const TERMINAL = ['DELIVERED', 'CANCELLED', 'REFUNDED'];
/** Fallos seguidos del sondeo tras los que dejamos de prometer que esto se actualiza solo. */
const STALE_AFTER_FAILURES = 2;

const OrderDetailPage = () => {
  const business = useBusinessInfo();
  const { orderNumber = '' } = useParams();
  const [data, setData] = useState<OrderWithPayment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** El pedido no existe o no es de este cliente: reintentar no lo va a traer. */
  const [isMissing, setIsMissing] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [pollFailures, setPollFailures] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [payingBalance, setPayingBalance] = useState(false);
  const [payingOrder, setPayingOrder] = useState(false);
  const [stoppingWhatsapp, setStoppingWhatsapp] = useState(false);
  const { reorder, isReordering } = useReorder();
  const receiptSettings = useReceiptSettings();
  const localPayments = useLocalPaymentSettings();
  const onlinePayments = useOnlinePaymentSettings();
  const orderStatus = data?.order.status;

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    setIsMissing(false);

    ordersApi
      .detail(orderNumber)
      .then((result) => {
        if (!active) return;
        setData(result);
        setPollFailures(0);
      })
      .catch((error) => {
        if (!active) return;
        setData(null);
        // Un 500 o un timeout no significan que el pedido no exista: decirselo al
        // cliente cuando le acaban de cobrar es la peor respuesta posible.
        if (isMissingOrder(error)) setIsMissing(true);
        else setLoadError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderNumber, retryNonce]);

  useEffect(() => {
    if (!orderStatus || TERMINAL.includes(orderStatus)) return undefined;
    let active = true;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      ordersApi
        .detail(orderNumber)
        .then((result) => {
          if (active) {
            setData(result);
            setPollFailures(0);
          }
        })
        // El sondeo no puede vaciar la pantalla, pero tampoco tragarse el fallo:
        // se cuenta para dejar de anunciar un seguimiento que no esta ocurriendo.
        .catch(() => {
          if (active) setPollFailures((count) => count + 1);
        });
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orderStatus, orderNumber]);

  /** Refresco a peticion del cliente: no borra la pantalla como el reintento inicial. */
  const refresh = useCallback(
    async (background = false) => {
      if (!background) setIsRefreshing(true);
      try {
        const result = await ordersApi.detail(orderNumber);
        setData(result);
        setPollFailures(0);
      } catch (error) {
        setPollFailures((count) => count + 1);
        if (!background) toast.error(getApiErrorMessage(error));
      } finally {
        setIsRefreshing(false);
      }
    },
    [orderNumber],
  );

  useLiveRefresh(['orders', 'payments', 'delivery', 'experiences'], () => refresh(true), {
    intervalMs: 0,
  });

  const handleCancel = async () => {
    if (!data) return;
    setCancelling(true);
    try {
      const message = await ordersApi.cancel(data.order.orderNumber, 'Cancelado por el cliente');
      toast.success(message);
      setConfirmCancel(false);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  };

  const handleBalancePayment = async () => {
    if (!data) return;
    setPayingBalance(true);
    try {
      const result = await ordersApi.payBalance(data.order.orderNumber);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setPayingBalance(false);
    }
  };

  const handleDirectBalance = async (method: 'YAPE' | 'PLIN') => {
    if (!data) return;
    setPayingBalance(true);
    try {
      await directPaymentsApi.openBalance(data.order.orderNumber, method);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setPayingBalance(false);
    }
  };

  const handleOrderPayment = async () => {
    if (!data) return;
    setPayingOrder(true);
    try {
      const result = await ordersApi.retryPayment(data.order.orderNumber);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else toast.error('No se recibio un enlace de pago');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      await refresh();
    } finally {
      setPayingOrder(false);
    }
  };

  if (isLoading) return <PageLoader />;

  if (loadError) {
    return (
      <div className="grid justify-items-center gap-4 rounded-card border border-line bg-white p-8 text-center shadow-e2 sm:p-10">
        <span className="grid size-14 place-items-center rounded-card bg-red-50 text-red-600">
          <AlertCircle className="size-7" />
        </span>
        <h1 className="text-2xl font-black text-ink">No pudimos cargar tu pedido</h1>
        <p className="max-w-md leading-7 text-ink-muted">{loadError}</p>
        <p className="max-w-md text-sm text-ink-muted">
          Tu pedido {orderNumber} sigue registrado: esto es un problema de conexión con nosotros.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => setRetryNonce((value) => value + 1)}
            leftIcon={<RefreshCw className="size-4" />}
          >
            Reintentar
          </Button>
          <Button component={Link} to={ROUTES.accountOrders} variant="outline">
            Volver a mis pedidos
          </Button>
        </div>
      </div>
    );
  }

  if (isMissing || !data) {
    return (
      <div className="grid justify-items-center gap-4 rounded-card border border-line bg-white p-8 text-center shadow-e2 sm:p-10">
        <span className="grid size-14 place-items-center rounded-card bg-surface-muted text-ink-muted">
          <PackageSearch className="size-7" />
        </span>
        <h1 className="text-2xl font-black text-ink">No encontramos ese pedido</h1>
        <p className="max-w-md leading-7 text-ink-muted">
          El número {orderNumber} no corresponde a ningún pedido de tu cuenta.
        </p>
        <Button component={Link} to={ROUTES.accountOrders} variant="outline">
          Volver a mis pedidos
        </Button>
      </div>
    );
  }

  const { order } = data;
  const isTracking = !TERMINAL.includes(order.status);
  const isStale = pollFailures >= STALE_AFTER_FAILURES;

  return (
    <div>
      <Modal
        isOpen={confirmCancel}
        onClose={() => !cancelling && setConfirmCancel(false)}
        title="¿Cancelar el pedido?"
        maxWidth="sm"
      >
        <p>
          Se anulará el pedido. Los pagos online se devolverán según el resultado del proveedor; los
          pagos manuales pueden requerir coordinación con el negocio.
        </p>
        <Button
          variant="danger"
          className="mt-4"
          isLoading={cancelling}
          onClick={() => void handleCancel()}
        >
          Confirmar cancelación
        </Button>
      </Modal>
      <PageHeader
        eyebrow="Actividad"
        title={`Pedido ${order.orderNumber}`}
        description={`Realizado el ${formatDate(order.placedAt)}`}
        icon={ClipboardList}
        crumbs={[
          { label: 'Inicio', to: '/' },
          { label: 'Mi cuenta' },
          { label: 'Pedidos', to: ROUTES.accountOrders },
          { label: order.orderNumber },
        ]}
        action={
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
            <OrderStatusBadge
              status={order.status}
              paymentState={data.payment?.directPayment?.state}
            />
            {whatsappLink(
              business.whatsappPhone ?? business.phone,
              `Hola, necesito ayuda con mi pedido ${order.orderNumber}.`,
            ) && (
              <Button
                component="a"
                href={
                  whatsappLink(
                    business.whatsappPhone ?? business.phone,
                    `Hola, necesito ayuda con mi pedido ${order.orderNumber}.`,
                  ) ?? undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                leftIcon={<MessageCircle className="size-4" />}
              >
                Consultar por WhatsApp
              </Button>
            )}
            {order.whatsappOptInAt && (
              <Button
                variant="ghost"
                isLoading={stoppingWhatsapp}
                onClick={() => {
                  setStoppingWhatsapp(true);
                  void ordersApi
                    .stopWhatsapp(order.orderNumber)
                    .then(() => {
                      setData((current) =>
                        current
                          ? { ...current, order: { ...current.order, whatsappOptInAt: null } }
                          : current,
                      );
                      toast.success('Avisos por WhatsApp desactivados para este pedido');
                    })
                    .catch((cause) => toast.error(getApiErrorMessage(cause)))
                    .finally(() => setStoppingWhatsapp(false));
                }}
              >
                Dejar de recibir avisos
              </Button>
            )}
            <Button
              variant="outline"
              leftIcon={<RotateCcw className="size-4" />}
              isLoading={isReordering}
              onClick={() => void reorder(order.orderNumber)}
            >
              Volver a pedir
            </Button>
          </div>
        }
        className="mb-0"
      />

      {isTracking &&
        (isStale ? (
          // Seguir mostrando "seguimiento activo" con el sondeo caido es mentir en la
          // pantalla en la que el cliente esta esperando su comida.
          <div className="mt-4 flex flex-col gap-3 rounded-card border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2">
              <WifiOff className="mt-0.5 size-4 shrink-0" />
              No estamos pudiendo actualizar el estado. Lo que ves puede estar desactualizado.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              isLoading={isRefreshing}
              leftIcon={<RefreshCw className="size-4" />}
              onClick={() => void refresh()}
            >
              Actualizar ahora
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-card border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-800">
            <Radio className="size-4 animate-pulse" /> Seguimiento activo · actualizamos esta
            pantalla automáticamente cada 15 segundos.
          </div>
        ))}

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
        {/* Items + totales */}
        <div className="grid min-w-0 gap-4 lg:col-span-2">
          <OrderExperienceCard orderNumber={orderNumber} />
          {![...TERMINAL, 'PENDING_PAYMENT'].includes(order.status) && (
            <CakeOrderArCard orderNumber={order.orderNumber} items={order.items} />
          )}
          {data.payment?.directPayment && (
            <DirectPaymentCard
              key={data.payment.id}
              paymentId={data.payment.id}
              initial={data.payment.directPayment}
              onChange={() => void refresh()}
            />
          )}
          {Boolean(
            data.directPayments?.some((payment) => payment.paymentId !== data.payment?.id),
          ) && (
            <details className="rounded-card border border-line bg-white p-4">
              <summary className="cursor-pointer text-sm font-bold text-brand-800">
                Pagos directos anteriores del pedido
              </summary>
              <div className="mt-4 grid gap-4">
                {data.directPayments
                  ?.filter((payment) => payment.paymentId !== data.payment?.id)
                  .map((payment) => (
                    <DirectPaymentCard
                      key={payment.paymentId}
                      paymentId={payment.paymentId}
                      initial={payment}
                      onChange={() => void refresh()}
                    />
                  ))}
              </div>
            </details>
          )}
          <Card>
            <p className="mb-3 font-semibold text-ink">Productos</p>
            <ul className="space-y-3">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {item.quantity}x {item.productNameSnapshot}
                    </p>
                    {item.descriptionSnapshot && (
                      <p className="whitespace-pre-wrap break-words text-xs text-ink-muted">
                        {item.descriptionSnapshot}
                      </p>
                    )}
                    {item.themeSnapshotJson && (
                      <CakeThemeReference theme={item.themeSnapshotJson} />
                    )}
                    {item.designQuoteId && (
                      <div className="mt-3">
                        <RepeatDesignButton quoteId={item.designQuoteId} />
                      </div>
                    )}
                    {item.specialInstructions && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-ink">
                        {item.specialInstructions}
                      </p>
                    )}
                    <OrderCakeReference
                      orderNumber={order.orderNumber}
                      itemId={item.id}
                      images={item.designImages}
                      hasReference={Boolean(item.reference)}
                    />
                  </div>
                  <p className="shrink-0 text-sm font-medium text-ink">
                    {formatCurrency(item.lineTotal)}
                  </p>
                </li>
              ))}
            </ul>

            {/* Cada importe es un par termino/definicion: asi el lector de pantalla
                lee "Subtotal, S/ 48.00" y no dos textos sueltos seguidos. */}
            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              {order.deliveryFee > 0 && (
                <>
                  <Row label="Delivery" value={formatCurrency(order.deliveryFee)} />
                  {order.cakeDeliveryFee && order.cakeDeliveryFee > 0 && (
                    <p className="text-xs text-ink-muted">Incluye {formatCurrency(order.cakeDeliveryFee)} por manejo especial de torta.</p>
                  )}
                </>
              )}
              {order.discountTotal > 0 && (
                <Row label="Descuentos" value={`- ${formatCurrency(order.discountTotal)}`} accent />
              )}
              <div className="flex justify-between pt-2 text-base font-bold text-ink">
                <dt>Total</dt>
                <dd className="text-brand-700">{formatCurrency(order.grandTotal)}</dd>
              </div>
              {order.paymentPlan === 'DEPOSIT_BALANCE' && (
                <div className="rounded-field border border-brand-200 bg-brand-50 p-3 text-sm">
                  <p className="font-bold text-brand-900">Anticipo y saldo</p>
                  <p className="mt-1 text-ink-muted">
                    Anticipo: {formatCurrency(order.depositAmount ?? 0)} · saldo:{' '}
                    {formatCurrency(order.balanceAmount ?? 0)}
                  </p>
                  {order.balancePaidAt ? (
                    <p className="mt-2 font-bold text-brand-800">Saldo pagado</p>
                  ) : (
                    order.depositPaidAt &&
                    !TERMINAL.includes(order.status) &&
                    !(
                      data.payment?.stage === 'BALANCE' &&
                      ['AWAITING_PAYMENT', 'REVIEW', 'OBSERVED'].includes(
                        data.payment.directPayment?.state ?? '',
                      )
                    ) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {onlinePayments.onlineEnabled && (
                          <Button
                            size="sm"
                            isLoading={payingBalance}
                            onClick={() => void handleBalancePayment()}
                          >
                            Pagar saldo en línea
                          </Button>
                        )}
                        {localPayments.yapeEnabled && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={payingBalance}
                            onClick={() => void handleDirectBalance('YAPE')}
                          >
                            Saldo con Yape
                          </Button>
                        )}
                        {localPayments.plinEnabled && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={payingBalance}
                            onClick={() => void handleDirectBalance('PLIN')}
                          >
                            Saldo con Plin
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
              {order.taxTotal > 0 && (
                // El IGV va incluido en el precio: se informa aparte para que este
                // detalle sirva como constancia de la operacion.
                <div className="flex justify-between text-xs text-ink-muted">
                  <dt>Incluye IGV ({Math.round((order.taxRate ?? 0.18) * 100)}%)</dt>
                  <dd>{formatCurrency(order.taxTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between text-xs text-ink-muted">
                <dt>{receiptSettings.mode === 'INTERNAL_ONLY' ? 'Documento' : 'Comprobante'}</dt>
                <dd>
                  {receiptSettings.mode === 'INTERNAL_ONLY'
                    ? 'Ticket interno · no fiscal'
                    : order.documentType === 'FACTURA'
                      ? `Factura · RUC ${order.billingDocNumber ?? ''}`
                      : 'Boleta'}
                </dd>
              </div>
              {receiptSettings.mode === 'INTERNAL_ONLY' ? (
                <p className="rounded-field border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">
                  El local puede imprimir un resumen interno identificado con el numero{' '}
                  {order.orderNumber}. No es un comprobante de pago.
                </p>
              ) : order.invoiceStatus === 'ISSUED' && order.invoiceSeries && order.invoiceNumber ? (
                <div className="rounded-field border border-brand-200 bg-brand-50 p-3 text-sm">
                  <p className="font-extrabold text-brand-800">
                    Emitido: {order.invoiceSeries}-{order.invoiceNumber}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-brand-700">
                    {order.invoicePdfUrl && (
                      <a
                        href={order.invoicePdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Descargar PDF
                      </a>
                    )}
                    {order.invoiceXmlUrl && (
                      <a
                        href={order.invoiceXmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Descargar XML
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">
                  Comprobante electrónico pendiente de emisión.
                </p>
              )}
              {data.payment?.provider === 'cash' && (
                <div className="flex justify-between border-t border-line pt-2 text-sm">
                  <dt className="text-ink-muted">Pago contra entrega</dt>
                  {data.payment.status === 'SUCCEEDED' ? (
                    <dd className="font-medium text-brand-700">Cobrado</dd>
                  ) : data.payment.status === 'FAILED' ? (
                    <dd className="font-medium text-ink-muted">Anulado</dd>
                  ) : (
                    <dd className="font-medium text-accent-600">Pagas al recibir</dd>
                  )}
                </div>
              )}
            </dl>
          </Card>

          <OrderTermsEvidence acceptance={order.termsAcceptanceJson} />

          {order.cancelReason && (
            <Card className="border-red-200 bg-red-50">
              <p className="text-sm text-red-700">Motivo de cancelacion: {order.cancelReason}</p>
            </Card>
          )}
        </div>

        {/* Entrega + estado. En una sola columna va PRIMERO: esta pantalla se abre
            desde el movil para ver por donde va el pedido, no para releer el ticket. */}
        <div className="order-first grid gap-4 lg:order-0">
          <Card>
            <p className="mb-3 font-semibold text-ink">Seguimiento</p>
            <OrderTracker order={order} />
          </Card>

          {order.status === 'PENDING_PAYMENT' &&
            ['mercadopago', 'stripe', 'mock'].includes(data.payment?.provider ?? '') && (
              <Button
                className="w-full"
                isLoading={payingOrder}
                leftIcon={<CreditCard className="size-4" />}
                onClick={() => void handleOrderPayment()}
              >
                Pagar pedido
              </Button>
            )}

          <Card>
            <p className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
              {order.deliveryType === 'DELIVERY' ? (
                <MapPin className="size-4 text-brand-600" />
              ) : (
                <Store className="size-4 text-brand-600" />
              )}
              {order.deliveryType === 'DELIVERY'
                ? order.deliveryVehicleType === 'CAR'
                  ? 'Entrega en auto'
                  : 'Delivery'
                : 'Recojo en taller'}
            </p>
            {order.deliveryType === 'DELIVERY' && order.addressSnapshotJson ? (
              <p className="text-sm text-ink-muted">
                {order.addressSnapshotJson.line1}
                {order.addressSnapshotJson.districtName
                  ? `, ${order.addressSnapshotJson.districtName}`
                  : ''}
              </p>
            ) : (
              order.branch && (
                <p className="text-sm text-ink-muted">
                  {order.branch.name} · {order.branch.addressLine}
                </p>
              )
            )}
          </Card>

          <OrderFinancialSummary summary={data.customerSummary} />
          <OrderCustomerJourney order={order} onChanged={() => void refresh(true)} />
          {data.customerSummary?.cancellation.reason && (
            <p className="text-xs text-ink-muted">{data.customerSummary.cancellation.reason}</p>
          )}
          {(data.customerSummary?.cancellation.allowed ?? CANCELLABLE.includes(order.status)) && (
            <Button
              variant="danger"
              className="w-full"
              isLoading={cancelling}
              onClick={() => setConfirmCancel(true)}
            >
              Cancelar pedido
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex justify-between text-ink-muted">
    <dt>{label}</dt>
    <dd className={accent ? 'text-brand-700' : 'text-ink'}>{value}</dd>
  </div>
);

export default OrderDetailPage;
