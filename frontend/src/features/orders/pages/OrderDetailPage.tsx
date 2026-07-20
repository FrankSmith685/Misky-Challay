import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Radio, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Card, CardDescription } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { ordersApi } from '../services/orders.service';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import type { OrderWithPayment } from '@features/checkout/types';

const CANCELLABLE = ['PENDING_PAYMENT', 'CONFIRMED'];

const OrderDetailPage = () => {
  const { orderNumber = '' } = useParams();
  const [data, setData] = useState<OrderWithPayment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const orderStatus = data?.order.status;

  const load = () => {
    ordersApi
      .detail(orderNumber)
      .then(setData)
      .catch((error) => toast.error(getApiErrorMessage(error)))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [orderNumber]);
  useEffect(() => {
    if (!orderStatus || ['DELIVERED', 'CANCELLED'].includes(orderStatus)) return undefined;
    const timer = window.setInterval(() => {
      ordersApi.detail(orderNumber).then(setData).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [orderStatus, orderNumber]);

  const handleCancel = async () => {
    if (!data) return;
    setCancelling(true);
    try {
      await ordersApi.cancel(data.order.orderNumber, 'Cancelado por el cliente');
      toast.success('Pedido cancelado');
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) return <PageLoader />;
  if (!data) {
    return (
      <div className="py-12 text-center">
        <CardDescription>No encontramos ese pedido.</CardDescription>
        <Link to={ROUTES.accountOrders}>
          <Button className="mt-4" variant="outline">
            Volver a mis pedidos
          </Button>
        </Link>
      </div>
    );
  }

  const { order } = data;

  return (
    <div>
      <Link
        to={ROUTES.accountOrders}
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-700"
      >
        <ArrowLeft className="size-4" /> Mis pedidos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-muted">{formatDate(order.placedAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      {!['DELIVERED', 'CANCELLED'].includes(order.status) && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-800">
          <Radio className="size-4 animate-pulse" /> Seguimiento activo · actualizamos esta pantalla automáticamente cada 15 segundos.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Items + totales */}
        <div className="space-y-4 lg:col-span-2">
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

            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              {order.deliveryFee > 0 && <Row label="Envio" value={formatCurrency(order.deliveryFee)} />}
              {order.discountTotal > 0 && (
                <Row label="Descuentos" value={`- ${formatCurrency(order.discountTotal)}`} accent />
              )}
              <div className="flex justify-between pt-2 text-base font-bold text-ink">
                <span>Total</span>
                <span className="text-brand-700">{formatCurrency(order.grandTotal)}</span>
              </div>
              {order.taxTotal > 0 && (
                // El IGV va incluido en el precio: se informa aparte para que este
                // detalle sirva como constancia de la operacion.
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>Incluye IGV ({Math.round((order.taxRate ?? 0.18) * 100)}%)</span>
                  <span>{formatCurrency(order.taxTotal)}</span>
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

        {/* Entrega + estado */}
        <div className="space-y-4">
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

          {order.statusHistory && order.statusHistory.length > 0 && (
            <Card>
              <p className="mb-3 font-semibold text-ink">Seguimiento</p>
              <ol className="space-y-2">
                {order.statusHistory.map((step, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <span className="size-2 rounded-full bg-brand-500" />
                    <span className="text-ink-muted">
                      {formatDate(step.createdAt)} · <OrderStatusBadge status={step.toStatus} />
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

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
    <span>{label}</span>
    <span className={accent ? 'text-brand-700' : 'text-ink'}>{value}</span>
  </div>
);

export default OrderDetailPage;
