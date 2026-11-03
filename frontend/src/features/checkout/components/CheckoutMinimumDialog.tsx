import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, RefreshCw, ShoppingBag } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { QuantityStepper } from '@components/ui/QuantityStepper';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import type { CartItem } from '@/types/domain';
import type { OrderQuote } from '../types';

interface CheckoutMinimumDialogProps {
  isOpen: boolean;
  items: CartItem[];
  quote: OrderQuote | null;
  minimumOrder: number;
  isQuoting: boolean;
  quoteError: string | null;
  onQuantityChange: (id: string, quantity: number) => void;
  onRetry: () => void;
  onClose: () => void;
}

export const CheckoutMinimumDialog = ({
  isOpen,
  items,
  quote,
  minimumOrder,
  isQuoting,
  quoteError,
  onQuantityChange,
  onRetry,
  onClose,
}: CheckoutMinimumDialogProps) => {
  const ready = Boolean(quote?.meetsMinimum && !isQuoting && !quoteError);
  const missing = quote
    ? Math.max(0, Math.round((quote.minimumOrder - quote.subtotal) * 100) / 100)
    : null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Completa el pedido mínimo"
      icon={ShoppingBag}
      maxWidth="sm"
      description={`Necesitas ${formatCurrency(minimumOrder)} en productos. El costo de delivery no cuenta para este mínimo.`}
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Volver al checkout
          </Button>
          <Button type="button" disabled={!ready} onClick={onClose}>
            Continuar con mi pedido
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm leading-6 text-ink-muted">
          Puedes aumentar las cantidades aquí o elegir otros productos del catálogo. Conservaremos
          tu dirección, horario y datos del pedido.
        </p>
        <ul className="divide-y divide-line rounded-card border border-line">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-ink">{item.name}</p>
                <p className="mt-1 text-xs text-ink-muted">{item.variantName}</p>
              </div>
              {item.designQuoteId ? (
                <p className="text-xs font-semibold text-ink-muted">
                  Cantidad fijada por el diseño aprobado
                </p>
              ) : (
                <QuantityStepper
                  value={item.quantity}
                  min={1}
                  max={20}
                  size="touch"
                  disabled={isQuoting}
                  ariaLabel={item.name}
                  onChange={(quantity) => onQuantityChange(item.id, quantity)}
                  className="justify-self-start sm:justify-self-end"
                />
              )}
            </li>
          ))}
        </ul>
        {quoteError ? (
          <div
            role="alert"
            className="grid gap-2 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            <p>No pudimos actualizar el importe: {quoteError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              leftIcon={<RefreshCw className="size-4" />}
              onClick={onRetry}
            >
              Reintentar cálculo
            </Button>
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="rounded-card border border-brand-100 bg-brand-50 p-4 text-sm"
          >
            {isQuoting || !quote ? (
              <p className="text-ink-muted">Actualizando importes y disponibilidad…</p>
            ) : (
              <>
                <div className="flex flex-wrap justify-between gap-2 text-ink">
                  <span>Subtotal de productos</span>
                  <strong>{formatCurrency(quote.subtotal)}</strong>
                </div>
                <p className="mt-2 flex items-start gap-2 font-semibold text-brand-800">
                  {ready ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>
                    {ready
                      ? 'Ya alcanzaste el pedido mínimo. Revisa el nuevo total en el checkout antes de pagar.'
                      : `Te faltan ${formatCurrency(missing ?? 0)} en productos para continuar.`}
                  </span>
                </p>
              </>
            )}
          </div>
        )}
        <Button
          component={Link}
          to={ROUTES.menu}
          variant="outline"
          sx={{ whiteSpace: 'normal' }}
          leftIcon={<ShoppingBag className="size-4" />}
        >
          Elegir otros productos en el catálogo
        </Button>
      </div>
    </Modal>
  );
};
