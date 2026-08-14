import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';

interface OperationMetric {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'brand' | 'accent' | 'danger';
}

interface OperationsMetricStripProps {
  metrics: OperationMetric[];
  className?: string;
  ariaLabel?: string;
}

const TONES: Record<NonNullable<OperationMetric['tone']>, string> = {
  neutral: 'border-line bg-surface text-ink',
  brand: 'border-brand-200 bg-brand-50 text-brand-800',
  accent: 'border-accent-200 bg-accent-50 text-accent-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

/** Indicadores compactos reutilizables para tableros que se actualizan en vivo. */
export const OperationsMetricStrip = ({
  metrics,
  className,
  ariaLabel = 'Resumen del tablero',
}: OperationsMetricStripProps) => (
  <dl className={cn('flex max-w-full gap-2 overflow-x-auto pb-1', className)} aria-label={ariaLabel}>
    {metrics.map(({ label, value, icon: Icon, tone = 'neutral' }) => (
      <div
        key={label}
        className={cn('flex min-w-fit items-center gap-2 rounded-field border px-3 py-2', TONES[tone])}
      >
        {Icon && <Icon className="size-4 opacity-75" />}
        <dt className="whitespace-nowrap text-xs font-medium opacity-80">{label}</dt>
        <dd className="text-base font-extrabold tabular-nums">{value}</dd>
      </div>
    ))}
  </dl>
);

