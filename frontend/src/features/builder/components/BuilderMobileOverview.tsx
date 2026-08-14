import { Flame, Loader2, Salad, WalletCards } from 'lucide-react';
import { formatCurrency } from '@lib/format';
import type { BuilderOption, Nutrition } from '../types';
import { BowlPreview } from './BowlPreview';

interface BuilderMobileOverviewProps {
  options: Array<BuilderOption & { quantity: number }>;
  nutrition: Nutrition;
  total: number;
  isQuoting: boolean;
}

/** Resumen temprano para móvil/tablet; el detalle completo permanece en el aside de escritorio. */
export const BuilderMobileOverview = ({
  options,
  nutrition,
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
        <span className="mt-0.5 block text-xs text-ink-muted">Toca para ver la vista previa y nutrición</span>
      </span>
      <span className="text-lg font-black text-brand-700">{formatCurrency(total)}</span>
    </summary>

    <div className="grid gap-4 border-t border-line bg-gradient-to-br from-brand-50/70 to-white p-4 sm:grid-cols-[220px_1fr] sm:items-center sm:p-5">
      <BowlPreview options={options} isUpdating={isQuoting} />
      <div className="grid grid-cols-2 gap-2.5">
        <Metric icon={Flame} label="Calorías" value={`${Math.round(nutrition.calories)} kcal`} />
        <Metric icon={Salad} label="Proteína" value={`${Math.round(nutrition.protein)} g`} />
        <Metric icon={WalletCards} label="Total" value={formatCurrency(total)} className="col-span-2" />
      </div>
    </div>
  </details>
);

const Metric = ({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  className?: string;
}) => (
  <div className={`rounded-card border border-line bg-white p-3 ${className ?? ''}`}>
    <Icon className="size-4 text-brand-600" aria-hidden="true" />
    <p className="mt-2 text-[11px] font-semibold text-ink-muted">{label}</p>
    <p className="mt-0.5 font-black text-ink">{value}</p>
  </div>
);
