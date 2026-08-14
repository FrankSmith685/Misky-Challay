import { cn } from '@lib/cn';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  /** Color de la barra. */
  tone?: 'brand' | 'accent';
}

/** Barra de progreso horizontal (0 a max). */
export const Progress = ({ value, max = 100, className, showLabel, tone = 'brand' }: ProgressProps) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={className}>
      <div
        className="h-2 w-full overflow-hidden rounded-pill bg-surface-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-pill transition-all', tone === 'brand' ? 'bg-brand-600' : 'bg-accent-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <p className="mt-1 text-right text-xs text-ink-muted">{Math.round(pct)}%</p>}
    </div>
  );
};
