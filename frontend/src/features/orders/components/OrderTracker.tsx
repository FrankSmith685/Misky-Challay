import { CheckCircle2, XCircle } from 'lucide-react';
import { Timeline, type TimelineItem } from '@components/ui/Timeline';
import { formatDate } from '@lib/format';
import { cn } from '@lib/cn';

/**
 * Seguimiento visual del pedido: la linea feliz de estados con la hora real de cada
 * paso alcanzado. Los pasos futuros van apagados; el actual, destacado arriba.
 *
 * La linea se ramifica por tipo de entrega: el recojo en tienda no pasa por
 * "En camino" y su paso final es "Recogido", no "Entregado".
 *
 * Se dibuja de dos formas segun el ancho: barra horizontal en movil (la vertical
 * gastaba media pantalla justo en lo que se venia a mirar) y linea de tiempo con
 * horas en escritorio. Solo una existe a la vez, asi que no se duplica el contenido.
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

  const progress = steps.map((status, index) => ({
    label: label(status),
    meta: reachedAt.get(status) ? formatDate(reachedAt.get(status)!) : undefined,
    done: index <= maxReachedIndex,
  }));
  const items: TimelineItem[] = progress.map((step) => ({
    title: step.label,
    meta: step.meta,
    done: step.done,
  }));

  const reachedCount = maxReachedIndex + 1;
  const nextStep = isTerminal ? undefined : progress[maxReachedIndex + 1]?.label;
  const currentMeta = progress[maxReachedIndex]?.meta;

  return (
    <div>
      {isTerminal ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          <XCircle className="size-4 shrink-0" />
          {order.status === 'REFUNDED' ? 'Pedido reembolsado' : 'Pedido cancelado'}
        </div>
      ) : (
        // El sondeo cambia este texto sin que nadie lo pida: con role="status" el
        // lector de pantalla anuncia el avance en vez de callarselo.
        <div className="mb-4" role="status" aria-live="polite">
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

      <div className="lg:hidden">
        <ol className="flex gap-1" aria-label="Progreso del pedido">
          {progress.map((step) => (
            <li key={step.label} className="min-w-0 flex-1">
              <span
                className={cn('block h-1.5 rounded-xs', step.done ? 'bg-brand-600' : 'bg-line')}
              />
              <span className="sr-only">
                {step.label}: {step.done ? 'completado' : 'pendiente'}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="font-semibold text-ink">
            Paso {Math.max(reachedCount, 1)} de {progress.length}
          </span>
          {nextStep ? <span>Sigue: {nextStep}</span> : currentMeta && <span>{currentMeta}</span>}
        </p>
      </div>

      <Timeline items={items} className="hidden lg:block" />
    </div>
  );
};
