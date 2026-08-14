import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconButton } from '@mui/material';
import { ChevronRight, PackageCheck, Timer, X } from 'lucide-react';
import { useAppSelector } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { ordersApi } from '@features/orders/services/orders.service';
import { ORDER_STATUS } from '@features/orders/components/OrderStatusBadge';
import type { OrderDetail } from '@features/checkout/types';

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
  const { pathname } = useLocation();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) ?? '');

  useEffect(() => {
    if (!isAuthenticated) {
      setOrder(null);
      return;
    }

    let cancelled = false;
    const load = () =>
      ordersApi
        .list()
        .then((orders) => {
          if (cancelled) return;
          const active = orders
            .filter((candidate) => ACTIVE_STATUSES.includes(candidate.status))
            .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
          setOrder(active[0] ?? null);
        })
        // Es una señal secundaria: si el API falla, calla. Quien informa del fallo es
        // la pantalla que el cliente abrio a proposito, no una barra de aviso.
        .catch(() => undefined);

    void load();
    // Mismo pulso que la campana del header: el estado del pedido no cambia mas rapido.
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  if (!order) return null;

  const token = `${order.orderNumber}:${order.status}`;
  if (dismissed === token) return null;

  const detailPath = ROUTES.accountOrderDetail(order.orderNumber);
  // Estando en el propio seguimiento, la barra solo repetiria lo que ya se ve.
  if (pathname === detailPath) return null;

  const isUnpaid = order.status === 'PENDING_PAYMENT';
  const statusLabel = ORDER_STATUS[order.status]?.label ?? 'En curso';
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
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 sm:gap-3 lg:px-6">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-card text-white',
            isUnpaid ? 'bg-amber-500' : 'bg-brand-600',
          )}
        >
          {isUnpaid ? <Timer className="size-4" /> : <PackageCheck className="size-4" />}
        </span>

        <p className="min-w-0 flex-1 truncate text-xs text-ink sm:text-sm">
          <span className="font-extrabold">{isUnpaid ? 'Pedido sin pagar' : 'Pedido'} {order.orderNumber}</span>
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
          {isUnpaid ? 'Ver el pedido' : 'Ver seguimiento'}
          <ChevronRight className="size-3.5" />
        </Link>

        <IconButton size="small" onClick={dismiss} aria-label="Ocultar el aviso de pedido en curso">
          <X className="size-4" />
        </IconButton>
      </div>
    </aside>
  );
};
