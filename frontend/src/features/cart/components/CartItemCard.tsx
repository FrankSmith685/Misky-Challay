import { CalendarClock, Edit3, Sparkles, Trash2 } from 'lucide-react';
import { ProductMedia } from '@components/ui/ProductMedia';
import { QuantityStepper } from '@components/ui/QuantityStepper';
import { formatCurrency } from '@lib/format';
import type { CartItem } from '@/types/domain';
import { describeCakeVisualDesign } from '@features/cakes/utils/cakeVisualDesign';

interface CartItemCardProps {
  item: CartItem;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  /** Solo para lineas armadas en el constructor: las demas no tienen nada que editar. */
  onEdit?: () => void;
}

const leadTimeLabel = (hours: number) => {
  if (hours < 24) return `Requiere al menos ${hours} h de anticipación`;
  const days = Math.ceil(hours / 24);
  return `Requiere al menos ${days} ${days === 1 ? 'día' : 'días'} de anticipación`;
};

const preparationSummary = (item: CartItem) => {
  if (item.designQuoteId) return 'Diseño aprobado · precio y fecha se revisan en checkout';
  if (item.preparationMode === 'READY_STOCK') return 'Producto preparado · sujeto a existencias';
  if (item.minLeadHours && item.minLeadHours > 0) return leadTimeLabel(item.minLeadHours);
  if (item.requiresScheduledDelivery || item.preferredSlotId) return 'Preparación programada';
  return 'Preparado por encargo';
};

/** Línea de carrito responsive con imagen, personalización, cantidad y precio. */
export const CartItemCard = ({ item, onQuantityChange, onRemove, onEdit }: CartItemCardProps) => {
  const unitTotal = item.unitPrice + item.extrasTotal;
  const visibleSelections = item.selections.slice(0, 4);
  const hiddenSelections = Math.max(0, item.selections.length - visibleSelections.length);
  const canEdit = onEdit != null && item.selections.length > 0 && !item.designQuoteId;

  return (
    <article id={`cart-item-${item.id}`} className="overflow-hidden rounded-card border border-line bg-white shadow-e2 transition hover:border-brand-200">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[116px_minmax(0,1fr)_auto] sm:gap-5 sm:p-5">
        <ProductMedia
          src={item.imageUrl}
          alt={item.name}
          ratio="square"
          zoom={false}
          className="w-[88px] rounded-card ring-1 ring-line sm:w-[116px]"
        />

        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="line-clamp-2 font-extrabold leading-snug text-ink">{item.name}</h2>
              <p className="mt-1 text-xs font-semibold text-brand-700 sm:text-sm">{item.variantName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-800">
                  <CalendarClock className="size-3" /> {preparationSummary(item)}
                </span>
                {item.requestedServings != null && item.requestedServings > 0 && (
                  <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-semibold text-ink-muted">
                    {item.requestedServings} porciones
                  </span>
                )}
              </div>
            </div>
            <p className="shrink-0 font-black text-brand-800 sm:hidden">
              {formatCurrency(item.lineTotal)}
            </p>
          </div>

          {visibleSelections.length > 0 && (
            <div className="mt-3 rounded-card bg-surface-muted/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-ink-muted">
                <Sparkles className="size-3 text-brand-600" /> Personalización
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {visibleSelections.map((selection) => (
                  `${selection.quantity > 1 ? `${selection.quantity}× ` : ''}${selection.optionName}`
                )).join(' · ')}
                {hiddenSelections > 0 ? ` · +${hiddenSelections} más` : ''}
              </p>
            </div>
          )}

          {item.approvedDesignSummary && <details className="mt-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-xs leading-5 text-ink-muted"><summary className="cursor-pointer font-semibold text-brand-800">Ver diseño aprobado</summary><p className="mt-2 whitespace-pre-wrap break-words">{item.approvedDesignSummary}</p></details>}

          {(item.specialInstructions || item.referenceDataUrl || item.cakeAiProposal || item.archivedAiProposalDataUrl || item.cakeVisualDesign) && <div className="mt-3 rounded-xl border border-line bg-white p-3 text-xs leading-5 text-ink-muted">
            {item.cakeVisualDesign && <p>{describeCakeVisualDesign(item.cakeVisualDesign, Boolean(item.referenceDataUrl))}</p>}
            {item.specialInstructions && <p className="whitespace-pre-wrap break-words"><span className="font-semibold text-ink">Detalles:</span> {item.specialInstructions.replace(/^(Descripción del diseño|Indicaciones): /, '')}</p>}
            {item.referenceDataUrl && <div className="mt-2 flex items-center gap-2"><img src={item.referenceDataUrl} alt="Referencia adjunta a la torta" className="size-12 rounded-lg border border-line object-cover" /><span>Imagen de referencia adjunta</span></div>}
            {(item.cakeAiProposal || item.archivedAiProposalDataUrl) && <div className="mt-2 flex items-center gap-2"><img src={item.cakeAiProposal?.dataUrl ?? item.archivedAiProposalDataUrl} alt="Propuesta con IA adjunta a la torta" className="size-12 rounded-lg border border-line object-cover" /><span>Propuesta con IA adjunta para cocina</span></div>}
          </div>}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
            <span>{formatCurrency(unitTotal)} por unidad</span>
            {item.extrasTotal > 0 && <span>Incluye {formatCurrency(item.extrasTotal)} en extras</span>}
          </div>
        </div>

        <div className="hidden min-w-28 text-right sm:block">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-muted">Importe</p>
          <p className="mt-1 text-lg font-black text-brand-800">{formatCurrency(item.lineTotal)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted/35 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        {item.designQuoteId ? <span className="text-sm font-semibold text-ink-muted">1 unidad · diseño aprobado</span> : <QuantityStepper
          value={item.quantity}
          size="touch"
          onChange={onQuantityChange}
          ariaLabel={item.name}
        />}
        <div className="flex items-center gap-1">
          {/* Cambiar un ingrediente obligaba a borrar el bowl y rehacerlo entero. */}
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-field px-2.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              aria-label={`Editar la personalización de ${item.name}`}
            >
              <Edit3 className="size-4" /> Editar
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-field px-2.5 text-xs font-bold text-ink-muted transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            aria-label={`Quitar ${item.name} del carrito`}
          >
            <Trash2 className="size-4" /> Quitar
          </button>
        </div>
      </div>
    </article>
  );
};
