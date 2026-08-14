import { StatusBadge, type StatusMap } from '@components/ui/StatusBadge';

/** Estados de un pedido, del más temprano al entregado (la progresión de color lo refleja). */
export const ORDER_STATUS: StatusMap = {
  PENDING_PAYMENT: { label: 'Esperando pago', variant: 'accent' },
  CONFIRMED: { label: 'Confirmado', variant: 'brand' },
  PREPARING: { label: 'En preparación', variant: 'success' },
  READY: { label: 'Listo', variant: 'success' },
  OUT_FOR_DELIVERY: { label: 'En camino', variant: 'strong' },
  DELIVERED: { label: 'Entregado', variant: 'solid' },
  CANCELLED: { label: 'Cancelado', variant: 'danger' },
  REFUNDED: { label: 'Reembolsado', variant: 'neutral' },
};

export const OrderStatusBadge = ({ status }: { status: string }) => (
  <StatusBadge status={status} map={ORDER_STATUS} />
);
