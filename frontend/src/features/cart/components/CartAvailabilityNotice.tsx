import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@app/hooks';
import { store } from '@app/store';
import { useAppState } from '@context/AppStateContext';
import { builderApi } from '@features/builder/services/builder.service';
import { useLiveRefresh } from '@services/realtime';
import { getApiErrorMessage } from '@services/api/client';
import { refreshItemPrice } from '../cartSlice';
import { Button } from '@components/ui/Button';

interface AvailabilityMessage {
  id: string;
  itemName: string;
  message: string;
}

/**
 * Verifica precios y disponibilidad sin ocultar el carrito ni reemplazar sus
 * tarjetas. La consulta es informativa: el checkout vuelve a validar todo antes
 * de crear el pedido.
 */
export function CartAvailabilityNotice() {
  const items = useAppSelector((state) => state.cart.items);
  const dispatch = useAppDispatch();
  const { branchId } = useAppState();
  const [messages, setMessages] = useState<AvailabilityMessage[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const runningRef = useRef(false);
  const refresh = useCallback(async () => {
    const itemsToCheck = items.filter((item) => !item.designQuoteId);
    if (itemsToCheck.length === 0) {
      setMessages([]);
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    const checkingTimer = window.setTimeout(() => setIsChecking(true), 250);

    try {
      const results = await Promise.all(
        itemsToCheck
          .map(async (item): Promise<AvailabilityMessage | null> => {
            try {
              const quote = await builderApi.quote({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                branchId,
                selections: item.selections.map((entry) => ({
                  optionId: entry.optionId,
                  quantity: entry.quantity,
                })),
                requestedServings: item.requestedServings,
                themeId: item.theme?.id,
                themeVersion: item.theme?.version,
              });
              const current = store.getState().cart.items.find((entry) => entry.id === item.id);
              if (JSON.stringify(current) !== JSON.stringify(item)) return null;
              if (Math.abs(item.lineTotal - quote.lineTotal) > 0.009) {
                dispatch(
                  refreshItemPrice({
                    id: item.id,
                    unitPrice: quote.basePrice,
                    extrasTotal: quote.extrasTotal,
                    lineTotal: quote.lineTotal,
                  }),
                );
                return {
                  id: item.id,
                  itemName: item.name,
                  message: 'Actualizamos el precio. Revisa el importe antes de continuar.',
                };
              }
              return null;
            } catch (error) {
              return {
                id: item.id,
                itemName: item.name,
                message: `${getApiErrorMessage(error)} Tu diseño se conserva; revisa las opciones o reintenta.`,
              };
            }
          }),
      );
      setMessages(results.filter((message): message is AvailabilityMessage => Boolean(message)));
    } finally {
      window.clearTimeout(checkingTimer);
      runningRef.current = false;
      setIsChecking(false);
    }
  }, [branchId, dispatch, items]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useLiveRefresh(['catalog', 'inventory', 'coverage'], refresh);

  if (!isChecking && messages.length === 0) return null;

  return (
    <div
      role={messages.length > 0 ? 'alert' : 'status'}
      aria-live="polite"
      className="mb-4 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <div className="flex items-start gap-2">
        {isChecking ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {isChecking ? 'Verificando precios y disponibilidad…' : 'Revisa estos productos antes de continuar'}
          </p>
          {isChecking && <p className="mt-1 text-xs leading-5 text-amber-900/80">Puedes seguir revisando tu carrito mientras terminamos la comprobación.</p>}
          <div className="mt-2 grid gap-2">
            {messages.map((message) => (
              <div key={message.id} className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-amber-200/80 bg-white/60 px-3 py-2 text-xs leading-5">
                <p><strong>{message.itemName}:</strong> {message.message}</p>
                <button
                  type="button"
                  className="font-bold text-amber-900 underline underline-offset-2"
                  onClick={() => document.getElementById(`cart-item-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >
                  Revisar producto
                </button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" disabled={isChecking} leftIcon={<RefreshCw className="size-3.5" />} onClick={() => void refresh()} className="mt-2 text-amber-950 hover:bg-amber-100">
            Comprobar de nuevo
          </Button>
        </div>
      </div>
    </div>
  );
}
