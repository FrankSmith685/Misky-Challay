import { cn } from '@lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

/** Interruptor on/off para preferencias y ajustes booleanos. */
export const Switch = ({ checked, onChange, label, disabled, id }: SwitchProps) => (
  <label
    htmlFor={id}
    className={cn(
      'inline-flex items-center gap-2',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    )}
  >
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors',
        checked ? 'bg-brand-600' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
    {label && <span className="text-sm text-ink">{label}</span>}
  </label>
);
