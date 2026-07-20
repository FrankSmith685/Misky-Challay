import { useCallback, useState } from 'react';
import { AlertTriangle, Clock, Utensils } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { getApiErrorMessage } from '@services/api/client';
import { cn } from '@lib/cn';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import type { KitchenBoard, KitchenTicket, TicketStatus } from '../types';

/** Siguiente paso de cada estado: la cocina avanza con un solo boton. */
const NEXT_STEP: Partial<Record<TicketStatus, { status: TicketStatus; label: string }>> = {
  QUEUED: { status: 'ACCEPTED', label: 'Aceptar' },
  ACCEPTED: { status: 'PREPARING', label: 'Empezar a preparar' },
  PREPARING: { status: 'READY', label: 'Marcar listo' },
  READY: { status: 'DISPATCHED', label: 'Despachar' },
};

const COLUMNS: Array<{ status: TicketStatus; title: string }> = [
  { status: 'QUEUED', title: 'En cola' },
  { status: 'ACCEPTED', title: 'Aceptados' },
  { status: 'PREPARING', title: 'Preparando' },
  { status: 'READY', title: 'Listos' },
];

const formatTime = (value: string): string =>
  new Date(value).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

const TicketCard = ({
  ticket,
  onAdvance,
  isBusy,
}: {
  ticket: KitchenTicket;
  onAdvance: (ticket: KitchenTicket, status: TicketStatus) => void;
  isBusy: boolean;
}) => {
  const next = NEXT_STEP[ticket.status];

  return (
    <Card className={cn('p-4 shadow-sm transition-shadow hover:shadow-md', ticket.isLate && 'border-red-300 bg-red-50')}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink">{ticket.order?.orderNumber}</p>
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            ticket.isLate ? 'font-medium text-red-600' : 'text-ink-muted',
          )}
        >
          <Clock className="size-3.5" />
          {formatTime(ticket.targetAt)}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-ink-muted">
        {ticket.order?.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'}
        {ticket.order?.contactName ? ` · ${ticket.order.contactName}` : ''}
      </p>

      {ticket.notes && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-accent-400/10 p-2 text-xs text-accent-500">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {ticket.notes}
        </p>
      )}

      <ul className="mt-3 space-y-2 border-t border-line pt-3">
        {ticket.order?.items.map((item) => (
          <li key={item.id} className="text-sm">
            <p className="font-medium text-ink">
              {item.quantity}x {item.name}
            </p>

            {item.customizations.length > 0 && (
              <ul className="mt-0.5 pl-3 text-xs text-ink-muted">
                {item.customizations.map((customization, index) => (
                  <li key={`${customization.option}-${index}`}>
                    {customization.group}: {customization.option}
                    {customization.quantity > 1 ? ` x${customization.quantity}` : ''}
                  </li>
                ))}
              </ul>
            )}

            {item.specialInstructions && (
              <p className="mt-0.5 pl-3 text-xs italic text-accent-500">
                {item.specialInstructions}
              </p>
            )}
          </li>
        ))}
      </ul>

      {ticket.order?.notes && (
        <p className="mt-2 text-xs italic text-ink-muted">Nota: {ticket.order.notes}</p>
      )}

      <div className="mt-3 flex gap-2">
        {next && (
          <Button
            size="sm"
            className="flex-1"
            disabled={isBusy}
            onClick={() => onAdvance(ticket, next.status)}
          >
            {next.label}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={isBusy}
          onClick={() => onAdvance(ticket, 'CANCELLED')}
        >
          Cancelar
        </Button>
      </div>
    </Card>
  );
};

/** Tablero de cocina: se refresca solo cada 5 segundos. */
const KitchenPage = () => {
  const [busyId, setBusyId] = useState<number | null>(null);
  const { branchId, branches, setBranchId, isLoadingBranches } = useActiveBranch();

  const fetcher = useCallback(
    () => branchId
      ? adminApi.kitchenBoard(branchId)
      : Promise.resolve({ tickets: [], stats: { queued: 0, preparing: 0, ready: 0, late: 0 } }),
    [branchId],
  );
  const { data, isLoading, refresh } = usePolling<KitchenBoard>(fetcher, 5000);

  const handleAdvance = async (ticket: KitchenTicket, status: TicketStatus) => {
    setBusyId(ticket.id);
    try {
      await adminApi.advanceTicket(ticket.id, status);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const tickets = data?.tickets ?? [];
  const stats = data?.stats;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <PageHeader className="mb-0" eyebrow="Produccion" icon={Utensils} title="Tablero de cocina" description="Flujo en vivo · actualizacion automatica cada 5 segundos." />

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <BranchSelector value={branchId} branches={branches} onChange={setBranchId} />
          {stats && (
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            <span className="whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-muted">En cola <strong className="ml-1 text-base text-ink">{stats.queued}</strong></span>
            <span className="whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-muted">Preparando <strong className="ml-1 text-base text-ink">{stats.preparing}</strong></span>
            <span className="whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-muted">Listos <strong className="ml-1 text-base text-ink">{stats.ready}</strong></span>
            {stats.late > 0 && (
              <span className="whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">Con retraso <strong className="ml-1 text-base">{stats.late}</strong></span>
            )}
          </div>
          )}
        </div>
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={Utensils} title="Cocina al dia" description="No hay pedidos pendientes de preparacion ahora mismo." />
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnTickets = tickets.filter((ticket) => ticket.status === column.status);

            return (
              <section key={column.status} className="w-[85vw] shrink-0 snap-start rounded-2xl bg-surface-muted/70 p-3 sm:w-auto">
                <h2 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink-muted"><span>{column.title}</span><span className="grid size-6 place-items-center rounded-full bg-surface text-[11px] text-ink shadow-sm">{columnTickets.length}</span></h2>

                <div className="space-y-3">
                  {columnTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      isBusy={busyId === ticket.id}
                      onAdvance={handleAdvance}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KitchenPage;
