import { cn } from '@lib/cn';

type SkeletonVariant = 'block' | 'text' | 'circle';

interface SkeletonProps {
  /** 'block' = superficie (imagen, tarjeta); 'text' = renglon; 'circle' = avatar. */
  variant?: SkeletonVariant;
  /** Numero (px) o cualquier medida CSS ('60%', '12rem'). Alternativa a las clases w-* / h-*. */
  width?: number | string;
  height?: number | string;
  className?: string;
}

const VARIANTS: Record<SkeletonVariant, string> = {
  block: 'rounded-md',
  text: 'h-3.5 rounded-sm',
  circle: 'aspect-square rounded-full',
};

/**
 * Bloque gris animado que reserva el espacio mientras carga el contenido.
 *
 * El objetivo es reproducir la FORMA REAL de lo que va a llegar, no tapar la
 * pantalla: se combinan varios con las medidas de la tarjeta destino (ver
 * features/catalog/components/ProductCardSkeleton.tsx como referencia). Las
 * clases de `className` ganan a las de la variante (twMerge).
 */
export const Skeleton = ({ variant = 'block', width, height, className }: SkeletonProps) => (
  <div
    aria-hidden="true"
    className={cn('animate-pulse bg-surface-muted', VARIANTS[variant], className)}
    style={{ width, height }}
  />
);
