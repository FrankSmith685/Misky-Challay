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
}) => (
  <ol className={cn('flex items-center', className)}>
    {steps.map((step, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <Fragment key={index}>
          <li className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                done
                  ? 'bg-brand-600 text-white'
                  : active
                    ? 'border-2 border-brand-600 text-brand-700'
                    : 'border border-line text-ink-muted',
              )}
            >
              {done ? <Check className="size-4" /> : index + 1}
            </span>
            <span className={cn('hidden text-sm sm:block', active ? 'font-medium text-ink' : 'text-ink-muted')}>
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
);
