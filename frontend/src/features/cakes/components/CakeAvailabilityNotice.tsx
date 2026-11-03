import { useEffect, useState } from 'react';
import { useAppState } from '@context/AppStateContext';
import { checkoutApi } from '@features/checkout/services/checkout.service';
import { useLiveRefresh } from '@services/realtime';
import type { CheckoutItemInput } from '@features/checkout/types';
import { getApiErrorMessage } from '@services/api/client';
import { Button } from '@components/ui/Button';
export function CakeAvailabilityNotice({ item }: { item: CheckoutItemInput | null }) {
  const { branchId, address, deliveryType, openLocationModal } = useAppState();
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify({ item, branchId, address, deliveryType });
  useLiveRefresh(['availability', 'production', 'delivery', 'coverage', 'inventory'], () =>
    setRetry((value) => value + 1),
  );
  useEffect(() => {
    let active = true;
    if (!item || !branchId || (deliveryType === 'DELIVERY' && !address)) {
      setMessage('Elige dónde recibirás tu pedido para consultar la primera fecha disponible.');
      return;
    }
    setMessage('Consultando la primera fecha disponible…');
    const timer = setTimeout(
      () =>
        void checkoutApi
          .availability({
            items: [item],
            branchId,
            deliveryType,
            serviceMode: 'ASAP',
            address: address ?? undefined,
          })
          .then((result) => {
            if (!active) return;
            setMessage(
              result.slots.length
                ? `Primera franja disponible: ${new Date(result.slots[0].startsAt).toLocaleString('es-PE')}. Confirmarás fecha y horario al comprar; esta consulta no reserva cupo.`
                : result.reasons.map((reason) => reason.message).join(' ') ||
                    'No hay franjas disponibles para esta combinación.',
            );
          })
          .catch((error) => {
            if (active) setMessage(getApiErrorMessage(error));
          }),
      450,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // key includes the complete combination and destination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  return (
    <aside
      className="mb-5 rounded-xl border border-brand-100 bg-brand-50 p-4"
      aria-label="Disponibilidad antes de personalizar"
    >
      <p role="status" className="text-sm">
        {message}
      </p>
      <Button size="sm" variant="ghost" onClick={openLocationModal}>
        Cambiar destino o taller
      </Button>
    </aside>
  );
}
