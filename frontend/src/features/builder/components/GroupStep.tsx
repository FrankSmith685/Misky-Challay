import { Check, CircleAlert, Flame, ImageOff, LockKeyhole, Minus, Plus, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type { BuilderGroup, BuilderOption, QuoteLine } from '../types';

interface GroupStepProps {
  group: BuilderGroup;
  index: number;
  selectedIds: number[];
  unitsUsed: number;
  quoteLines: QuoteLine[];
  onToggle: (option: BuilderOption) => void;
  onQuantityChange: (option: BuilderOption, delta: number) => void;
  onResolveConflict: (option: BuilderOption) => void;
  selectedOptionNames: Record<number, string>;
  isCollapsed?: boolean;
  onExpand?: () => void;
}

/** Paso visual del constructor: reglas, disponibilidad y costo entendibles de un vistazo. */
export const GroupStep = ({
  group,
  index,
  selectedIds,
  unitsUsed,
  quoteLines,
  onToggle,
  onQuantityChange,
  onResolveConflict,
  selectedOptionNames,
  isCollapsed = false,
  onExpand,
}: GroupStepProps) => {
  const isFull = unitsUsed >= group.maxSelection;
  const isOptional = group.minSelection === 0;
  const isDone = isOptional ? unitsUsed > 0 : unitsUsed >= group.minSelection;
  const freeLeft = Math.max(0, group.freeQuantity - unitsUsed);
  const groupImage = group.options.find((option) => option.imageUrl)?.imageUrl;
  const hasUniqueOptionImages =
    new Set(group.options.map((option) => option.imageUrl).filter(Boolean)).size > 1;

  const rule = isOptional
    ? `Opcional · hasta ${group.maxSelection}`
    : group.minSelection === group.maxSelection
      ? `Elige ${group.minSelection}`
      : `Elige de ${group.minSelection} a ${group.maxSelection}`;

  return (
    <section
      id={`builder-group-${group.id}`}
      className={cn(
        'scroll-mt-28 overflow-hidden rounded-[24px] border bg-surface shadow-[0_12px_36px_rgba(25,70,48,0.06)] transition-colors',
        isDone ? 'border-brand-200' : 'border-line',
      )}
    >
      <header
        role={isCollapsed ? 'button' : undefined}
        tabIndex={isCollapsed ? 0 : undefined}
        aria-expanded={!isCollapsed}
        className="relative cursor-pointer overflow-hidden border-b border-line bg-surface-muted/60 px-5 py-5 sm:cursor-default sm:px-6"
        onClick={onExpand}
        onKeyDown={(event) => {
          if (isCollapsed && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onExpand?.();
          }
        }}
      >
        {groupImage && (
          <img
            src={groupImage}
            alt=""
            aria-hidden="true"
            width={384}
            height={160}
            className="absolute inset-y-0 right-0 hidden h-full w-48 object-cover opacity-20 [mask-image:linear-gradient(to_left,black,transparent)] sm:block"
          />
        )}

        <div className="relative flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold transition-colors',
              isDone
                ? 'bg-brand-600 text-white'
                : 'bg-white text-brand-700 shadow-sm ring-1 ring-line',
            )}
          >
            {isDone ? <Check className="size-4" strokeWidth={3} /> : index}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">{group.name}</h2>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-muted ring-1 ring-line">
                {rule}
              </span>
              {group.freeQuantity > 0 && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                  {group.freeQuantity} incluida{group.freeQuantity === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {group.description && (
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">{group.description}</p>
            )}
          </div>

          <span className="shrink-0 text-sm font-bold text-brand-700">
            {unitsUsed}/{group.maxSelection}
          </span>
        </div>
      </header>

      <ul className={cn('gap-3 p-4 sm:grid sm:grid-cols-2 sm:p-5', isCollapsed ? 'hidden sm:grid' : 'grid')}>
        {group.options.map((option, optionIndex) => {
          const isSelected = selectedIds.includes(option.id);
          const blockedByConflict =
            !isSelected && option.incompatibleWith.some((id) => selectedIds.includes(id));
          const blocked = !option.isAvailable || blockedByConflict || (isFull && !isSelected);
          const quantity = quoteLines.find((line) => line.optionId === option.id)?.quantity ?? (isSelected ? 1 : 0);
          const conflict = option.incompatibilities.find((entry) => selectedIds.includes(entry.optionId));
          const showsAsFree = !option.chargeAlways && freeLeft > 0;
          const quoteLine = quoteLines.find((line) => line.optionId === option.id);
          const selectedIsIncluded = quoteLine
            ? quoteLine.chargedQuantity === 0
            : !option.chargeAlways && unitsUsed <= group.freeQuantity;

          return (
            <li key={option.id}>
              <div
                data-group-id={group.id}
                data-option-id={option.id}
                role="button"
                tabIndex={blocked && !blockedByConflict ? -1 : 0}
                aria-disabled={blocked && !blockedByConflict}
                onClick={() => {
                  if (blockedByConflict) return;
                  if (!blocked) onToggle(option);
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !blocked) onToggle(option);
                }}
                aria-pressed={isSelected}
                className={cn(
                  'group relative flex h-full min-h-[104px] w-full overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200',
                  isSelected
                    ? 'border-brand-600 shadow-[0_8px_24px_rgba(35,124,82,0.16)] ring-1 ring-brand-600'
                    : 'border-line hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg',
                  blocked && !blockedByConflict &&
                    'cursor-not-allowed opacity-45 hover:translate-y-0 hover:border-line hover:shadow-none',
                  blockedByConflict && 'border-amber-200 bg-amber-50/35',
                )}
              >
                {hasUniqueOptionImages && (
                  <div className="w-[96px] shrink-0 overflow-hidden bg-surface-muted">
                    {option.imageUrl ? <img
                        src={option.imageUrl}
                        alt={option.imageAlt ?? option.name}
                        loading="lazy"
                        width={192}
                        height={208}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        style={{ objectPosition: option.imagePosition || `${15 + ((optionIndex * 23) % 70)}% 50%` }}
                      /> : <span className="grid h-full min-h-[104px] place-items-center bg-[linear-gradient(145deg,#edf9f2,#fff8ec)] text-brand-500" title="Imagen pendiente"><ImageOff className="size-5" /></span>}
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold leading-tight text-ink">{option.name}</span>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                          isSelected ? 'border-brand-600 bg-brand-600' : 'border-line bg-white',
                        )}
                      >
                        {isSelected && <Check className="size-3 text-white" strokeWidth={3} />}
                      </span>
                    </div>
                    {option.description && (
                      <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-ink-muted">
                        {option.description}
                      </span>
                    )}
                    {(option.dietaryTags.length > 0 || option.allergens.length > 0 || option.spiceLevel > 0) && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {option.dietaryTags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-700">{tag}</span>
                        ))}
                        {option.allergens.length > 0 && (
                          <span title={`Alérgenos: ${option.allergens.join(', ')}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            <ShieldAlert className="size-3" /> Alérgenos
                          </span>
                        )}
                        {option.spiceLevel > 0 && (
                          <span title={`Picante nivel ${option.spiceLevel} de 3`} className="inline-flex items-center text-orange-600">
                            {Array.from({ length: option.spiceLevel }, (_, level) => <Flame key={level} className="size-3" />)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex items-end justify-between gap-2 text-[11px]">
                    <span className="text-ink-muted">
                      {Math.round(option.nutrition.calories)} kcal
                    </span>
                    <span className="font-bold">
                      {!option.isAvailable ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <CircleAlert className="size-3" /> Agotado
                        </span>
                      ) : blockedByConflict ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <LockKeyhole className="size-3" /> No combina
                        </span>
                      ) : option.priceDelta === 0 ||
                        (isSelected ? selectedIsIncluded : showsAsFree) ? (
                        <span className="text-brand-700">Incluido</span>
                      ) : (
                        <span
                          className={option.chargeAlways ? 'text-accent-500' : 'text-ink-muted'}
                        >
                          +{formatCurrency(option.priceDelta)}
                        </span>
                      )}
                    </span>
                  </div>
                  {isSelected && option.maxPerItem > 1 && (
                    <div className="flex items-center justify-end gap-1 border-t border-line pt-2" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => onQuantityChange(option, -1)} aria-label={`Quitar una porción de ${option.name}`} className="flex size-7 items-center justify-center rounded-full border border-line bg-white hover:border-brand-400"><Minus className="size-3" /></button>
                      <span className="min-w-7 text-center text-xs font-bold">{quantity}</span>
                      <button type="button" disabled={quantity >= option.maxPerItem || isFull} onClick={() => onQuantityChange(option, 1)} aria-label={`Agregar una porción de ${option.name}`} className="flex size-7 items-center justify-center rounded-full border border-line bg-white hover:border-brand-400 disabled:opacity-40"><Plus className="size-3" /></button>
                    </div>
                  )}
                  {blockedByConflict && conflict && (
                    <div className="border-t border-amber-200 pt-2 text-[11px] text-amber-900" onClick={(event) => event.stopPropagation()}>
                      <p>{conflict.reason ?? `No combina con ${selectedOptionNames[conflict.optionId] ?? 'tu selección actual'}.`}</p>
                      <button type="button" onClick={() => onResolveConflict(option)} className="mt-1 font-bold text-brand-700 underline underline-offset-2">Reemplazar {selectedOptionNames[conflict.optionId] ?? 'ingrediente'} por {option.name}</button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
