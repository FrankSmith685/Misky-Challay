import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionHeading } from '@components/common/SectionHeading';
import { PageLoader } from '@components/common/PageLoader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Card, CardDescription } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { ordersApi } from '../services/orders.service';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import type { OrderDetail } from '@features/checkout/types';

/** RN-018: cancelar solo mientras el pedido no entro a cocina. */
const CANCELLABLE = ['PENDING_PAYMENT', 'CONFIRMED'];

const OrdersPage = () => {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(() => {
    ordersApi
      .list()
      .then(setOrders)
      .catch((error) => toast.error(getApiErrorMessage(error)))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (order: OrderDetail) => {
    setCancellingId(order.id);
    try {
      await ordersApi.cancel(order.orderNumber, 'Cancelado por el cliente');
      toast.success('Pedido cancelado');
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) return <PageLoader />;

  if (orders.length === 0) {
    return (
      <div className="py-8">
        <EmptyState
          icon={PackageOpen}
          title="Todavía no tienes pedidos"
          description="Cuando hagas tu primera compra podrás seguirla y revisar su detalle aquí."
          action={<Link to={ROUTES.menu}><Button>Ver el menú</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <SectionHeading title="Mis pedidos" description="Tu historial y el estado de cada pedido." />

      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={ROUTES.accountOrderDetail(order.orderNumber)}
                      className="font-semibold text-ink hover:text-brand-700 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <CardDescription className="mt-1">
                    {formatDate(order.placedAt)} ·{' '}
                    {order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'}
                    {order.branch ? ` · ${order.branch.name}` : ''}
                  </CardDescription>
                </div>

                <p className="font-bold text-brand-700">{formatCurrency(order.grandTotal)}</p>
              </div>

              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink-muted">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity}x {item.productNameSnapshot}
                    {item.descriptionSnapshot && item.descriptionSnapshot.includes('·') && (
                      <span className="block pl-4 text-xs">{item.descriptionSnapshot}</span>
                    )}
                  </li>
                ))}
              </ul>

              {order.discounts.length > 0 && (
                <p className="mt-2 text-xs text-brand-700">
                  {order.discounts
                    .map((discount) => `${discount.description} (-${formatCurrency(discount.amount)})`)
                    .join(' · ')}
                </p>
              )}

              {order.cancelReason && (
                <p className="mt-3 text-xs text-red-600">Motivo: {order.cancelReason}</p>
              )}

              {CANCELLABLE.includes(order.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  isLoading={cancellingId === order.id}
                  onClick={() => handleCancel(order)}
                >
                  Cancelar pedido
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OrdersPage;
