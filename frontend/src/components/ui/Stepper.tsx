import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@lib/cn';

export interface Step {
  label: string;
}

/** Indicador de pasos (ej. constructor de bowl o checkout). `current` = indice del paso activo. */
export const Stepper = ({
  steps,
  current,
  className,
}: {
  steps: Step[];
  current: number;
  className?: string;
}) => {
  if (steps.length === 0) return null;
  const active = Math.min(Math.max(current, 0), steps.length - 1);

  return (
    <div className={cn('grid gap-2', className)}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const done = index < active;
          const isActive = index === active;
          return (
            <Fragment key={index}>
              <li className="flex items-center gap-2" aria-current={isActive ? 'step' : undefined}>
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    done
                      ? 'bg-brand-600 text-white'
                      : isActive
                        ? 'border-2 border-brand-600 text-brand-700'
                        : 'border border-line text-ink-muted',
                  )}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </span>
                <span className={cn('hidden text-sm sm:block', isActive ? 'font-medium text-ink' : 'text-ink-muted')}>
                  {step.label}
                </span>
              </li>
              {index < steps.length - 1 && (
                <span className={cn('mx-3 h-0.5 flex-1', done ? 'bg-brand-600' : 'bg-line')} />
              )}
            </Fragment>
          );
        })}
      </ol>

      {/* Por debajo de 640px las etiquetas se ocultan y el indicador se quedaba en
          "1 — 2 — 3", sin una sola palabra que dijera donde esta el cliente. Esta
          linea es el unico nombre accesible del paso activo en movil. */}
      <p className="text-sm sm:hidden">
        <span className="text-ink-muted">Paso {active + 1} de {steps.length} · </span>
        <span className="font-semibold text-ink">{steps[active].label}</span>
      </p>
    </div>
  );
};
