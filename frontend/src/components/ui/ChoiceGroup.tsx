import type { ReactNode } from 'react';
import { cn } from '@lib/cn';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Texto secundario pequeño (solo visible en variante 'tile'). */
  hint?: ReactNode;
  disabled?: boolean;
}

type Variant = 'segment' | 'pill' | 'tile';

interface ChoiceGroupProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: ChoiceOption<T>[];
  /** 'segment' = segmentos de ancho igual (default); 'pill' = píldoras; 'tile' = tarjetas. */
  variant?: Variant;
  /** Solo para 'tile': número de columnas. */
  columns?: 1 | 2 | 3;
  ariaLabel?: string;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  segment: 'flex gap-2',
  pill: 'flex flex-wrap gap-2',
  tile: 'grid gap-2',
};

const COLUMNS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

/**
 * `min-w-0` en las variantes que reparten el ancho (segment y tile).
 *
 * `flex-1` fija `flex-basis: 0`, pero el `min-width: auto` que traen por defecto
 * los elementos flex deja que el contenido empuje mas alla de su carril: una
 * etiqueta larga ("Efectivo al recibir") en una columna estrecha desbordaba su
 * caja y descuadraba el grupo entero. Con `min-w-0` el texto se ajusta dentro.
 *
 * `text-center` es para cuando ese ajuste parte la etiqueta en dos lineas: sin el
 * quedaba desalineada respecto a la opcion de al lado. La altura de linea se deja
 * como esta a proposito: apretarla dejaba el area de toque por debajo de 44 px.
 */
const OPTION: Record<Variant, string> = {
  segment:
    'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-field border px-4 py-3 text-center text-sm',
  pill: 'inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-sm font-semibold',
  tile: 'flex min-w-0 items-start gap-2 rounded-card border p-3 text-left text-sm',
};

/**
 * Grupo de opción seleccionable (single-select). Centraliza estado activo/hover/
 * disabled, focus-ring y aria. Reemplaza los controles segmented/pill/tile
 * reimplementados a mano en checkout, ficha de producto y builder.
 */
export const ChoiceGroup = <T extends string | number>({
  value,
  onChange,
  options,
  variant = 'segment',
  columns = 1,
  ariaLabel,
  className,
}: ChoiceGroupProps<T>) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={cn(CONTAINER[variant], variant === 'tile' && COLUMNS[columns], className)}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={String(option.value)}
          type="button"
          disabled={option.disabled}
          aria-pressed={active}
          onClick={() => onChange(option.value)}
          className={cn(
            'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
            OPTION[variant],
            active
              ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
              : 'border-line text-ink-muted hover:border-brand-300',
          )}
        >
          {/* El icono nunca se comprime: es flex y sin esto se deformaba cuando la
              etiqueta de al lado se quedaba sin sitio. */}
          {option.icon && <span className="inline-flex shrink-0">{option.icon}</span>}
          {variant === 'tile' ? (
            <span className="flex min-w-0 flex-col">
              <span className={cn('font-semibold', active ? 'text-brand-700' : 'text-ink')}>{option.label}</span>
              {option.hint && <span className="mt-0.5 text-xs font-normal text-ink-muted">{option.hint}</span>}
            </span>
          ) : (
            option.label
          )}
        </button>
      );
    })}
  </div>
);
