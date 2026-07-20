import { cn } from '@lib/cn';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  className?: string;
}

/** Grupo de opciones excluyentes (elige solo una). */
export const RadioGroup = ({ name, value, onChange, options, className }: RadioGroupProps) => (
  <div className={cn('space-y-2', className)} role="radiogroup">
    {options.map((option) => (
      <label
        key={option.value}
        className="flex cursor-pointer items-start gap-2 text-sm text-ink"
      >
        <span className="relative mt-0.5 inline-flex size-4 shrink-0">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer size-4 appearance-none rounded-full border border-line bg-surface transition-colors checked:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
          />
          <span className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-brand-600 transition-transform peer-checked:scale-100" />
        </span>
        <span>
          <span className="font-medium">{option.label}</span>
          {option.description && (
            <span className="block text-xs text-ink-muted">{option.description}</span>
          )}
        </span>
      </label>
    ))}
  </div>
);
