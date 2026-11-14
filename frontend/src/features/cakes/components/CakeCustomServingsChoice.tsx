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
    <span className="flex w-full items-start justify-between gap-2">
      <span className="cake-size-art">
        <SlidersHorizontal className="size-5" strokeWidth={1.5} />
      </span>
      {!quoteRange && (
        <span className="cake-choice-mark">
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
    </span>
    <span className="mt-2 block text-sm font-bold leading-5 text-ink sm:mt-3 sm:text-base">
      {quoteRange ? 'Otras porciones' : rule?.enabled ? 'Más porciones' : 'Personalizado'}
    </span>
    {startingPrice !== undefined && (
      <span className="mt-0.5 block text-[10px] leading-4 text-ink-muted sm:text-xs">
        Desde {formatCurrency(startingPrice)} · precio según las porciones
      </span>
    )}
    <span className="mt-auto block w-full border-t border-line pt-2.5 sm:pt-3">
      <span className="flex items-baseline justify-between gap-2">
        <span className="block min-w-0 text-sm font-semibold leading-5 text-ink">
          {quoteRange
            ? `${quoteRange.min}–${quoteRange.max} porciones`
            : rule?.enabled
              ? 'Elige tu cantidad'
              : 'A medida'}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-brand-700">
          {!quoteRange && rule?.enabled ? 'Elegir' : 'Cotizar'}
          <ChevronRight className="size-3" />
        </span>
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-ink-muted sm:text-[11px]">
        {rule?.enabled ? 'Indica cuántas necesitas' : 'Tu cantidad'}
      </span>
    </span>
  </button>
);
