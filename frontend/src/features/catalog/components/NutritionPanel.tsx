import { formatCalories, formatMacro } from '@lib/format';
import { cn } from '@lib/cn';
import { AnimatedNumber } from '@components/ui/AnimatedNumber';
import type { Nutrition } from '../types';

interface NutritionPanelProps {
  nutrition: Nutrition;
  showGoals?: boolean;
  layout?: 'compact' | 'comfortable';
}

/** Panel de calorias y macros (RN-008: es la suma de la variante + las opciones). */
export const NutritionPanel = ({
  nutrition,
  showGoals = false,
  layout = 'compact',
}: NutritionPanelProps) => {
  const isComfortable = layout === 'comfortable';
  const rows = [
    { label: 'Calorías', amount: nutrition.calories, format: formatCalories, goal: 700 },
    { label: 'Proteína', amount: nutrition.protein, format: formatMacro, goal: 35 },
    { label: 'Carbohidratos', amount: nutrition.carbs, format: formatMacro, goal: 90 },
    { label: 'Grasas', amount: nutrition.fat, format: formatMacro, goal: 30 },
  ];

  return (
    <dl
      className={cn(
        'grid gap-2',
        isComfortable
          ? 'mt-4 grid-cols-2 rounded-card bg-surface-muted/70 p-2.5 text-left'
          : 'grid-cols-4 rounded-card border border-line bg-surface-muted p-3 text-center',
      )}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            'min-w-0',
            isComfortable && 'rounded-card border border-line/80 bg-white px-3 py-2.5 shadow-sm',
          )}
        >
          <dt
            className={cn(
              'font-semibold uppercase text-ink-muted',
              isComfortable
                ? 'text-[10px] leading-none tracking-[.08em]'
                : 'break-words text-[9px] leading-tight tracking-[.04em]',
            )}
          >
            {row.label}
          </dt>
          <dd className={cn('font-semibold text-ink', isComfortable ? 'mt-1.5 text-base' : 'mt-0.5 text-sm')}>
            <AnimatedNumber value={row.amount} format={row.format} />
          </dd>
          {showGoals && (
            <span
              className={cn(
                'mt-2 block h-1 w-full overflow-hidden rounded-pill',
                isComfortable ? 'bg-surface-muted' : 'mx-auto max-w-14 bg-white',
              )}
              aria-label={`${Math.round(Math.min(100, row.amount / row.goal * 100))}% del objetivo orientativo`}
            >
              <span className="block h-full rounded-pill bg-brand-500 transition-all duration-500" style={{ width: `${Math.min(100, row.amount / row.goal * 100)}%` }} />
            </span>
          )}
        </div>
      ))}
      {showGoals && (
        <p
          className={cn(
            'mt-1 text-[10px] leading-4 text-ink-muted',
            isComfortable ? 'col-span-2 px-1 text-left' : 'col-span-4 text-center',
          )}
        >
          Indicadores orientativos por bowl; no sustituyen una recomendación profesional.
        </p>
      )}
    </dl>
  );
};
