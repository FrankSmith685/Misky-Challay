import { cn } from '@lib/cn';

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: 'Esperando pago', className: 'bg-accent-400/15 text-accent-500' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-brand-50 text-brand-700' },
  PREPARING: { label: 'En preparacion', className: 'bg-brand-100 text-brand-800' },
  READY: { label: 'Listo', className: 'bg-brand-100 text-brand-800' },
  OUT_FOR_DELIVERY: { label: 'En camino', className: 'bg-brand-200 text-brand-900' },
  DELIVERED: { label: 'Entregado', className: 'bg-brand-600 text-white' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'Reembolsado', className: 'bg-surface-muted text-ink-muted' },
};

export const OrderStatusBadge = ({ status }: { status: string }) => {
  const entry = STATUS[status] ?? { label: status, className: 'bg-surface-muted text-ink-muted' };

  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', entry.className)}>
      {entry.label}
    </span>
  );
};
