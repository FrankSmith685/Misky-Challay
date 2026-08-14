import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, CreditCard, RefreshCw, Smartphone, Timer, Truck, XCircle } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { CheckoutStepper } from '@components/ui/CheckoutStepper';
import { PageLoader } from '@components/common/PageLoader';
import { useAppDispatch } from '@app/hooks';
import { clearCart } from '@features/cart/cartSlice';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { checkoutApi } from '../services/checkout.service';
import { forgetPendingOrder } from '../pendingOrder';
import type { OrderDetail } from '../types';

/** Tras este numero de intentos dejamos de esperar al webhook y damos salidas. */
const MAX_POLLS = 10;

/**
 * Pagina de retorno del pago.
 *
 * Llegar aqui NO significa que el pedido este pagado (RN-014): el estado real lo
 * fija el webhook. Por eso se consulta el pedido y se espera a que el backend lo
 * confirme, en vez de creerle a la URL.
 *
 * Tambien es donde aterriza quien CANCELA en la pasarela (`?pago=cancelado`). Ese
 * caso no es un error: el pedido existe y sigue reservando stock, cupon y saldo,
 * asi que hay que darle las dos salidas reales —terminar de pagar o cancelar—
 * en lugar de dejarlo mirando un "esperando al banco" que no va a llegar nunca.
 */
const CheckoutSuccessPage = () => {
  const [params] = useSearchParams();
  const dispatch = useAppDispatch();
  const orderNumber = params.get('pedido');
  const paymentCancelled = params.get('pago') === 'cancelado';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCash, setIsCash] = useState(false);
  const [isMobilePayment, setIsMobilePayment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(paymentCancelled);
  const [isCancelling, setIsCancelling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const cartCleared = useRef(false);

  useEffect(() => {
    if (!orderNumber) return;

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    /** Marca si alguna vuelta del sondeo llego a traer el pedido. */
    let loaded = false;

    setLoadError(null);

    const poll = async () => {
      try {
        const { order: fetched, payment } = await checkoutApi.getOrder(orderNumber);
        if (cancelled) return;

        loaded = true;
        setOrder(fetched);
        setCheckoutUrl(payment?.checkoutUrl ?? null);
        setIsCash(payment?.provider === 'cash');
        const localPayment = payment?.provider === 'yape' || payment?.provider === 'plin';
        setIsMobilePayment(localPayment);
        setIsLoading(false);

        if (fetched.status !== 'PENDING_PAYMENT') {
          // Ya avanzo: deja de ser un pendiente que ofrecerle en el carrito.
          forgetPendingOrder();
          if (fetched.status === 'CONFIRMED' && !cartCleared.current) {
            cartCleared.current = true;
            dispatch(clearCart());
          }
          return;
        }

        // Si volvio cancelando, no hay ningun webhook en camino: no se sondea.
        if (paymentCancelled || localPayment) return;

        attempts += 1;
        if (attempts < MAX_POLLS) {
          timer = setTimeout(poll, 1500);
        } else {
          // Se acabo la espera. Antes se quedaba en "no cierres esta pagina" para
          // siempre; ahora se le ofrece reanudar o cancelar.
          setGaveUpWaiting(true);
        }
      } catch (error) {
        if (cancelled) return;
        setIsLoading(false);
        // Este catch era mudo y dejaba la tarjeta sin ninguna rama que cumplir:
        // un recuadro en blanco justo despues de cobrarle al cliente. Si ya
        // teniamos el pedido, el fallo solo significa que dejamos de esperar al
        // webhook; si no lo tenemos, hay que decirlo y dar salidas.
        if (loaded) setGaveUpWaiting(true);
        else setLoadError(getApiErrorMessage(error));
      }
    };

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, paymentCancelled, dispatch, retryNonce]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setRetryNonce((value) => value + 1);
  }, []);

  const handleCancelOrder = useCallback(async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      await checkoutApi.cancelOrder(order.orderNumber, 'El cliente no completo el pago');
      forgetPendingOrder();
      setOrder({ ...order, status: 'CANCELLED' });
      toast.success('Pedido cancelado. Liberamos el stock, el cupón y el saldo.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  }, [order]);

  if (!orderNumber) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-ink-muted">No sabemos qué pedido estás consultando.</p>
      </div>
    );
  }

  if (isLoading) return <PageLoader />;

  /**
   * Una sola vista calculada en lugar de cuatro banderas sueltas. Antes, cuando el
   * sondeo fallaba y `order` quedaba en null, ninguna bandera se cumplia y la tarjeta
   * se pintaba sin icono, sin titulo y sin descripcion. `unreachable` es la rama por
   * defecto: sin pedido no hay nada que contar, haya mensaje de error o no.
   *
   * Solo PENDING_PAYMENT sigue "esperando"; el resto ya avanzo. Un pedido en efectivo
   * nace CONFIRMED y puede estar ya en PREPARING/READY/etc. cuando se reabre esta URL.
   */
  const view: 'unreachable' | 'refunded' | 'cancelled' | 'decision' | 'manualReview' | 'waiting' | 'confirmed' =
    order == null
      ? 'unreachable'
      : order.status === 'REFUNDED'
        ? 'refunded'
        : order.status === 'CANCELLED'
          ? 'cancelled'
          : order.status === 'PENDING_PAYMENT'
            ? isMobilePayment
              ? 'manualReview'
              : gaveUpWaiting
                ? 'decision'
                : 'waiting'
            : 'confirmed';
  const isCancelled = view === 'cancelled' || view === 'refunded';
  const isConfirmed = view === 'confirmed';

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      {/* El embudo promete tres pasos en carrito y checkout y aqui no cerraba el tercero.
          En un pedido anulado el paso ya no significa nada: seria celebrar un callejon. */}
      {!isCancelled && <CheckoutStepper current={2} className="mb-7" />}

      <Card className="text-center">
        {isConfirmed && <CheckCircle2 className="mx-auto size-12 text-brand-600" />}
        {isCancelled && <XCircle className="mx-auto size-12 text-red-500" />}
        {view === 'decision' && <Timer className="mx-auto size-12 text-amber-500" />}
        {view === 'waiting' && <Clock className="mx-auto size-12 animate-pulse text-accent-500" />}
        {view === 'manualReview' && <Smartphone className="mx-auto size-12 text-violet-600" />}
        {view === 'unreachable' && <AlertCircle className="mx-auto size-12 text-amber-500" />}

        <CardTitle className="mt-4 text-xl">
          {isConfirmed && 'Pedido confirmado'}
          {view === 'refunded' && 'Pedido reembolsado'}
          {view === 'cancelled' && 'Pedido cancelado'}
          {view === 'decision' && 'Tu pedido está esperando el pago'}
          {view === 'waiting' && 'Confirmando tu pago...'}
          {view === 'manualReview' && 'Pago enviado a validación'}
          {view === 'unreachable' && 'No pudimos consultar tu pedido ahora mismo'}
        </CardTitle>

        <CardDescription className="mt-2">
          {isConfirmed && 'Ya lo estamos preparando. Te avisaremos cuando salga.'}
          {isCancelled &&
            (order?.cancelReason ?? 'No se te cobró nada. Puedes volver a pedir cuando quieras.')}
          {view === 'decision' &&
            'No llegamos a recibir el pago, así que el pedido sigue reservado a tu nombre. Termínalo o cancélalo para liberar el stock, el cupón y el saldo que aparta.'}
          {view === 'waiting' &&
            (isCash
              ? 'Estamos confirmando tu pedido. No cierres esta página.'
              : 'Estamos esperando la confirmación del banco. No cierres esta página.')}
          {view === 'manualReview' &&
            'Caja contrastará tu código en Yape o Plin. Cocina recibirá el pedido apenas el movimiento sea aprobado; puedes cerrar esta pantalla y seguirlo desde Mis pedidos.'}
          {view === 'unreachable' &&
            (loadError ??
              'No logramos contactar con el servidor para leer el estado de tu pedido. Es un problema de conexión, no de tu compra.')}
        </CardDescription>

        {view === 'unreachable' && (
          <div className="mx-auto mt-5 max-w-sm rounded-card border border-amber-200 bg-amber-50/70 px-4 py-3 text-left">
            <p className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-muted">Tu pedido</span>
              <strong className="font-black text-ink">{orderNumber}</strong>
            </p>
            <p className="mt-1.5 text-xs leading-5 text-amber-900">
              Si te cobraron, el pedido está registrado con este número. Anótalo: con él
              puedes consultarlo o escribirnos.
            </p>
          </div>
        )}

        {isConfirmed && isCash && order && (
          <p className="mx-auto mt-4 max-w-sm rounded-card border border-brand-100 bg-brand-50/70 px-4 py-2.5 text-sm text-brand-800">
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

        {view === 'decision' ? (
          <div className="mt-6 grid gap-2">
            {checkoutUrl && (
              <Button
                size="lg"
                leftIcon={<CreditCard className="size-4" />}
                onClick={() => {
                  window.location.href = checkoutUrl;
                }}
              >
                Reanudar el pago
              </Button>
            )}
            <Button
              variant="outline"
              isLoading={isCancelling}
              onClick={() => void handleCancelOrder()}
            >
              Cancelar el pedido
            </Button>
            <Link to={ROUTES.accountOrders} className="mt-1">
              <Button variant="ghost" className="w-full">
                Ver mis pedidos
              </Button>
            </Link>
          </div>
        ) : view === 'unreachable' ? (
          <div className="mt-6 grid gap-2">
            <Button size="lg" leftIcon={<RefreshCw className="size-4" />} onClick={retry}>
              Reintentar
            </Button>
            <Button component={Link} to={ROUTES.accountOrders} variant="outline">
              Ver mis pedidos
            </Button>
          </div>
        ) : isConfirmed && order ? (
          <div className="mt-6 grid gap-2">
            {/* El numero de pedido esta en la URL: mandar a la lista generica obligaba a
                un rebote extra justo en el momento de mas ansiedad de toda la compra. */}
            <Button
              component={Link}
              to={ROUTES.accountOrderDetail(order.orderNumber)}
              size="lg"
              leftIcon={<Truck className="size-4" />}
            >
              Seguir mi pedido
            </Button>
            <div className="flex justify-center gap-3">
              <Button component={Link} to={ROUTES.accountOrders} variant="outline">
                Ver mis pedidos
              </Button>
              <Button component={Link} to={ROUTES.menu} variant="ghost">
                Volver al menú
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex justify-center gap-3">
            <Button component={Link} to={ROUTES.accountOrders} variant="outline">
              Ver mis pedidos
            </Button>
            <Button component={Link} to={ROUTES.menu} variant="ghost">
              Volver al menú
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default CheckoutSuccessPage;
