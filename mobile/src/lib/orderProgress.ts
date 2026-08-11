import type { OrderStatus, ServiceMode } from '../types/domain';

/**
 * Avance de un pedido, traducido a barra de progreso.
 *
 * Lo consumen el historial, el detalle y la portada, así que vive aquí y no en
 * ninguna de las tres pantallas: duplicarlo dejaría a un cliente viendo dos
 * estados distintos del mismo pedido según por dónde entrara.
 */

/** Un pedido a domicilio pasa por «En camino»; uno de recojo, no. */
const DELIVERY_STEPS: OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const PICKUP_STEPS: OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERED',
];

const STEP_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Recibido',
  CONFIRMED: 'Pago confirmado',
  PREPARING: 'En cocina',
  READY: 'Listo',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Devuelto',
};

/** El pedido ya no cambia: se apaga el sondeo y se deja de prometer seguimiento. */
export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REFUNDED'];

export const CANCELLABLE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'CONFIRMED'];

export interface OrderProgressStep {
  status: OrderStatus;
  label: string;
  reachedAt: string | null;
  done: boolean;
  current: boolean;
}

export interface OrderProgress {
  steps: OrderProgressStep[];
  /** Cuántos pasos se alcanzaron ya (1 como mínimo: el pedido existe). */
  reached: number;
  nextLabel: string | null;
  isTerminal: boolean;
  isCancelled: boolean;
}

export interface TrackedOrder {
  status: OrderStatus;
  deliveryType: ServiceMode;
  statusHistory?: Array<{ toStatus: OrderStatus; createdAt: string }>;
}

/**
 * Traduce el estado del pedido a una barra de progreso.
 *
 * El historial solo viaja en el detalle: en el listado hay que deducir el avance
 * del estado actual, así que se toma el máximo de ambos. Marcar «hecho» hasta el
 * paso alcanzado —y no solo los que aparecen en el historial— evita huecos si
 * falta un intermedio, que es como se comporta cualquier barra de progreso.
 */
export function buildOrderProgress(order: TrackedOrder): OrderProgress {
  const steps = order.deliveryType === 'DELIVERY' ? DELIVERY_STEPS : PICKUP_STEPS;
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';

  const reachedAt = new Map<OrderStatus, string>();
  (order.statusHistory ?? []).forEach((row) => {
    if (!reachedAt.has(row.toStatus)) reachedAt.set(row.toStatus, row.createdAt);
  });

  const fromHistory = steps.reduce(
    (max, status, index) => (reachedAt.has(status) ? index : max),
    -1,
  );
  // Un pedido cancelado no «llega» a ningún paso nuevo: se queda donde se cortó.
  const currentIndex = isCancelled ? fromHistory : Math.max(fromHistory, steps.indexOf(order.status));

  const label = (status: OrderStatus): string =>
    status === 'DELIVERED' && order.deliveryType !== 'DELIVERY' ? 'Recogido' : STEP_LABEL[status];

  return {
    steps: steps.map((status, index) => ({
      status,
      label: label(status),
      reachedAt: reachedAt.get(status) ?? null,
      done: index <= currentIndex,
      current: index === currentIndex,
    })),
    reached: Math.max(currentIndex + 1, 1),
    nextLabel: isCancelled ? null : (steps[currentIndex + 1] ? label(steps[currentIndex + 1]) : null),
    isTerminal: TERMINAL_STATUSES.includes(order.status),
    isCancelled,
  };
}
