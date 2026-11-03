import { MapPin } from 'lucide-react';
import { Button } from '@components/ui/Button';
import type { DeliverySlot } from '@features/geo/types';
import { DeliverySlotCalendar } from '@features/geo/components/DeliverySlotCalendar';

interface CakeDeliveryFieldsProps {
  id: string;
  branchId: number | null;
  deliveryType: 'DELIVERY' | 'PICKUP';
  deliveryLabel?: string;
  onChooseBranch: () => void;
  slots: DeliverySlot[];
  slotId: number | null;
  onSlotChange: (id: number) => void;
  slotsLoading: boolean;
  slotsError?: string;
  minLeadHours: number;
  dateLabel?: string;
  dateError?: string;
  disabled?: boolean;
}

/** Ubicación y fecha compartidas por la compra directa y la solicitud a medida. */
export const CakeDeliveryFields = ({ id, branchId, deliveryType, deliveryLabel, onChooseBranch, slots, slotId, onSlotChange, slotsLoading, slotsError, minLeadHours, dateLabel = 'Fecha y hora de entrega', dateError, disabled = false }: CakeDeliveryFieldsProps) => {
  const selectedId = slots.some((slot) => slot.id === slotId) ? slotId : null;
  const hint = !branchId ? 'Elige una dirección o un taller para consultar los horarios.'
    : slotsLoading ? 'Buscando los horarios disponibles…'
      : !slots.length ? 'No hay horarios disponibles. Prueba otra ubicación.'
        : `Pide con al menos ${minLeadHours} horas de anticipación.`;

  return <div className="min-w-0 space-y-5">
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-field border border-line bg-surface-muted/50 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-white text-brand-700"><MapPin className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 basis-36">
        <p className="text-sm font-semibold text-ink">{branchId ? deliveryType === 'PICKUP' ? 'Recojo en taller' : 'Envío a tu dirección' : 'Lugar de entrega'}</p>
        <p className="mt-1 break-words text-xs leading-5 text-ink-muted">{branchId ? deliveryLabel || 'Taller seleccionado' : 'Elige dónde recibir tu pedido.'}</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onChooseBranch} className="w-full sm:w-auto">{branchId ? 'Cambiar ubicación' : 'Elegir ubicación'}</Button>
    </div>
    <div><p className="mb-2 text-sm font-semibold text-ink">{dateLabel}</p><DeliverySlotCalendar id={id} slots={slots} value={selectedId} disabled={disabled || !branchId || slotsLoading} onChange={onSlotChange} hint={hint} error={dateError || slotsError} /></div>
  </div>;
};
