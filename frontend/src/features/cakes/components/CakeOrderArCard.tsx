import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, Sparkles } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import type { OrderItemDetail } from '@features/checkout/types';
import { cakePreviewApi } from '../cakePreview.service';
import { cakeArPath } from '../ar/cakeAr';

/**
 * La tarjeta AR se crea desde un pedido confirmado. Así el enlace representa
 * una combinación que ya se compró y no una cotización temporal del configurador.
 */
export function CakeOrderArCard({ orderNumber, items }: { orderNumber: string; items: OrderItemDetail[] }) {
  const navigate = useNavigate();
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const cakeItems = useMemo(
    () => items.filter((item) => {
      if (!item.productId || !item.variantId) return false;
      return Boolean(
        item.designDetailsJson ||
        item.requestedServings !== null && item.requestedServings !== undefined ||
        item.themeSnapshotJson ||
        item.designQuoteId ||
        /torta|cake|pastel/i.test(item.productNameSnapshot),
      );
    }),
    [items],
  );

  if (!cakeItems.length) return null;

  const createCard = async (item: OrderItemDetail) => {
    if (!item.productId || !item.variantId || busyItemId !== null) return;
    setBusyItemId(item.id);
    try {
      const result = await cakePreviewApi.create({
        source: item.designQuoteId ? 'DESIGN' : 'CONFIGURATOR',
        productId: item.productId,
        variantId: item.variantId,
        requestedServings: item.requestedServings ?? undefined,
        themeId: item.themeSnapshotJson?.id,
        themeVersion: item.themeSnapshotJson?.version,
        selections: (item.customizations ?? [])
          .filter((entry) => entry.optionId !== null)
          .map((entry) => ({ optionId: entry.optionId as number, quantity: entry.quantity })),
      });
      navigate(`${cakeArPath(result.token)}&pedido=${encodeURIComponent(orderNumber)}`);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <section className="rounded-card border border-brand-200 bg-brand-50/60 p-4 sm:p-5" aria-labelledby="order-ar-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="order-ar-title" className="text-sm font-extrabold text-ink">Tu tarjeta AR</h2>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Ahora que tu pedido está confirmado, crea una tarjeta para ver tu torta en realidad aumentada y compartirla.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {cakeItems.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white px-3 py-2.5">
            <p className="min-w-0 text-xs font-semibold text-ink">
              {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.productNameSnapshot}
            </p>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<QrCode className="size-4" />}
              isLoading={busyItemId === item.id}
              disabled={busyItemId !== null && busyItemId !== item.id}
              onClick={() => void createCard(item)}
            >
              Crear tarjeta AR
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-4 text-ink-muted">
        La tarjeta se genera con las opciones compradas y el enlace permanece disponible durante 7 días.
      </p>
    </section>
  );
}

