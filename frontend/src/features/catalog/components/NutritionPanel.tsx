import { formatCalories, formatMacro } from '@lib/format';
import type { Nutrition } from '../types';

/** Panel de calorias y macros (RN-008: es la suma de la variante + las opciones). */
export const NutritionPanel = ({ nutrition, showGoals = false }: { nutrition: Nutrition; showGoals?: boolean }) => {
  const rows = [
    { label: 'Calorias', value: formatCalories(nutrition.calories), amount: nutrition.calories, goal: 700 },
    { label: 'Proteina', value: formatMacro(nutrition.protein), amount: nutrition.protein, goal: 35 },
    { label: 'Carbohidratos', value: formatMacro(nutrition.carbs), amount: nutrition.carbs, goal: 90 },
    { label: 'Grasas', value: formatMacro(nutrition.fat), amount: nutrition.fat, goal: 30 },
  ];

  return (
    <dl className="grid grid-cols-4 gap-2 rounded-card border border-line bg-surface-muted p-3 text-center">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{row.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">{row.value}</dd>
          {showGoals && (
            <span className="mx-auto mt-2 block h-1 w-full max-w-14 overflow-hidden rounded-full bg-white" aria-label={`${Math.round(Math.min(100, row.amount / row.goal * 100))}% del objetivo orientativo`}>
              <span className="block h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${Math.min(100, row.amount / row.goal * 100)}%` }} />
            </span>
          )}
        </div>
      ))}
      {showGoals && <p className="col-span-4 mt-1 text-[10px] text-ink-muted">Indicadores orientativos por bowl; no sustituyen una recomendación profesional.</p>}
    </dl>
  );
};
