import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Timer, X } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Modal } from '@components/ui/Modal';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { checkoutApi } from '../services/checkout.service';
import type { OrderWithPayment } from '../types';

interface PendingOrderBannerProps {
  /** Del hook `usePendingOrder`; si es null, no hay nada que avisar. */
  pending: OrderWithPayment | null;
  onResolved: () => void;
}

/**
 * Aviso del pedido que quedo esperando pago.
 *
 * Es la pieza que faltaba: al pulsar "Pagar" el pedido YA se crea y el carrito se
 * vacia, asi que quien no terminaba en la pasarela volvia a un carrito vacio sin
 * saber que tenia un pedido vivo reteniendo su stock, su cupon y su saldo.
 *
 * Da las dos unicas salidas sensatas: terminar de pagarlo o cancelarlo (lo que
 * devuelve todo lo reservado).
 */
export const PendingOrderBanner = ({ pending, onResolved }: PendingOrderBannerProps) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (!pending) return null;

  const checkoutUrl = pending.payment?.checkoutUrl ?? null;

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await checkoutApi.cancelOrder(pending.order.orderNumber, 'El cliente no completo el pago');
      toast.success('Pedido cancelado. Liberamos el stock, el cupón y el saldo.');
      setConfirmCancel(false);
      onResolved();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <Card className="mb-5 border-amber-300 bg-amber-50/70">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-card bg-amber-500 text-white">
              <Timer className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink">Tienes un pedido sin pagar</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted sm:text-sm">
                El pedido <strong>{pending.order.orderNumber}</strong> por{' '}
                <strong>{formatCurrency(pending.order.grandTotal)}</strong> quedó reservado, pero el
                pago no se completó. Termínalo o cancélalo para liberar lo que aparta.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {checkoutUrl ? (
              <Button
                size="sm"
                leftIcon={<CreditCard className="size-4" />}
                onClick={() => {
                  window.location.href = checkoutUrl;
                }}
              >
                Reanudar pago
              </Button>
            ) : (
              <Button
                size="sm"
                component={Link}
                to={ROUTES.accountOrderDetail(pending.order.orderNumber)}
              >
                Ver el pedido
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setConfirmCancel(true)}>
              Cancelar pedido
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={confirmCancel}
        onClose={() => !isCancelling && setConfirmCancel(false)}
        title="¿Cancelar el pedido?"
        description={`Se anulará el pedido ${pending.order.orderNumber} y devolveremos el stock, el cupón y el saldo que tenía reservados.`}
        icon={X}
        eyebrow="Confirma la acción"
        maxWidth="xs"
      >
        <div className="rounded-card border border-line bg-surface-muted/60 p-4">
          <p className="text-sm font-bold text-ink">
            {pending.order.orderNumber} · {formatCurrency(pending.order.grandTotal)}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            No se te ha cobrado nada. Si prefieres pagarlo, cierra esta ventana y pulsa
            «Reanudar pago».
          </p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={isCancelling} onClick={() => setConfirmCancel(false)}>
            Volver
          </Button>
          <Button variant="danger" isLoading={isCancelling} onClick={() => void handleCancel()}>
            Sí, cancelar pedido
          </Button>
        </div>
      </Modal>
    </>
  );
};
