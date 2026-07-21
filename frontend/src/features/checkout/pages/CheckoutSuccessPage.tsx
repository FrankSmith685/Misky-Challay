import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { PageLoader } from '@components/common/PageLoader';
import { useAppDispatch } from '@app/hooks';
import { clearCart } from '@features/cart/cartSlice';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { checkoutApi } from '../services/checkout.service';
import type { OrderDetail } from '../types';

/**
 * Pagina de retorno del pago.
 *
 * Llegar aqui NO significa que el pedido este pagado (RN-014): el estado real lo
 * fija el webhook. Por eso se consulta el pedido y se espera a que el backend lo
 * confirme, en vez de creerle a la URL.
 */
const CheckoutSuccessPage = () => {
  const [params] = useSearchParams();
  const dispatch = useAppDispatch();
  const orderNumber = params.get('pedido');

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isCash, setIsCash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const cartCleared = useRef(false);

  useEffect(() => {
    if (!orderNumber) return;

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      try {
        const { order: fetched, payment } = await checkoutApi.getOrder(orderNumber);
        if (cancelled) return;

        setOrder(fetched);
        setIsCash(payment?.provider === 'cash');
        setIsLoading(false);

        if (fetched.status === 'CONFIRMED' && !cartCleared.current) {
          cartCleared.current = true;
          dispatch(clearCart());
          return;
        }

        // Todavia esperando el webhook: se reintenta unos segundos.
        attempts += 1;
        if (fetched.status === 'PENDING_PAYMENT' && attempts < 10) {
          timer = setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, dispatch]);

  if (!orderNumber) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-ink-muted">No sabemos que pedido estas consultando.</p>
      </div>
    );
  }

  if (isLoading) return <PageLoader />;

  // Solo PENDING_PAYMENT sigue "esperando"; el resto ya avanzo. Un pedido en efectivo
  // nace CONFIRMED y puede estar ya en PREPARING/READY/etc. cuando se reabre esta URL.
  const isCancelled = order?.status === 'CANCELLED' || order?.status === 'REFUNDED';
  const isWaiting = order?.status === 'PENDING_PAYMENT';
  const isConfirmed = order != null && !isCancelled && !isWaiting;

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card className="text-center">
        {isConfirmed && <CheckCircle2 className="mx-auto size-12 text-brand-600" />}
        {isCancelled && <XCircle className="mx-auto size-12 text-red-500" />}
        {!isConfirmed && !isCancelled && (
          <Clock className="mx-auto size-12 animate-pulse text-accent-500" />
        )}

        <CardTitle className="mt-4 text-xl">
          {isConfirmed && 'Pedido confirmado'}
          {isCancelled && (order?.status === 'REFUNDED' ? 'Pedido reembolsado' : 'El pago no se completo')}
          {isWaiting && 'Confirmando tu pago...'}
        </CardTitle>

        <CardDescription className="mt-2">
          {isConfirmed && 'Ya lo estamos preparando. Te avisaremos cuando salga.'}
          {isCancelled && (order?.cancelReason ?? 'Puedes intentarlo de nuevo desde tu carrito.')}
          {isWaiting &&
            (isCash
              ? 'Estamos confirmando tu pedido. No cierres esta pagina.'
              : 'Estamos esperando la confirmacion del banco. No cierres esta pagina.')}
        </CardDescription>

        {isConfirmed && isCash && order && (
          <p className="mx-auto mt-4 max-w-sm rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-2.5 text-sm text-brand-800">
            Pago contra entrega: ten listos <strong>{formatCurrency(order.grandTotal)}</strong> en
            efectivo para pagar al recibir tu pedido.
          </p>
        )}

        {order && (
          <dl className="mt-6 space-y-1.5 border-t border-line pt-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Pedido</dt>
              <dd className="font-semibold">{order.orderNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Total</dt>
              <dd className="font-semibold">{formatCurrency(order.grandTotal)}</dd>
            </div>
            {order.branch && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Prepara</dt>
                <dd>{order.branch.name}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <Link to={ROUTES.accountOrders}>
            <Button variant={isConfirmed ? 'primary' : 'outline'}>Ver mis pedidos</Button>
          </Link>
          <Link to={ROUTES.menu}>
            <Button variant="ghost">Volver al menu</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default CheckoutSuccessPage;
