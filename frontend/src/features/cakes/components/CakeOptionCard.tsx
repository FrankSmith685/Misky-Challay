import { useState } from 'react';
import { AlertTriangle, CakeSlice, Check, LockKeyhole } from 'lucide-react';
import { QuantityStepper } from '@components/ui/QuantityStepper';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type { BuilderGroup, BuilderOption } from '@features/builder/types';

interface CakeOptionCardProps {
  group: BuilderGroup;
  option: BuilderOption;
  priceMultiplier?: number;
  quantity: number;
  used: number;
  selectedIds: number[];
  selectedOptionNames: Record<number, string>;
  onToggle: () => void;
  onQuantityChange: (delta: number) => void;
  onResolveConflict: () => void;
}

export const CakeOptionCard = ({
  group,
  option,
  priceMultiplier = 1,
  quantity,
  used,
  selectedIds,
  selectedOptionNames,
  onToggle,
  onQuantityChange,
  onResolveConflict,
}: CakeOptionCardProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const selected = quantity > 0;
  const conflictOptionId = option.incompatibleWith.find((id) => selectedIds.includes(id));
  const conflict = !selected && conflictOptionId !== undefined;
  const atLimit = group.selectionType !== 'SINGLE' && !selected && used >= group.maxSelection;
  const blocked = !option.isAvailable || atLimit;
  const included =
    option.priceDelta === 0 ||
    (!option.chargeAlways && group.freeQuantity > 0 && used <= group.freeQuantity);
  const allowsQuantity =
    group.selectionType !== 'SINGLE' && Math.min(option.maxPerItem, group.maxSelection) > 1;
  const maxQuantity = Math.min(option.maxPerItem, group.maxSelection - used + quantity);

  return (
    <article
      data-selected={selected}
      className={cn(
        'cake-option-card overflow-hidden border',
        selected ? 'border-brand-700 bg-brand-50/30' : 'border-line bg-white',
        blocked && !selected && 'opacity-55',
      )}
    >
      <button
        type="button"
        data-option-id={option.id}
        aria-label={option.name}
        aria-pressed={selected}
        aria-disabled={blocked || conflict}
        disabled={blocked || conflict}
        onClick={onToggle}
        className="grid min-h-28 w-full grid-cols-[80px_minmax(0,1fr)] text-left sm:grid-cols-[88px_minmax(0,1fr)]"
      >
        <span className="relative block h-full min-h-28 overflow-hidden border-r border-line/60 bg-surface-muted">
          {option.imageUrl && !imageFailed ? (
            <img
              src={option.imageUrl}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="absolute inset-0 size-full object-cover"
              style={{ objectPosition: option.imagePosition || 'center' }}
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-brand-50 text-brand-300">
              <CakeSlice className="size-7" strokeWidth={1.2} />
            </span>
          )}
          {selected && (
            <span className="absolute left-2 top-2 grid size-5 place-items-center rounded-full bg-brand-700 text-white shadow-sm">
              <Check className="size-3" strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col p-3">
          <span className="text-sm font-semibold leading-5 text-ink">{option.name}</span>
          {option.description && (
            <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-muted">
              {option.description}
            </span>
          )}
          <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2">
            <span className="text-xs font-semibold text-brand-700">
              {!option.isAvailable
                ? 'No disponible'
                : included
                  ? 'Incluido'
                  : `+ ${formatCurrency(option.priceDelta * priceMultiplier)}`}
            </span>
            {option.allergens.length > 0 && (
              <AlertTriangle aria-label="Contiene alérgenos" className="size-3 text-amber-700" />
            )}
          </span>
        </span>
      </button>
      {conflict && (
        <div className="border-t border-line bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          <p className="flex gap-1.5">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
            No combina con {selectedOptionNames[conflictOptionId!] ?? 'tu selección'}.
          </p>
          <button
            type="button"
            disabled={!option.isAvailable}
            onClick={onResolveConflict}
            className="mt-1 font-semibold text-brand-700 underline underline-offset-2"
          >
            Reemplazar selección
          </button>
        </div>
      )}
      {selected && allowsQuantity && (
        <div className="flex items-center justify-between border-t border-line px-3 py-2">
          <span className="text-xs text-ink-muted">Cantidad</span>
          <QuantityStepper
            value={quantity}
            min={1}
            max={maxQuantity}
            size="touch"
            ariaLabel={`Cantidad de ${option.name}`}
            onChange={(next) => onQuantityChange(next - quantity)}
          />
        </div>
      )}
    </article>
  );
};
