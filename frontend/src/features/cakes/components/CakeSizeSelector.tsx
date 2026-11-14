import { Check, Package } from 'lucide-react';
import { Input } from '@components/ui/Input';
import { formatCurrency } from '@lib/format';
import type { ProductDetail } from '@features/catalog/types';
import type { CakeCustomServings, CakeSizeGuide } from '../cakes.service';
import { CakeCustomServingsChoice } from './CakeCustomServingsChoice';
import { CakeSizeIllustration } from './CakeSizeIllustration';

export const cakeSizeName = (name: string) =>
  name.replace(/\s*[·–-]\s*\d+\s*porciones.*$/i, '').trim();

export const CakeSizeSelector = ({
  variants,
  variantId,
  rule,
  sizeGuides,
  quoteRange,
  customSelected,
  customServings,
  customValid,
  onVariantChange,
  onCustomSelect,
  onServingsChange,
  onRequestQuote,
  isCake = true,
}: {
  isCake?: boolean;
  variants: ProductDetail['variants'];
  variantId: number | null;
  rule?: CakeCustomServings | null;
  sizeGuides?: CakeSizeGuide[];
  quoteRange?: { min: number; max: number };
  customSelected: boolean;
  customServings: string;
  customValid: boolean;
  onVariantChange: (id: number) => void;
  onCustomSelect: () => void;
  onServingsChange: (value: string) => void;
  onRequestQuote: () => void;
}) => {
  const customBase = variants.find((variant) => variant.id === rule?.baseVariantId);
  const startingPrice =
    rule?.enabled && customBase?.servingSize
      ? customBase.basePrice +
        (rule.minServings - Number(customBase.servingSize)) * rule.pricePerExtraServing
      : undefined;
  const count = Number(customServings);
  const servingsError =
    customSelected && !customValid && rule?.enabled
      ? !customServings.trim()
        ? 'Ingresa cuántas porciones necesitas.'
        : count > rule.maxServings
          ? `El límite es de ${rule.maxServings} porciones. Reduce la cantidad para continuar.`
          : !Number.isSafeInteger(count)
            ? 'Ingresa un número entero de porciones.'
            : `Ingresa al menos ${rule.minServings} porciones para esta opción.`
      : undefined;
  return (
    <>
      <div
        className="grid grid-cols-2 gap-3 sm:gap-4"
        role="radiogroup"
        aria-label={isCake ? 'Tamaño de la torta' : 'Presentación del producto'}
      >
        {variants.map((variant, index) => {
          const selected = !customSelected && variantId === variant.id;
          const guide = sizeGuides?.find((entry) => entry.variantId === variant.id);
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onVariantChange(variant.id)}
              className="cake-size-card"
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="cake-size-art">
                  {isCake ? (
                    <CakeSizeIllustration
                      size={
                        variants.length === 1
                          ? 'medium'
                          : index === 0
                            ? 'small'
                            : index === variants.length - 1
                              ? 'large'
                              : 'medium'
                      }
                    />
                  ) : (
                    <Package className="size-6" strokeWidth={1.5} />
                  )}
                </span>
                <span className="cake-choice-mark">
                  {selected && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </span>
              <span className="mt-2 block text-sm font-bold leading-5 text-ink sm:mt-3 sm:text-base">
                {guide
                  ? `${guide.diameterCm} cm`
                  : isCake
                    ? cakeSizeName(variant.name)
                    : variant.name}
              </span>
              {guide && (
                <span className="mt-0.5 block text-[10px] leading-4 text-ink-muted sm:text-[11px]">
                  {cakeSizeName(variant.name)}
                </span>
              )}
              <span className="mt-auto w-full border-t border-line pt-2.5 sm:pt-3">
                <span className="flex items-baseline gap-1">
                  <span className="cake-size-value cake-price text-[22px] font-semibold leading-none text-ink sm:text-2xl">
                    {guide
                      ? `${guide.minServings}–${guide.maxServings}`
                      : variant.servingSize || '—'}
                  </span>
                  <span className="text-[10px] text-ink-muted sm:text-[11px]">
                    {variant.servingUnit ?? 'porciones'}
                  </span>
                </span>
                <span className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-ink-muted">Desde</span>
                  <span className="cake-size-price cake-price text-sm font-bold whitespace-nowrap text-ink">
                    {formatCurrency(variant.basePrice)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
        {rule && (
          <CakeCustomServingsChoice
            rule={rule}
            selected={customSelected}
            startingPrice={startingPrice}
            className={variants.length > 2 && variants.length % 2 === 0 ? 'col-span-2' : undefined}
            onSelect={rule.enabled ? onCustomSelect : onRequestQuote}
          />
        )}
      </div>
      {quoteRange && (
        <div className="mt-3">
          <CakeCustomServingsChoice
            rule={null}
            quoteRange={quoteRange}
            selected={false}
            onSelect={onRequestQuote}
          />
        </div>
      )}
      {customSelected && rule?.enabled && (
        <div className="cake-custom-servings-panel mt-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px] sm:items-center">
            <div>
              <h3 className="text-sm font-semibold text-ink">El número exacto que necesitas</h3>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                Indica el total de porciones para tu torta. Cada porción adicional a la presentación
                base suma {formatCurrency(rule.pricePerExtraServing)}. El precio se actualiza con la
                cantidad que elijas.
              </p>
            </div>
            <Input
              id="custom-cake-servings"
              label="Número de porciones"
              type="number"
              min={rule.minServings}
              step={1}
              inputMode="numeric"
              value={customServings}
              onChange={(event) => onServingsChange(event.target.value)}
              error={servingsError}
            />
          </div>
        </div>
      )}
    </>
  );
};
