import { cn } from '@lib/cn';

/** Bloque gris animado que reserva el espacio mientras carga el contenido. */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-surface-muted', className)} />
);
