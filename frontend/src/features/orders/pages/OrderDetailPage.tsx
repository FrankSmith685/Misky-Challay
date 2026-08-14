import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ClipboardList,
  MapPin,
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
import { useReceiptSettings } from '@services/businessInfo';
import { ROUTES } from '@constants/routes';
import { isMissingOrder, ordersApi } from '../services/orders.service';
import { useReorder } from '../hooks/useReorder';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { OrderTracker } from '../components/OrderTracker';
import type { OrderWithPayment } from '@features/checkout/types';

const CANCELLABLE = ['PENDING_PAYMENT', 'CONFIRMED'];
// El pedido ya no cambia: se detiene el polling y el banner de "seguimiento activo".
const TERMINAL = ['DELIVERED', 'CANCELLED', 'REFUNDED'];
/** Fallos seguidos del sondeo tras los que dejamos de prometer que esto se actualiza solo. */
const STALE_AFTER_FAILURES = 2;

const OrderDetailPage = () => {
  const { orderNumber = '' } = useParams();
  const [data, setData] = useState<OrderWithPayment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** El pedido no existe o no es de este cliente: reintentar no lo va a traer. */
  const [isMissing, setIsMissing] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [pollFailures, setPollFailures] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { reorder, isReordering } = useReorder();
  const receiptSettings = useReceiptSettings();
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
    const timer = window.setInterval(() => {
      ordersApi
        .detail(orderNumber)
        .then((result) => {
          setData(result);
          setPollFailures(0);
        })
        // El sondeo no puede vaciar la pantalla, pero tampoco tragarse el fallo:
        // se cuenta para dejar de anunciar un seguimiento que no esta ocurriendo.
        .catch(() => setPollFailures((count) => count + 1));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [orderStatus, orderNumber]);

  /** Refresco a peticion del cliente: no borra la pantalla como el reintento inicial. */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await ordersApi.detail(orderNumber);
      setData(result);
      setPollFailures(0);
    } catch (error) {
      setPollFailures((count) => count + 1);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [orderNumber]);

  const handleCancel = async () => {
    if (!data) return;
    setCancelling(true);
    try {
      await ordersApi.cancel(data.order.orderNumber, 'Cancelado por el cliente');
      toast.success('Pedido cancelado');
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCancelling(false);
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
          <Button onClick={() => setRetryNonce((value) => value + 1)} leftIcon={<RefreshCw className="size-4" />}>
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
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
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

      {isTracking && (
        isStale ? (
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
            <Radio className="size-4 animate-pulse" /> Seguimiento activo · actualizamos esta pantalla automáticamente cada 15 segundos.
          </div>
        )
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Items + totales */}
        <div className="grid gap-4 lg:col-span-2">
          <Card>
            <p className="mb-3 font-semibold text-ink">Productos</p>
            <ul className="space-y-3">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {item.quantity}x {item.productNameSnapshot}
                    </p>
                    {item.descriptionSnapshot && (
                      <p className="text-xs text-ink-muted">{item.descriptionSnapshot}</p>
                    )}
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
              {order.deliveryFee > 0 && <Row label="Envio" value={formatCurrency(order.deliveryFee)} />}
              {order.discountTotal > 0 && (
                <Row label="Descuentos" value={`- ${formatCurrency(order.discountTotal)}`} accent />
              )}
              <div className="flex justify-between pt-2 text-base font-bold text-ink">
                <dt>Total</dt>
                <dd className="text-brand-700">{formatCurrency(order.grandTotal)}</dd>
              </div>
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
                <p className="rounded-field border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">El local puede imprimir un resumen interno identificado con el numero {order.orderNumber}. No es un comprobante de pago.</p>
              ) : order.invoiceStatus === 'ISSUED' && order.invoiceSeries && order.invoiceNumber ? (
                <div className="rounded-field border border-brand-200 bg-brand-50 p-3 text-sm">
                  <p className="font-extrabold text-brand-800">Emitido: {order.invoiceSeries}-{order.invoiceNumber}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-brand-700">
                    {order.invoicePdfUrl && <a href={order.invoicePdfUrl} target="_blank" rel="noreferrer" className="underline">Descargar PDF</a>}
                    {order.invoiceXmlUrl && <a href={order.invoiceXmlUrl} target="_blank" rel="noreferrer" className="underline">Descargar XML</a>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Comprobante electrónico pendiente de emisión.</p>
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

          <Card>
            <p className="mb-2 flex items-center gap-1.5 font-semibold text-ink">
              {order.deliveryType === 'DELIVERY' ? (
                <MapPin className="size-4 text-brand-600" />
              ) : (
                <Store className="size-4 text-brand-600" />
              )}
              {order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo en tienda'}
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

          {CANCELLABLE.includes(order.status) && (
            <Button variant="danger" className="w-full" isLoading={cancelling} onClick={handleCancel}>
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
