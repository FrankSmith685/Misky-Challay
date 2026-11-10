import { StatusBadge, type StatusMap } from '@components/ui/StatusBadge';

/**
 * Estados de reparto y de cocina en espanol.
 *
 * Reparto y Cocina los pintaban en ingles crudo (ASSIGNED, PICKED_UP, ON_ROUTE),
 * y para el repartidor esos cuatro codigos son literalmente lo unico que ve de
 * todo el producto. El patron es el mismo de OrderStatusBadge y ComplaintStatusBadge.
 */

/** Del reparto sin asignar al entregado; el color acompana el avance. */
export const DELIVERY_STATUS: StatusMap = {
  PENDING: { label: 'Sin asignar', variant: 'accent' },
  ASSIGNED: { label: 'Asignado', variant: 'brand' },
  PICKED_UP: { label: 'Recogido', variant: 'success' },
  ON_ROUTE: { label: 'En camino', variant: 'strong' },
  DELIVERED: { label: 'Entregado', variant: 'solid' },
  FAILED: { label: 'No entregado', variant: 'danger' },
};

export const DeliveryStatusBadge = ({ status }: { status: string }) => (
  <StatusBadge status={status} map={DELIVERY_STATUS} />
);

/** Estados del ticket de cocina, en el orden del tablero. */
export const KITCHEN_STATUS: StatusMap = {
  QUEUED: { label: 'En cola', variant: 'accent' },
  ACCEPTED: { label: 'Aceptado', variant: 'brand' },
  PREPARING: { label: 'Preparando', variant: 'success' },
  READY: { label: 'Listo', variant: 'strong' },
  ON_HOLD: { label: 'En incidencia', variant: 'danger' },
  DISPATCHED: { label: 'Despachado', variant: 'solid' },
  CANCELLED: { label: 'Cancelado', variant: 'danger' },
};

export const KitchenStatusBadge = ({ status }: { status: string }) => (
  <StatusBadge status={status} map={KITCHEN_STATUS} />
);
