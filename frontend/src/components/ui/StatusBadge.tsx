import { Badge, type BadgeVariant } from './Badge';

export interface StatusMeta {
  label: string;
  variant: BadgeVariant;
}

/** Diccionario de estado -> apariencia, por dominio (pedidos, reclamos, etc.). */
export type StatusMap = Record<string, StatusMeta>;

interface StatusBadgeProps {
  status: string | null | undefined;
  /** Mapa del dominio (p. ej. ORDER_STATUS, COMPLAINT_STATUS, activeStateMap()). */
  map: StatusMap;
  /** Apariencia cuando el estado no está en el mapa. Por defecto, el código con tono neutro. */
  fallback?: StatusMeta;
  className?: string;
}

/**
 * Píldora de estado consistente y data-driven, construida sobre <Badge>.
 * Centraliza etiqueta + tono para que el mismo estado se vea igual en toda la app.
 */
export const StatusBadge = ({ status, map, fallback, className }: StatusBadgeProps) => {
  const meta: StatusMeta =
    (status != null ? map[status] : undefined) ??
    fallback ?? { label: String(status ?? '—'), variant: 'neutral' };

  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
};

/** Mapa reutilizable para estados booleanos (activo / inactivo) con etiquetas configurables. */
export const activeStateMap = (activeLabel = 'Activo', inactiveLabel = 'Inactivo'): StatusMap => ({
  true: { label: activeLabel, variant: 'brand' },
  false: { label: inactiveLabel, variant: 'neutral' },
});
