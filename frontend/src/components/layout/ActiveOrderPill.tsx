import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconButton } from '@mui/material';
import { ChevronRight, PackageCheck, Timer, X } from 'lucide-react';
import { useAppSelector } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { DATA_CHANGED } from '@services/realtime';
import { ordersApi } from '@features/orders/services/orders.service';
import { ORDER_STATUS } from '@features/orders/components/OrderStatusBadge';
import type { OrderDetail } from '@features/checkout/types';
import { ORDER_CHANGED_EVENT } from '@features/orders/orderChanged';

/** Mismos estados que el filtro "En curso" de Mis pedidos. */
const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

/** Se guarda "pedido:estado": al avanzar el pedido, la señal vuelve aunque se haya ocultado. */
const DISMISSED_KEY = 'verde-bowl.active-order.dismissed';

/**
 * Señal persistente de pedido en marcha.
 *
 * Hasta ahora, quien ya habia pagado solo tenia el badge de la campana: habia que
 * abrir un menu para enterarse de que el pedido iba en camino. Esta barra lo dice
 * sin abrir nada y lleva al seguimiento en un toque.
 *
 * Va en el flujo del documento, no pegada: bajo el header ya viven la barra de
 * progreso del constructor y la nav de /cuenta, ambas `sticky top-16`, y una tercera
 * capa pegada las pisaria. Como cada cambio de ruta sube el scroll (RouteEffects),
 * la señal se ve igual al abrir cualquier pantalla.
 *
 * No promete tiempo de llegada: el pedido no expone ETA en su payload. Cuando el
 * pedido es programado, la hora pactada si es un dato real y se muestra.
 */
export const ActiveOrderPill = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { pathname, search } = useLocation();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) ?? '');

  useEffect(() => {
    if (!isAuthenticated) {
      setOrder(null);
      return;
    }

    let cancelled = false;
    let requestVersion = 0;
    const load = () => {
      const version = ++requestVersion;
      return ordersApi
        .active()
        .then((orders) => {
          if (cancelled || version !== requestVersion) return;
          const active = orders
            .filter((candidate) => ACTIVE_STATUSES.includes(candidate.status))
            .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
          setOrder(active[0] ?? null);
        })
        // Es una señal secundaria: si el API falla, calla. Quien informa del fallo es
        // la pantalla que el cliente abrio a proposito, no una barra de aviso.
        .catch(() => undefined);
    };

    const onOrderChanged = (event: Event) => {
      // Una consulta iniciada antes de la confirmacion no puede devolver la barra
      // al estado "sin pagar" cuando ya llego un pedido confirmado del backend.
      requestVersion += 1;
      const changed = (event as CustomEvent<OrderDetail | undefined>).detail;
      if (changed) {
        setOrder((current) => {
          if (current?.orderNumber === changed.orderNumber) {
            return ACTIVE_STATUSES.includes(changed.status) ? changed : null;
          }
          if (!ACTIVE_STATUSES.includes(changed.status)) return current;
          if (!current || new Date(changed.placedAt).getTime() > new Date(current.placedAt).getTime()) {
            return changed;
          }
          return current;
        });
      }
      void load();
    };

    window.addEventListener(DATA_CHANGED, load);
    window.addEventListener(ORDER_CHANGED_EVENT, onOrderChanged);
    void load();
    // Sondeo de respaldo para cambios hechos desde otro dispositivo o por el webhook.
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(DATA_CHANGED, load);
      window.removeEventListener(ORDER_CHANGED_EVENT, onOrderChanged);
    };
  }, [isAuthenticated, pathname]);

  if (!order) return null;

  const token = `${order.orderNumber}:${order.status}:${order.directPaymentState ?? ''}`;
  if (dismissed === token) return null;

  const detailPath = ROUTES.accountOrderDetail(order.orderNumber);
  // Estando en el propio seguimiento, la barra solo repetiria lo que ya se ve.
  if (pathname === detailPath) return null;
  if (pathname === ROUTES.checkoutSuccess && new URLSearchParams(search).get('pedido') === order.orderNumber) return null;

  const isUnpaid = order.status === 'PENDING_PAYMENT';
  const reviewing = isUnpaid && order.directPaymentState === 'REVIEW';
  const observed = isUnpaid && order.directPaymentState === 'OBSERVED';
  const statusLabel = reviewing ? 'Estamos verificando tu pago' : observed ? 'Corrige los datos del reporte' : ORDER_STATUS[order.status]?.label ?? 'En curso';
  const scheduledAt = order.serviceMode === 'SCHEDULED' ? order.scheduledAt : null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, token);
    setDismissed(token);
  };

  return (
    <aside
      aria-label="Pedido en curso"
      className={cn('border-b', isUnpaid ? 'border-amber-300 bg-amber-50' : 'border-brand-200 bg-brand-50')}
    >
      <div className="mx-auto flex w-full max-w-8xl items-center gap-2 px-4 py-2 sm:gap-3 lg:px-6">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-card text-white',
            isUnpaid ? 'bg-amber-500' : 'bg-brand-600',
          )}
        >
          {isUnpaid ? <Timer className="size-4" /> : <PackageCheck className="size-4" />}
        </span>

        <p className="min-w-0 flex-1 truncate text-xs text-ink sm:text-sm">
          <span className="font-extrabold">{reviewing ? 'Pago en revisión' : observed ? 'Corrección solicitada' : isUnpaid ? 'Pedido pendiente de pago' : 'Pedido'} {order.orderNumber}</span>
          <span className="text-ink-muted"> · {statusLabel}</span>
          {scheduledAt && (
            <span className="hidden text-ink-muted sm:inline"> · Programado: {formatDate(scheduledAt)}</span>
          )}
        </p>

        <Link
          to={detailPath}
          className={cn(
            'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-field px-2 text-xs font-bold underline-offset-2 hover:underline',
            isUnpaid ? 'text-amber-700' : 'text-brand-700',
          )}
        >
          {reviewing ? 'Ver revisión' : observed ? 'Revisar observación' : isUnpaid ? 'Retomar pago' : 'Ver seguimiento'}
          <ChevronRight className="size-3.5" />
        </Link>

        <IconButton size="small" onClick={dismiss} aria-label="Ocultar el aviso de pedido en curso">
          <X className="size-4" />
        </IconButton>
      </div>
    </aside>
  );
};
