import { Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@lib/cn';

type Size = 'md' | 'touch';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Valor mínimo permitido. Por defecto 1. */
  min?: number;
  /** Valor máximo permitido (opcional). */
  max?: number;
  /** 'touch' = objetivos de 44px (recomendado en móvil). Por defecto 'md' (40px). */
  size?: Size;
  /**
   * Si `value === min`, el botón "−" quita en vez de quedarse clavado (icono de papelera).
   * Requiere `onRemove`. Útil donde no hay un botón de eliminar aparte.
   */
  removeAtMin?: boolean;
  onRemove?: () => void;
  /** Contexto para lectores de pantalla (p. ej. el nombre del producto). */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

const SIZES: Record<Size, { btn: string; value: string }> = {
  md: { btn: 'size-10', value: 'w-8 text-sm' },
  touch: { btn: 'size-11', value: 'w-10 text-sm' },
};

/**
 * Control de cantidad −/n/+ controlado, con clamp a [min, max], estados disabled
 * coherentes y objetivos táctiles accesibles. Reemplaza las copias a mano del
 * carrito, la ficha de producto y el builder.
 */
export const QuantityStepper = ({
  value,
  onChange,
  min = 1,
  max,
  size = 'md',
  removeAtMin = false,
  onRemove,
  ariaLabel,
  disabled = false,
  className,
}: QuantityStepperProps) => {
  const s = SIZES[size];
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  const showRemove = removeAtMin && atMin && Boolean(onRemove);
  const suffix = ariaLabel ? ` ${ariaLabel}` : '';

  const decrease = () => {
    if (disabled) return;
    if (atMin) {
      if (showRemove) onRemove!();
      return;
    }
    onChange(value - 1);
  };

  const increase = () => {
    if (disabled || atMax) return;
    onChange(value + 1);
  };

  const btnBase =
    'flex items-center justify-center rounded-field text-ink-muted transition-colors hover:text-brand-700 disabled:opacity-40 disabled:hover:text-ink-muted';

  return (
    <div className={cn('inline-flex items-center rounded-field border border-line', className)}>
      <button
        type="button"
        onClick={decrease}
        disabled={disabled || (atMin && !showRemove)}
        aria-label={`${showRemove ? 'Quitar' : 'Quitar uno'}${suffix}`}
        className={cn(btnBase, s.btn, showRemove && 'hover:text-red-600')}
      >
        {showRemove ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>

      <span className={cn('text-center font-semibold tabular-nums', s.value)}>{value}</span>

      <button
        type="button"
        onClick={increase}
        disabled={disabled || atMax}
        aria-label={`Agregar uno${suffix}`}
        className={cn(btnBase, s.btn)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
};
