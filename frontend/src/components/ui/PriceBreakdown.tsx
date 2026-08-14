import type { ReactNode } from 'react';
import { cn } from '@lib/cn';
import { Skeleton } from './Skeleton';

export interface SummaryLine {
  label: ReactNode;
  value: ReactNode;
  /** 'positive' = verde (descuentos, saldo aplicado); 'muted' por defecto. */
  tone?: 'muted' | 'positive';
}

interface PriceBreakdownProps {
  lines: SummaryLine[];
  totalLabel: ReactNode;
  totalValue: ReactNode;
  /** Muestra placeholders con forma de filas mientras se cotiza. */
  isLoading?: boolean;
  /** Texto o fila pequeña bajo el total (p. ej. "Incluye IGV" o una aclaración). */
  note?: ReactNode;
  className?: string;
  /** Añade separación vertical para resúmenes con detalle por producto. */
  density?: 'normal' | 'relaxed';
  /** Destaca el total dentro de una superficie propia. */
  prominentTotal?: boolean;
}

/**
 * Desglose de precio data-driven: filas etiqueta/valor + total, con estado de
 * carga. Unifica los resúmenes de carrito, checkout, confirmación y builder.
 */
export const PriceBreakdown = ({
  lines,
  totalLabel,
  totalValue,
  isLoading = false,
  note,
  className,
  density = 'normal',
  prominentTotal = false,
}: PriceBreakdownProps) => {
  if (isLoading) {
    return (
      <div className={cn('grid gap-2.5', className)} aria-busy>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-2.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <dl className={cn('text-sm', density === 'relaxed' ? 'space-y-3' : 'space-y-1.5')}>
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              'flex items-start justify-between gap-4',
              line.tone === 'positive' ? 'text-brand-700' : 'text-ink-muted',
            )}
          >
            <dt className="min-w-0">{line.label}</dt>
            <dd className="shrink-0 font-medium">{line.value}</dd>
          </div>
        ))}
        <div
          className={cn(
            'flex items-end justify-between gap-4 border-t border-line font-bold text-ink',
            prominentTotal
              ? 'mt-4 rounded-card border border-brand-100 bg-brand-50 px-3.5 py-3 text-base'
              : 'pt-2 text-base',
          )}
        >
          <dt>{totalLabel}</dt>
          <dd className={cn('text-brand-700', prominentTotal && 'text-2xl font-black')}>
            {totalValue}
          </dd>
        </div>
      </dl>
      {note && <div className="mt-3 text-xs leading-5 text-ink-muted">{note}</div>}
    </div>
  );
};
