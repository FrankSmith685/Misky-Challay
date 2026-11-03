import { Check, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { formatCurrency } from '@lib/format';
import type { CakeCustomServings } from '../cakes.service';

export const CakeCustomServingsChoice = ({
  rule,
  selected,
  onSelect,
  quoteRange,
  startingPrice,
  className = '',
}: {
  rule: CakeCustomServings | null | undefined;
  selected: boolean;
  onSelect: () => void;
  quoteRange?: { min: number; max: number };
  startingPrice?: number;
  className?: string;
}) => (
  <button
    type="button"
    role={quoteRange ? undefined : 'radio'}
    aria-checked={quoteRange ? undefined : selected}
    onClick={onSelect}
    className={`cake-size-card cake-size-card--custom ${quoteRange ? 'cake-size-card--quote' : ''} ${className}`}
  >
    <span className="flex w-full items-start justify-between gap-3">
      <span className="cake-size-art">
        <SlidersHorizontal className="size-5" strokeWidth={1.5} />
      </span>
      {!quoteRange && (
        <span className="cake-choice-mark">
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
    </span>
    <span className="mt-3 block text-base font-semibold text-ink">
      {quoteRange ? 'Otras porciones' : rule?.enabled ? 'Más porciones' : 'Personalizado'}
    </span>
    {startingPrice !== undefined && (
      <span className="mt-1 block text-xs text-ink-muted">
        Desde {formatCurrency(startingPrice)} · precio según las porciones
      </span>
    )}
    <span className="mt-auto flex w-full flex-wrap items-end justify-between gap-x-2 gap-y-2 border-t border-line pt-3">
      <span>
        <span className="block text-sm font-semibold leading-6 text-ink">
          {quoteRange
            ? `${quoteRange.min}–${quoteRange.max} porciones`
            : rule?.enabled
              ? 'Elige tu cantidad'
              : 'A medida'}
        </span>
        <span className="mt-1 block text-[11px] text-ink-muted">
          {rule?.enabled ? 'Indica cuántas necesitas' : 'Tu cantidad'}
        </span>
      </span>
      <span className="inline-flex items-center gap-0.5 pb-0.5 text-[11px] font-semibold text-brand-700">
        {!quoteRange && rule?.enabled ? 'Elegir' : 'Cotizar'}
        <ChevronRight className="size-3" />
      </span>
    </span>
  </button>
);
