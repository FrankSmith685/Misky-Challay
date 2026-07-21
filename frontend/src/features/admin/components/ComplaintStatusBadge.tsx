import { cn } from '@lib/cn';

/** Un color por estado del reclamo, con el mismo patron de pill que OrderStatusBadge. */
const STATUS: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: 'Recibido', className: 'bg-surface-muted text-ink-muted' },
  IN_PROGRESS: { label: 'En proceso', className: 'bg-amber-50 text-amber-700' },
  RESOLVED: { label: 'Atendido', className: 'bg-brand-600 text-white' },
};

export const ComplaintStatusBadge = ({ status }: { status: string }) => {
  const entry = STATUS[status] ?? { label: status, className: 'bg-surface-muted text-ink-muted' };

  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', entry.className)}>
      {entry.label}
    </span>
  );
};
