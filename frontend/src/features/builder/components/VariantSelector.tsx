import { Loader2, Salad } from 'lucide-react';
import { cn } from '@lib/cn';
import { formatCurrency } from '@lib/format';
import type { BuilderVariant } from '../types';

interface VariantSelectorProps {
  variants: BuilderVariant[];
  variantId: number | null;
  isQuoting: boolean;
  onChange: (id: number) => void;
}

/** Selección de tamaño independiente del resto de pasos. */
export const VariantSelector = ({
  variants,
  variantId,
  isQuoting,
  onChange,
}: VariantSelectorProps) => (
  <section className="rounded-card border border-line bg-white p-5 shadow-e2 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">Paso inicial</p>
        <h2 className="mt-1.5 text-xl font-black tracking-tight text-ink sm:text-2xl">Elige el tamaño de tu bowl</h2>
        <p className="mt-1 text-sm text-ink-muted">Define el precio base y la capacidad de tu pedido.</p>
      </div>
      {isQuoting && (
        <span className="inline-flex items-center gap-2 rounded-pill bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">
          <Loader2 className="size-3.5 animate-spin" /> Actualizando
        </span>
      )}
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {variants.map((entry, index) => {
        const selected = entry.id === variantId;
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(entry.id)}
            className={cn(
              'group flex min-h-24 items-center gap-4 rounded-card border p-4 text-left transition-all',
              selected
                ? 'border-brand-600 bg-brand-50 shadow-e2 ring-1 ring-brand-600'
                : 'border-line bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2',
            )}
          >
            <span
              className={cn(
                'grid shrink-0 place-items-center rounded-card transition-colors',
                index === 0 ? 'size-11' : 'size-14',
                selected ? 'bg-brand-700 text-white' : 'bg-surface-muted text-brand-600',
              )}
            >
              <Salad className={index === 0 ? 'size-5' : 'size-6'} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold text-ink">{entry.name}</span>
              <span className="mt-1 block text-xs text-ink-muted">
                Base de {Math.round(entry.nutrition.calories)} kcal
              </span>
            </span>
            <span className="shrink-0 text-lg font-black text-brand-700">
              {formatCurrency(entry.basePrice)}
            </span>
          </button>
        );
      })}
    </div>
  </section>
);
