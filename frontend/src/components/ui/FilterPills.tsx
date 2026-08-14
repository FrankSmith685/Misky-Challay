import { cn } from '@lib/cn';

interface FilterPillsOption<T extends string> {
  value: T;
  label: string;
  /** Conteo opcional a la derecha de la etiqueta (ej. "Vencidos 4"). */
  count?: number;
}

interface FilterPillsProps<T extends string> {
  options: Array<FilterPillsOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Obligatorio: sin nombre de grupo, un lector de pantalla anuncia seis botones sueltos. */
  ariaLabel: string;
}

/**
 * Tira de filtros excluyentes (un solo valor activo).
 *
 * Nace de un marcado que estaba copiado letra por letra en Pedidos y en
 * Reclamaciones, con tres defectos heredados en ambos sitios:
 *   - en movil el contenedor era `flex-col`, asi que cada chip ocupaba una barra
 *     a ancho completo y los filtros se comian la primera pantalla antes del
 *     primer pedido. Aqui la tira desplaza en horizontal (patron ya probado en el
 *     tablero de cocina) y solo envuelve a partir de `sm`;
 *   - los chips median 34px, por debajo del paso tactil de 44 del producto;
 *   - el unico indicio de "activo" era el color de fondo: ni `aria-pressed` para
 *     el lector de pantalla ni diferencia de peso para quien no distingue tonos.
 */
export const FilterPills = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: FilterPillsProps<T>) => (
  <div
    role="group"
    aria-label={ariaLabel}
    // El margen negativo con relleno igual evita que el anillo de foco del primer
    // y del ultimo chip queden recortados por el contenedor con scroll.
    className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
  >
    {options.map((option) => {
      const isActive = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={isActive}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-field border px-3.5 text-sm transition-colors',
            isActive
              ? 'border-brand-600 bg-brand-600 font-bold text-white'
              : 'border-line bg-surface font-medium text-ink-muted hover:border-brand-300 hover:text-ink',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={cn(
                'rounded-pill px-1.5 py-0.5 text-xs font-bold tabular-nums',
                isActive ? 'bg-white/25 text-white' : 'bg-surface-muted text-ink',
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
