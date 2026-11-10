import { Loader2, Salad } from 'lucide-react';
import { formatCurrency } from '@lib/format';
import type { BuilderOption } from '../types';
import { BowlPreview } from './BowlPreview';

interface BuilderMobileOverviewProps {
  options: Array<BuilderOption & { quantity: number }>;
  total: number;
  isQuoting: boolean;
}

/** Resumen temprano para móvil/tablet; el detalle completo permanece en el aside de escritorio. */
export const BuilderMobileOverview = ({
  options,
  total,
  isQuoting,
}: BuilderMobileOverviewProps) => (
  <details className="group overflow-hidden rounded-card border border-brand-200 bg-white shadow-e2 xl:hidden">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 marker:hidden sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-700 text-white">
        {isQuoting ? <Loader2 className="size-5 animate-spin" /> : <Salad className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-ink">
          {options.length ? `${options.length} ingredientes elegidos` : 'Tu bowl está esperando'}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">Toca para ver la vista previa</span>
      </span>
      <span className="text-lg font-black text-brand-700">{formatCurrency(total)}</span>
    </summary>

    <div className="grid gap-4 border-t border-line bg-gradient-to-br from-brand-50/70 to-white p-4 sm:grid-cols-[220px_1fr] sm:items-center sm:p-5">
      <BowlPreview options={options} isUpdating={isQuoting} />
      <div className="rounded-card border border-line bg-white p-4 text-sm text-ink-muted">
        Revisa tus ingredientes y el precio antes de confirmar tu combinación.
      </div>
    </div>
  </details>
);

