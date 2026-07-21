import { CheckCircle2, XCircle } from 'lucide-react';
import { Timeline, type TimelineItem } from '@components/ui/Timeline';
import { formatDate } from '@lib/format';

/**
 * Seguimiento visual del pedido: la linea feliz de estados con la hora real de cada
 * paso alcanzado. Los pasos futuros van apagados; el actual, destacado arriba.
 *
 * La linea se ramifica por tipo de entrega: el recojo en tienda no pasa por
 * "En camino" y su paso final es "Recogido", no "Entregado".
 */
const DELIVERY_STEPS = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

const PICKUP_STEPS = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] as const;

const STEP_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Pedido recibido',
  CONFIRMED: 'Pago confirmado',
  PREPARING: 'En preparación',
  READY: 'Listo',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
};

const TERMINAL = ['CANCELLED', 'REFUNDED'];

export interface TrackedOrder {
  status: string;
  deliveryType: 'DELIVERY' | 'PICKUP';
  serviceMode: 'ASAP' | 'SCHEDULED';
  scheduledAt: string | null;
  statusHistory?: Array<{ toStatus: string; createdAt: string }>;
}

export const OrderTracker = ({ order }: { order: TrackedOrder }) => {
  const history = order.statusHistory ?? [];
  const reachedAt = new Map(history.map((entry) => [entry.toStatus, entry.createdAt]));
  const steps = order.deliveryType === 'DELIVERY' ? DELIVERY_STEPS : PICKUP_STEPS;
  const isTerminal = TERMINAL.includes(order.status);

  // El paso final se rotula "Recogido" en recojo en tienda.
  const label = (status: string): string =>
    status === 'DELIVERED' && order.deliveryType === 'PICKUP'
      ? 'Recogido'
      : (STEP_LABEL[status] ?? status);

  // Indice del paso mas avanzado que se alcanzo. Marcar "done" hasta ahi (y no solo
  // los que aparecen en el historial) evita huecos visuales si falta un intermedio,
  // y da el comportamiento normal de una barra de progreso. Para un pedido terminal,
  // el estado CANCELLED/REFUNDED no esta en `steps`, asi que se ignora y quedan
  // marcados solo los pasos que si ocurrieron antes del corte.
  const maxReachedIndex = steps.reduce(
    (max, status, index) => (reachedAt.has(status) ? index : max),
    -1,
  );

  const items: TimelineItem[] = steps.map((status, index) => ({
    title: label(status),
    meta: reachedAt.get(status) ? formatDate(reachedAt.get(status)!) : undefined,
    done: index <= maxReachedIndex,
  }));

  return (
    <div>
      {isTerminal ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          <XCircle className="size-4 shrink-0" />
          {order.status === 'REFUNDED' ? 'Pedido reembolsado' : 'Pedido cancelado'}
        </div>
      ) : (
        <div className="mb-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <CheckCircle2 className="size-4" /> Ahora: {label(order.status)}
          </p>
          {order.serviceMode === 'SCHEDULED' && order.scheduledAt && (
            <p className="mt-1 text-xs text-ink-muted">
              Programado para el {formatDate(order.scheduledAt)}
            </p>
          )}
        </div>
      )}

      <Timeline items={items} />
    </div>
  );
};
