import { useCallback, useEffect, useState } from 'react';
import { checkoutApi } from './services/checkout.service';
import { forgetPendingOrder, readPendingOrder } from './pendingOrder';
import type { OrderWithPayment } from './types';

/**
 * El pedido que quedo esperando pago, ya resuelto contra el backend.
 *
 * Lo usa el aviso que ofrece reanudar o cancelar, pero tambien la PAGINA que lo
 * contiene: un carrito vacio no dice lo mismo si es que no has elegido nada que
 * si es que tus productos ya pasaron a un pedido sin pagar. Por eso vive en un
 * hook y no dentro del componente del aviso.
 */
export const usePendingOrder = () => {
  const [pending, setPending] = useState<OrderWithPayment | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const reference = readPendingOrder();
    if (!reference) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const detail = await checkoutApi.getOrder(reference.orderNumber);
        if (cancelled) return;
        // Ya avanzo (se pago, o lo cancelaron): deja de ser un pendiente.
        if (detail.order.status !== 'PENDING_PAYMENT') {
          forgetPendingOrder();
          return;
        }
        setPending(detail);
      } catch {
        // Si no se puede consultar (sesion caducada, pedido ajeno), se olvida:
        // insistir con un aviso que no lleva a ninguna parte es peor que callarse.
        forgetPendingOrder();
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    forgetPendingOrder();
    setPending(null);
  }, []);

  return { pending, isChecking, dismiss };
};
