import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Flame,
  ImageOff,
  LockKeyhole,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { QuantityStepper } from '@components/ui/QuantityStepper';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type { BuilderGroup, BuilderOption, QuoteLine } from '../types';
import { BUILDER_SCROLL_ANCHOR } from './BuilderProgress';

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
  previousLabel?: string;
  continueLabel: string;
  onBack?: () => void;
  onContinue: () => void;
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
  previousLabel,
  continueLabel,
  onBack,
  onContinue,
}: GroupStepProps) => {
  const isFull = unitsUsed >= group.maxSelection;
  const isOptional = group.minSelection === 0;
  const isDone = isOptional ? unitsUsed > 0 : unitsUsed >= group.minSelection;
  const freeLeft = Math.max(0, group.freeQuantity - unitsUsed);
  const remaining = Math.max(0, group.maxSelection - unitsUsed);
  const requiredRemaining = Math.max(0, group.minSelection - unitsUsed);
  const canContinue = requiredRemaining === 0;
  const groupImage = group.options.find((option) => option.imageUrl)?.imageUrl;
  const hasUniqueOptionImages =
    new Set(group.options.map((option) => option.imageUrl).filter(Boolean)).size > 1;

  const rule = isOptional
    ? `Opcional · hasta ${group.maxSelection}`
    : group.minSelection === group.maxSelection
      ? `Elige ${group.minSelection}`
      : `Elige de ${group.minSelection} a ${group.maxSelection}`;
  const panelId = `builder-panel-${group.id}`;

  return (
    <section
      id={`builder-group-${group.id}`}
      style={BUILDER_SCROLL_ANCHOR}
      className={cn(
        'overflow-hidden rounded-card border bg-surface shadow-e2 transition-colors',
        isDone ? 'border-brand-200' : 'border-line',
      )}
    >
      <header
        className={cn(
          'relative cursor-pointer overflow-hidden border-line bg-gradient-to-r from-surface-muted/80 to-white px-5 py-5 transition-colors hover:from-brand-50/70 hover:to-white sm:px-6',
          !isCollapsed && 'border-b',
        )}
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
              'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-card text-sm font-extrabold transition-colors',
              isDone
                ? 'bg-brand-600 text-white'
                : 'bg-white text-brand-700 shadow-sm ring-1 ring-line',
            )}
          >
            {isDone ? <Check className="size-4" strokeWidth={3} /> : index}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* El control vive DENTRO del h2 (patrón acordeón): si fuese al revés
                  el constructor se quedaría sin un solo encabezado. El ::after
                  estira el área pulsable a toda la cabecera. */}
              <h2 className="text-lg font-bold text-ink">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={panelId}
                  onClick={onExpand}
                  className="text-left after:absolute after:-inset-5 after:content-[''] sm:after:-inset-x-6"
                >
                  {group.name}
                </button>
              </h2>
              <span className="rounded-pill bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-muted ring-1 ring-line">
                {rule}
              </span>
              {group.freeQuantity > 0 && (
                <span className="rounded-pill bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                  {group.freeQuantity} incluida{group.freeQuantity === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {group.description && (
              <p className={cn('mt-1 max-w-2xl text-sm leading-6 text-ink-muted', isCollapsed && 'hidden')}>{group.description}</p>
            )}
          </div>

          <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-brand-700">
            {unitsUsed}/{group.maxSelection}
            <ChevronDown
              className={cn('size-4 transition-transform', !isCollapsed && 'rotate-180')}
              aria-hidden="true"
            />
          </span>
        </div>
      </header>

      <ul id={panelId} className={cn('gap-3 p-4 sm:grid-cols-2 sm:p-5', isCollapsed ? 'hidden' : 'grid')}>
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
                  // Los controles anidados (porciones, resolver conflicto) tienen su
                  // propio teclado: solo respondemos a las teclas dirigidas a la tarjeta.
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  // Sin esto, el espacio activa la opción Y desplaza la página.
                  event.preventDefault();
                  if (!blocked) onToggle(option);
                }}
                aria-pressed={isSelected}
                className={cn(
                  'group relative flex h-full min-h-[112px] w-full overflow-hidden rounded-card border bg-white text-left transition-all duration-200',
                  isSelected
                    ? 'border-brand-600 shadow-e2 ring-1 ring-brand-600'
                    : 'border-line hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2',
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
                      /> : <span className="grid h-full min-h-[104px] place-items-center bg-[linear-gradient(145deg,#eff8ff,#fff8ec)] text-brand-500" title="Imagen pendiente"><ImageOff className="size-5" /></span>}
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold leading-tight text-ink">{option.name}</span>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-field border transition-colors',
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
                          <span key={tag} className="rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-700">{tag}</span>
                        ))}
                        {option.allergens.length > 0 && (
                          <span title={`Alérgenos: ${option.allergens.join(', ')}`} className="inline-flex items-center gap-1 rounded-pill bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
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
                      {option.chargeAlways ? 'Suplemento' : 'Incluido según el paso'}
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
                          className={option.chargeAlways ? 'text-accent-700' : 'text-ink-muted'}
                        >
                          +{formatCurrency(option.priceDelta)}
                        </span>
                      )}
                    </span>
                  </div>
                  {isSelected && option.maxPerItem > 1 && (
                    <div className="flex items-center justify-end border-t border-line pt-2" onClick={(event) => event.stopPropagation()}>
                      {/* Mínimo 1: quitar la opción es tarea de la tarjeta, no del "−".
                          El máximo baja al valor actual cuando el paso está lleno. */}
                      <QuantityStepper
                        value={quantity}
                        min={1}
                        max={isFull ? quantity : option.maxPerItem}
                        size="touch"
                        ariaLabel={`de ${option.name}`}
                        onChange={(next) => onQuantityChange(option, next - quantity)}
                      />
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

      {!isCollapsed && (
        <footer className="border-t border-line bg-gradient-to-r from-brand-50/70 via-white to-white px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 grid size-7 shrink-0 place-items-center rounded-card',
                  canContinue
                    ? 'bg-brand-600 text-white'
                    : 'bg-amber-100 text-amber-800',
                )}
              >
                {canContinue ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  <span className="text-[11px] font-black">{requiredRemaining}</span>
                )}
              </span>
              <div>
                <p className="text-xs font-extrabold text-ink">
                  {canContinue ? 'Este paso ya está listo' : `Elige ${requiredRemaining} más para continuar`}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                  {canContinue
                    ? remaining > 0
                      ? `Puedes añadir ${remaining} opción${remaining === 1 ? '' : 'es'} más o continuar cuando quieras.`
                      : 'Llegaste al máximo permitido para esta categoría.'
                    : `Puedes seleccionar hasta ${group.maxSelection} en esta categoría.`}
                </p>
              </div>
            </div>

            <div
              className={cn(
                'grid gap-2 sm:flex sm:shrink-0',
                onBack ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              {onBack ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  leftIcon={<ArrowLeft className="size-4" />}
                >
                  <span className="sm:hidden">Anterior</span>
                  <span className="hidden sm:inline">
                    {previousLabel ? `Volver a ${previousLabel}` : 'Anterior'}
                  </span>
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
              <Button
                type="button"
                disabled={!canContinue}
                onClick={onContinue}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="sm:hidden">
                    {continueLabel === 'Revisar mi bowl' ? 'Revisar bowl' : 'Siguiente'}
                  </span>
                  <span className="hidden sm:inline">{continueLabel}</span>
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            </div>
          </div>
        </footer>
      )}
    </section>
  );
};
