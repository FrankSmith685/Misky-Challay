import { useCallback, useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@app/hooks';
import { store } from '@app/store';
import { useAppState } from '@context/AppStateContext';
import { builderApi } from '@features/builder/services/builder.service';
import { useLiveRefresh } from '@services/realtime';
import { getApiErrorMessage } from '@services/api/client';
import { refreshItemPrice } from '../cartSlice';
import { Button } from '@components/ui/Button';
export function CartAvailabilityNotice() {
  const items = useAppSelector((state) => state.cart.items);
  const dispatch = useAppDispatch();
  const { branchId } = useAppState();
  const [messages, setMessages] = useState<string[]>([]);
  const key = JSON.stringify(
    items.map((item) => [
      item.id,
      item.productId,
      item.variantId,
      item.quantity,
      item.selections,
      item.requestedServings,
      item.theme?.version,
    ]),
  );
  const refresh = useCallback(async () => {
    const results = await Promise.all(
      items
        .filter((item) => !item.designQuoteId)
        .map(async (item) => {
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
            if (JSON.stringify(current) !== JSON.stringify(item)) return '';
            if (Math.abs(item.lineTotal - quote.lineTotal) > 0.009) {
              dispatch(
                refreshItemPrice({
                  id: item.id,
                  unitPrice: quote.basePrice,
                  extrasTotal: quote.extrasTotal,
                  lineTotal: quote.lineTotal,
                }),
              );
              return `Actualizamos el precio de ${item.name}. Revisa el total antes de continuar.`;
            }
            return '';
          } catch (error) {
            return `${item.name}: ${getApiErrorMessage(error)}. Tu diseño se conserva; revisa las opciones o reintenta.`;
          }
        }),
    );
    setMessages(results.filter(Boolean));
    // Prices are outputs, not a reason to start a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, branchId, dispatch]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useLiveRefresh(['catalog', 'inventory', 'coverage'], refresh);
  return messages.length ? (
    <div
      role="status"
      className="mb-4 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm"
    >
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      <Button size="sm" variant="ghost" onClick={() => void refresh()}>
        Comprobar de nuevo
      </Button>
    </div>
  ) : null;
}
