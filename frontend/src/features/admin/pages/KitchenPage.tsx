import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Bell, BellOff, CalendarClock, Clock, Download, Maximize2, Minimize2, MonitorUp, Printer, Radio, RefreshCw, Store, Utensils, WifiOff, Zap } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatDate, formatRelative, formatTime } from '@lib/format';
import { cn } from '@lib/cn';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import { OperationFlowGuide } from '../components/OperationFlowGuide';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';
import type { KitchenBoard, KitchenTicket, ScheduledKitchenOrder, TicketStatus } from '../types';
import { useKitchenRealtime } from '../hooks/useKitchenRealtime';
import { useKdsDevice } from '../hooks/useKdsDevice';
import { useKitchenPush } from '../hooks/useKitchenPush';
import { useNewOrderAlert } from '../hooks/useNewOrderAlert';
import { printKitchenTicket } from '../utils/kitchenPrint';
import { printInternalReceiptWindow } from '../utils/internalReceiptPrint';
import { useReceiptSettings } from '@services/businessInfo';

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

const PAGE_TITLE = 'Tablero de cocina | Verde Bowl';
const AUTO_PRINT_KEY = 'verde-bowl.admin.kitchen-auto-print';
const KDS_MODE_KEY = 'verde-bowl.admin.kitchen-kds-mode';
const ESCALATE_AFTER_MS = 2 * 60_000;
const CRITICAL_AFTER_MS = 5 * 60_000;

const TicketCard = ({
  ticket,
  onAdvance,
  onCancel,
  isBusy,
  canOperate,
  canCancel,
  isFresh,
  isTarget,
  waitingMinutes,
  onPrint,
}: {
  ticket: KitchenTicket;
  onAdvance: (ticket: KitchenTicket, status: TicketStatus) => void;
  onCancel: (ticket: KitchenTicket) => void;
  isBusy: boolean;
  canOperate: boolean;
  canCancel: boolean;
  isFresh: boolean;
  isTarget: boolean;
  waitingMinutes: number;
  onPrint: (ticket: KitchenTicket) => void;
}) => {
  const next = ticket.status === 'READY' && ticket.order?.deliveryType !== 'PICKUP'
    ? undefined
    : NEXT_STEP[ticket.status];

  return (
    <Card
      id={`kitchen-ticket-${ticket.id}`}
      shadow="e1"
      className={cn(
        'p-4 transition-shadow hover:shadow-e3',
        ticket.isLate && 'border-red-300 bg-red-50',
        ticket.status === 'QUEUED' && waitingMinutes >= 2 && 'border-accent-400 bg-accent-50/70',
        ticket.status === 'QUEUED' && waitingMinutes >= CRITICAL_AFTER_MS / 60_000 && 'border-red-400 bg-red-50 ring-2 ring-red-200',
        (isFresh || isTarget) && 'border-brand-500 ring-2 ring-brand-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-ink">
          {ticket.order?.orderNumber}
          {isFresh && <Badge variant="solid">Nuevo</Badge>}
          {isTarget && <Badge variant="brand">Buscado</Badge>}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => onPrint(ticket)} className="grid size-8 place-items-center rounded-field text-ink-muted transition hover:bg-white hover:text-brand-700" aria-label={`Imprimir ${ticket.order?.orderNumber ?? 'comanda'}`}><Printer className="size-4" /></button>
          <span className={cn('flex items-center gap-1 text-xs', ticket.isLate ? 'font-medium text-red-600' : 'text-ink-muted')}><Clock className="size-3.5" />{formatTime(ticket.targetAt)}</span>
        </div>
      </div>

      {ticket.status === 'QUEUED' && waitingMinutes >= 2 && (
          <p className={cn('mt-2 flex items-center gap-1.5 rounded-field px-2 py-1.5 text-xs font-black', waitingMinutes >= CRITICAL_AFTER_MS / 60_000 ? 'bg-red-600 text-white' : 'bg-accent-400/20 text-accent-700')}>
          <Bell className="size-3.5" /> Sin aceptar hace {waitingMinutes} min
        </p>
      )}

      <p className="mt-0.5 text-xs text-ink-muted">
        {ticket.order?.deliveryType === 'DELIVERY'
          ? 'Delivery'
          : ticket.order?.deliveryType === 'DINE_IN'
            ? `Salón · ${ticket.order.diningTable?.code ?? 'Mesa'}`
            : 'Recojo'}
        {ticket.order?.contactName ? ` · ${ticket.order.contactName}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ticket.order?.serviceMode === 'SCHEDULED' && (
          <Badge variant="warning">
            <CalendarClock className="size-3" /> Programado {ticket.order.scheduledAt ? formatTime(ticket.order.scheduledAt) : ''}
          </Badge>
        )}
        {ticket.order?.paymentDueOnDelivery && (
          <Badge variant="warning">
            <Banknote className="size-3" />{' '}
            {ticket.order.deliveryType === 'DELIVERY'
              ? 'Cobrar al entregar'
              : ticket.order.deliveryType === 'DINE_IN'
                ? 'Cobrar en Salon'
                : 'Cobrar en mostrador'}
          </Badge>
        )}
      </div>

      {ticket.notes && (
        <p className="mt-2 flex items-start gap-1.5 rounded-card bg-accent-400/15 p-2 text-sm font-medium text-accent-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {ticket.notes}
        </p>
      )}

      <ul className="mt-3 space-y-3 border-t border-line pt-3">
        {ticket.order?.items.map((item) => (
          <li key={item.id} className="text-sm">
            <p className="font-semibold text-ink">
              {item.quantity}x {item.name}
            </p>

            {item.description && (
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.description}</p>
            )}

            {item.allergens && item.allergens.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
                {item.allergens.map((allergen) => (
                  <Badge key={allergen} variant="danger" className="bg-red-100 font-bold uppercase tracking-wide text-red-800">
                    <AlertTriangle className="size-3" />
                    {allergen.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </p>
            )}

            {item.customizations.length > 0 && (
              <ul className="mt-1 pl-3 text-sm text-ink">
                {item.customizations.map((customization, index) => (
                  <li key={`${customization.option}-${index}`}>
                    {customization.group}: {customization.option}
                    {customization.quantity > 1 ? ` x${customization.quantity}` : ''}
                  </li>
                ))}
              </ul>
            )}

            {item.specialInstructions && (
              <p className="mt-1 border-l-2 border-accent-400 pl-2 text-sm text-ink">
                {item.specialInstructions}
              </p>
            )}
          </li>
        ))}
      </ul>

      {ticket.order?.notes && (
        <p className="mt-3 rounded-card border border-accent-300 bg-accent-50 p-2 text-sm text-ink">
          <strong className="font-semibold text-accent-700">Nota del cliente:</strong>{' '}
          {ticket.order.notes}
        </p>
      )}

      {ticket.status === 'READY' && ticket.order?.deliveryType !== 'PICKUP' && (
        <p className="mt-3 rounded-card border border-brand-200 bg-brand-50 p-2 text-sm font-semibold text-brand-800">
          {ticket.order?.deliveryType === 'DELIVERY'
            ? 'Esperando que Reparto confirme el retiro.'
            : 'Salon ya puede servir y cerrar esta mesa.'}
        </p>
      )}

      {canOperate && (
        <div className="mt-4 grid gap-2">
          {next && (
            <Button size="lg" disabled={isBusy} onClick={() => onAdvance(ticket, next.status)}>
              {next.status === 'DISPATCHED'
                ? ticket.order?.deliveryType === 'DELIVERY'
                  ? 'Entregar a reparto'
                  : ticket.order?.deliveryType === 'DINE_IN'
                    ? 'Avisar a Salon'
                    : 'Entregar en mostrador'
                : next.status === 'READY'
                  ? ticket.order?.deliveryType === 'DELIVERY'
                    ? 'Marcar listo para reparto'
                    : ticket.order?.deliveryType === 'DINE_IN'
                      ? 'Marcar listo y avisar a Salon'
                      : 'Marcar listo para recojo'
                  : next.label}
            </Button>
          )}

          {canCancel && (
            <div className="border-t border-line pt-2">
              <Button
                variant="ghost"
                className="w-full"
                sx={{ color: 'error.main' }}
                disabled={isBusy}
                onClick={() => onCancel(ticket)}
              >
                Cancelar el pedido
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const ScheduledOrderCard = ({ order, isTarget }: { order: ScheduledKitchenOrder; isTarget: boolean }) => (
  <Card
    id={`kitchen-scheduled-${order.id}`}
    shadow="e1"
    className={cn('min-w-[280px] border-accent-200 bg-accent-50/50 p-4', isTarget && 'ring-2 ring-brand-300')}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-black text-ink">{order.orderNumber}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {order.deliveryType === 'DELIVERY' ? 'Delivery' : order.deliveryType === 'DINE_IN' ? `Salon · ${order.diningTable?.code ?? 'Mesa'}` : 'Recojo'}
          {order.contactName ? ` · ${order.contactName}` : ''}
        </p>
      </div>
      <Badge variant="warning"><CalendarClock className="size-3" /> Programado</Badge>
    </div>
    <p className="mt-3 text-sm font-bold text-accent-800">Entrega: {formatDate(order.scheduledAt)}</p>
    <p className="mt-1 text-xs font-semibold text-ink-muted">
      Entrará automáticamente a En cola a las {formatTime(order.releaseAt)}.
    </p>
    <ul className="mt-3 space-y-1 border-t border-accent-200 pt-3 text-sm text-ink">
      {order.items.map((item) => <li key={item.id}><strong>{item.quantity}x</strong> {item.name}</li>)}
    </ul>
    {order.notes && <p className="mt-3 rounded-field bg-white p-2 text-xs text-ink"><strong>Nota:</strong> {order.notes}</p>}
  </Card>
);

const KitchenPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrderNumber = searchParams.get('pedido');
  const requestedBranchId = Number(searchParams.get('branchId')) || null;
  const [busyId, setBusyId] = useState<number | null>(null);
  const receiptSettings = useReceiptSettings();
  const [autoPrint, setAutoPrint] = useState(() => {
    const stored = localStorage.getItem(AUTO_PRINT_KEY);
    return stored === null ? true : stored === 'on';
  });
  const [devicePanelOpen, setDevicePanelOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(AUTO_PRINT_KEY) === null) {
      setAutoPrint(receiptSettings.autoPrintKitchenTicket);
    }
  }, [receiptSettings.autoPrintKitchenTicket]);
  const [kdsMode, setKdsMode] = useState(
    () => searchParams.get('kds') === '1' || localStorage.getItem(KDS_MODE_KEY) === 'on',
  );
  // Reloj propio del aviso de datos viejos: sin el, "hace N s" se congelaba en el
  // segundo en que cayo la red, que es justo cuando hay que saber cuanto ha pasado.
  const [now, setNow] = useState(() => Date.now());
  const {
    branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches,
  } = useActiveBranch();

  useEffect(() => {
    if (!requestedBranchId || requestedBranchId === branchId) return;
    if (branches.some((branch) => branch.id === requestedBranchId)) setBranchId(requestedBranchId);
  }, [branchId, branches, requestedBranchId, setBranchId]);
  const { can } = usePermissions();
  const confirm = useConfirm();
  const device = useKdsDevice();
  const { notify: notifyDevice } = device;
  const remotePush = useKitchenPush(branchId);
  const escalationSeen = useRef(new Set<number>());

  const canOperate = can(PERM.KITCHEN_OPERATE);
  // Cancelar arrastra el pedido a CANCELLED: el servidor exige los dos permisos.
  const canCancel = canOperate && can(PERM.ORDER_CANCEL);

  const fetcher = useCallback(
    (signal: AbortSignal): Promise<KitchenBoard> => branchId
      ? adminApi.kitchenBoard(branchId, signal)
      : Promise.resolve({ tickets: [], scheduled: [], stats: { queued: 0, preparing: 0, ready: 0, late: 0, scheduled: 0 } }),
    [branchId],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<KitchenBoard>(fetcher, 30_000);
  const handleRealtimeEvent = useCallback(() => refresh(), [refresh]);
  const realtime = useKitchenRealtime(branchId, handleRealtimeEvent);
  const handleIncoming = useCallback((incoming: KitchenTicket[]) => {
    incoming.forEach((ticket) => {
      if (autoPrint) printKitchenTicket(ticket);
      void notifyDevice({
        title: `Nuevo pedido ${ticket.order?.orderNumber ?? ''}`.trim(),
        body: `${ticket.order?.deliveryType === 'DINE_IN' ? `Mesa ${ticket.order.diningTable?.code ?? ''}` : ticket.order?.deliveryType === 'PICKUP' ? 'Recojo en local' : 'Delivery'} · ${ticket.order?.items.length ?? 0} productos esperando aceptación`,
        tag: `kitchen-ticket-${ticket.id}`,
      });
    });
  }, [autoPrint, notifyDevice]);
  const { isEnabled: isAlertOn, toggle: toggleAlert, freshIds, ring } = useNewOrderAlert(data, handleIncoming);

  const queuedCount = data?.stats.queued ?? 0;
  const tickets = data?.tickets ?? [];
  const scheduledOrders = data?.scheduled ?? [];
  const requestedTicket = requestedOrderNumber
    ? tickets.find((ticket) => ticket.order?.orderNumber === requestedOrderNumber) ?? null
    : null;
  const requestedScheduled = requestedOrderNumber
    ? scheduledOrders.find((order) => order.orderNumber === requestedOrderNumber) ?? null
    : null;
  const attentionTickets = tickets.filter(
    (ticket) => ticket.status === 'QUEUED' && now - new Date(ticket.createdAt).getTime() >= ESCALATE_AFTER_MS,
  );

  useEffect(() => {
    if (!requestedTicket && !requestedScheduled) return;
    const timer = window.setTimeout(() => {
      const targetId = requestedTicket
        ? `kitchen-ticket-${requestedTicket.id}`
        : `kitchen-scheduled-${requestedScheduled?.id}`;
      document.getElementById(targetId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [requestedScheduled, requestedTicket]);

  // Contador en la pestana: la tablet de cocina comparte navegador con el resto
  // del panel y el pedido nuevo tiene que verse desde otra pestana.
  useEffect(() => {
    document.title = queuedCount > 0 ? `(${queuedCount}) ${PAGE_TITLE}` : PAGE_TITLE;
  }, [queuedCount]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    attentionTickets.forEach((ticket) => {
      if (escalationSeen.current.has(ticket.id)) return;
      escalationSeen.current.add(ticket.id);
      ring();
      void notifyDevice({
        title: 'Pedido sin aceptar',
        body: `${ticket.order?.orderNumber ?? `Ticket ${ticket.id}`} lleva más de 2 minutos esperando.`,
        tag: `kitchen-escalation-${ticket.id}`,
      });
    });
  }, [attentionTickets, notifyDevice, ring]);

  useEffect(() => {
    document.body.classList.toggle('kds-active', kdsMode);
    return () => document.body.classList.remove('kds-active');
  }, [kdsMode]);

  const toggleKdsMode = () => {
    const next = !kdsMode;
    setKdsMode(next);
    localStorage.setItem(KDS_MODE_KEY, next ? 'on' : 'off');
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set('kds', '1'); else nextParams.delete('kds');
    setSearchParams(nextParams, { replace: true });
  };

  const toggleAutoPrint = () => {
    const next = !autoPrint;
    setAutoPrint(next);
    localStorage.setItem(AUTO_PRINT_KEY, next ? 'on' : 'off');
    toast.success(next ? 'Impresión automática activada' : 'Impresión automática desactivada');
  };

  const runTicketAction = async (ticket: KitchenTicket, status: TicketStatus, comment?: string) => {
    const printWindow = status === 'READY' && receiptSettings.autoPrintCustomerTicket
      ? window.open('', '_blank', 'popup,width=420,height=760')
      : null;
    setBusyId(ticket.id);
    try {
      await adminApi.advanceTicket(ticket.id, status, comment);
      if (status === 'READY' && receiptSettings.autoPrintCustomerTicket && ticket.order?.orderNumber) {
        if (!printWindow) toast.error('El navegador bloqueo la impresion automatica. Usa Imprimir desde el pedido.');
        else {
          const detail = await adminApi.orderDetail(ticket.order.orderNumber);
          await adminApi.recordInternalReceiptPrint(detail.orderNumber);
          await printInternalReceiptWindow(detail, printWindow);
        }
      }
      refresh();
    } catch (actionError) {
      printWindow?.close();
      toast.error(getApiErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvance = (ticket: KitchenTicket, status: TicketStatus) => {
    void runTicketAction(ticket, status);
  };

  const handleCancel = async (ticket: KitchenTicket) => {
    const { confirmed, reason } = await confirm({
      title: `Cancelar el pedido ${ticket.order?.orderNumber ?? ''}`.trim(),
      message:
        'El pedido ya esta pagado. Se cancela entero: se libera el cupon, se devuelve el saldo y se avisa al cliente. No se puede deshacer desde el tablero.',
      confirmLabel: 'Cancelar el pedido',
      cancelLabel: 'Volver al tablero',
      tone: 'danger',
      reasonLabel: 'Motivo de la cancelacion',
      reasonRequired: true,
    });
    if (!confirmed) return;

    await runTicketAction(ticket, 'CANCELLED', reason);
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const stats = data?.stats;
  const activeBranchName = branches.find((branch) => branch.id === branchId)?.name ?? null;

  const freshnessLabel = (() => {
    if (lastSuccessAt === null) return 'todavia sin datos de esta cocina';
    const seconds = Math.max(0, Math.round((now - lastSuccessAt) / 1000));
    // Por debajo del minuto y medio los segundos son la unidad util; a partir de
    // ahi "hace 4 min" se lee mucho mejor que "hace 253 s".
    return seconds < 90
      ? `datos de hace ${seconds} s`
      : `datos de ${formatRelative(new Date(lastSuccessAt))}`;
  })();

  let content: ReactNode;
  if (branchesError) {
    content = (
      <LoadError
        title="No pudimos cargar las cocinas"
        message={branchesError}
        onRetry={() => void reloadBranches()}
      />
    );
  } else if (!branchId) {
    content = (
      <EmptyState
        icon={Store}
        title="Sin cocina seleccionada"
        description="Elige una cocina arriba para ver su tablero. Si no aparece ninguna, pide que te asignen una sucursal."
      />
    );
  } else if (error && !data) {
    content = <LoadError title="No pudimos cargar el tablero" message={error} onRetry={refresh} />;
  } else if (tickets.length === 0) {
    content = (
      <EmptyState
        icon={Utensils}
        title="Sin preparación activa"
        description={scheduledOrders.length > 0
          ? 'No hay comandas para preparar ahora. Los pedidos futuros están visibles arriba en Programados.'
          : 'No hay comandas activas ni pedidos programados pendientes.'}
      />
    );
  } else {
    content = (
      // lg y no xl: el hueco entre sm y xl cubria TODA la tablet (iPad 768, Air 820,
      // Pro 11 vertical 834, horizontal 1024), y a dos columnas el flujo se partia en
      // dos filas apiladas. Cada columna scrollea por dentro con altura acotada: sin
      // eso, "Listos" con 8 tickets quedaba a 2000px de scroll de pagina.
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnTickets = tickets.filter((ticket) => ticket.status === column.status);

          return (
            <section
              key={column.status}
              className={cn('flex w-[85vw] shrink-0 snap-start flex-col rounded-card bg-surface-muted/70 p-3 sm:w-auto', kdsMode ? 'max-h-[calc(100dvh-12rem)]' : 'max-h-[calc(100dvh-13rem)]')}
            >
              <h2 className="sticky top-0 z-10 mb-3 flex shrink-0 items-center justify-between rounded-card bg-surface-muted/95 py-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <span>{column.title}</span>
                <span className="grid size-6 place-items-center rounded-pill bg-surface text-[11px] text-ink shadow-e1">{columnTickets.length}</span>
              </h2>

              <div className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto">
                {columnTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    isBusy={busyId === ticket.id}
                    canOperate={canOperate}
                    canCancel={canCancel}
                    isFresh={freshIds.includes(ticket.id)}
                    isTarget={requestedTicket?.id === ticket.id}
                    waitingMinutes={ticket.createdAt ? Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60_000)) : 0}
                    onPrint={printKitchenTicket}
                    onAdvance={handleAdvance}
                    onCancel={(target) => void handleCancel(target)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn(kdsMode && 'fixed inset-0 z-[1400] overflow-y-auto bg-[#f8f5f8] p-3 sm:p-5')}>
      <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-4', kdsMode && 'hidden')}>
        <PageHeader className="mb-0" eyebrow={kdsMode ? `KDS · ${activeBranchName ?? 'Cocina'}` : 'Producción'} icon={Utensils} title="Tablero de cocina" description="Pedidos instantáneos · sondeo de respaldo cada 30 segundos." />

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <BranchSelector value={branchId} branches={branches} onChange={setBranchId} hasError={Boolean(branchesError)} />

          <Button
            variant={isAlertOn ? 'outline' : 'ghost'}
            aria-pressed={isAlertOn}
            leftIcon={isAlertOn ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            onClick={toggleAlert}
          >
            {isAlertOn ? 'Aviso activo' : 'Aviso apagado'}
          </Button>

          <Button variant={kdsMode ? 'primary' : 'outline'} leftIcon={<MonitorUp className="size-4" />} onClick={toggleKdsMode}>
            {kdsMode ? 'Salir de KDS' : 'Modo KDS'}
          </Button>

          <Button variant="outline" aria-label={device.isFullscreen ? 'Salir de pantalla completa' : 'Usar pantalla completa'} leftIcon={device.isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} onClick={() => void device.toggleFullscreen()}>
            {device.isFullscreen ? 'Restaurar' : 'Pantalla completa'}
          </Button>

          {stats && (
            <OperationsMetricStrip
              metrics={[
                { label: 'En cola', value: stats.queued, tone: stats.queued > 0 ? 'accent' : 'neutral' },
                { label: 'Programados', value: stats.scheduled, tone: stats.scheduled > 0 ? 'accent' : 'neutral' },
                { label: 'Preparando', value: stats.preparing, tone: 'brand' },
                { label: 'Listos', value: stats.ready },
                ...(stats.late > 0
                  ? [{ label: 'Con retraso', value: stats.late, icon: AlertTriangle, tone: 'danger' as const }]
                  : []),
              ]}
              ariaLabel="Carga actual de cocina"
            />
          )}
        </div>
      </div>

      {kdsMode && (
        <header className="sticky top-0 z-30 mb-3 rounded-card border border-line bg-white/95 p-3 shadow-e2 backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-700 text-white"><Utensils className="size-5" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.12em] text-brand-700">KDS · {activeBranchName ?? 'Cocina'}</p><h1 className="truncate text-xl font-black text-ink sm:text-2xl">Tablero de cocina</h1></div></div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <BranchSelector value={branchId} branches={branches} onChange={setBranchId} hasError={Boolean(branchesError)} />
              <Button size="sm" variant={isAlertOn ? 'outline' : 'ghost'} leftIcon={isAlertOn ? <Bell className="size-4" /> : <BellOff className="size-4" />} onClick={toggleAlert}>{isAlertOn ? 'Sonido activo' : 'Activar sonido'}</Button>
              <Button size="sm" variant="outline" leftIcon={<Zap className="size-4" />} onClick={() => setDevicePanelOpen((open) => !open)}>{devicePanelOpen ? 'Ocultar equipo' : 'Configurar equipo'}</Button>
              <Button size="sm" variant="outline" aria-label={device.isFullscreen ? 'Salir de pantalla completa' : 'Usar pantalla completa'} onClick={() => void device.toggleFullscreen()}>{device.isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
              <Button size="sm" onClick={toggleKdsMode}>Salir</Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-bold', realtime.status === 'connected' ? 'bg-brand-100 text-brand-800' : 'bg-accent-50 text-accent-700')}><Radio className="size-3.5" /> {realtime.status === 'connected' ? 'En vivo' : 'Reconectando'}</span>
            {stats && <><Badge variant={stats.scheduled ? 'warning' : 'neutral'}>Programados {stats.scheduled}</Badge><Badge variant={stats.queued ? 'warning' : 'neutral'}>En cola {stats.queued}</Badge><Badge variant="brand">Preparando {stats.preparing}</Badge><Badge variant="success">Listos {stats.ready}</Badge>{stats.late > 0 && <Badge variant="danger">Con retraso {stats.late}</Badge>}</>}
            <span className="ml-auto text-[11px] font-semibold text-ink-muted">{freshnessLabel}</span>
          </div>
        </header>
      )}

      <Card className={cn('mb-4 overflow-hidden p-0', kdsMode && !devicePanelOpen && 'hidden')} shadow="e1">
        <div className="flex flex-col gap-3 border-b border-line bg-gradient-to-r from-brand-50 via-white to-accent-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="flex items-center gap-2 text-sm font-black text-ink"><Zap className="size-4 text-brand-700" /> Estado del equipo de cocina</p><p className="mt-1 text-xs text-ink-muted">Verifica estos indicadores al abrir el turno.</p></div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5', realtime.status === 'connected' ? 'bg-brand-100 text-brand-800' : 'bg-accent-50 text-accent-700')}><Radio className="size-3.5" /> {realtime.status === 'connected' ? 'Tiempo real conectado' : 'Reconectando · respaldo activo'}</span>
            <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5', device.wakeActive ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted text-ink-muted')}><MonitorUp className="size-3.5" /> {device.wakeActive ? 'Pantalla siempre activa' : device.wakeSupported ? 'Suspensión permitida' : 'Wake Lock no compatible'}</span>
            <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5', remotePush.isSubscribed ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted text-ink-muted')}><Bell className="size-3.5" /> {remotePush.isSubscribed ? 'Push fuera de la app activo' : 'Push de respaldo pendiente'}</span>
            <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5', autoPrint ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted text-ink-muted')}><Printer className="size-3.5" /> {autoPrint ? 'Impresión automática' : 'Impresión manual'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {device.wakeSupported && <Button size="sm" variant={device.wakeEnabled ? 'outline' : 'ghost'} leftIcon={<MonitorUp className="size-4" />} onClick={() => void device.toggleWake()}>{device.wakeEnabled ? 'Mantener despierta: sí' : 'Evitar suspensión'}</Button>}
          {remotePush.isSupported && !remotePush.isSubscribed && <Button size="sm" variant="outline" isLoading={remotePush.isBusy} leftIcon={<Bell className="size-4" />} onClick={() => void remotePush.enable().then((enabled) => enabled && toast.success('Alertas fuera de la app activadas'))}>Activar alertas fuera de la app</Button>}
          {remotePush.isSubscribed && <Button size="sm" variant="ghost" isLoading={remotePush.isBusy} leftIcon={<BellOff className="size-4" />} onClick={() => void remotePush.disable()}>Desactivar push</Button>}
          <Button size="sm" variant={autoPrint ? 'outline' : 'ghost'} leftIcon={<Printer className="size-4" />} onClick={toggleAutoPrint}>{autoPrint ? 'Autoimpresión activa' : 'Activar autoimpresión'}</Button>
          {device.canInstall && <Button size="sm" variant="outline" leftIcon={<Download className="size-4" />} onClick={() => void device.install()}>Instalar como app</Button>}
          {device.isInstalled && <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-3 text-xs font-bold text-brand-800"><Download className="size-3.5" /> App instalada</span>}
        </div>
        {remotePush.error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">{remotePush.error}</p>}
      </Card>

      {attentionTickets.length > 0 && (
        <div role="alert" className="mb-4 flex flex-col gap-3 rounded-card border border-red-300 bg-red-50 px-4 py-3 text-red-800 shadow-e2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-black"><Bell className="mt-0.5 size-4 shrink-0" /><span>{attentionTickets.length} {attentionTickets.length === 1 ? 'pedido lleva' : 'pedidos llevan'} más de 2 minutos sin aceptar. El escalamiento automático ya se activó.</span></p>
          <Button size="sm" onClick={() => document.getElementById(`kitchen-ticket-${attentionTickets[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Ver urgente</Button>
        </div>
      )}

      {!kdsMode && <OperationFlowGuide stage="kitchen" branchName={activeBranchName} />}

      {requestedOrderNumber && !isLoading && data && !requestedTicket && !requestedScheduled && (
        <div role="status" className="mb-4 rounded-card border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-800">
          El pedido <strong>{requestedOrderNumber}</strong> no tiene una comanda activa en esta cocina. Puede estar pendiente de pago, programado para mas tarde, despachado o cerrado.
        </div>
      )}

      {/* Banda persistente, no un toast: con la red caida el tablero se congelaba
          y seguia diciendo "Cocina al dia". Se pone en rojo cuando lo que se ve ya
          tiene edad suficiente para no poder confiarse. */}
      {error && (
        <div
          role="status"
          className={cn(
            'mb-4 flex flex-col gap-3 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
            isStale ? 'border-red-200 bg-red-50 text-red-700' : 'border-accent-300 bg-accent-50 text-accent-700',
          )}
        >
          <p className="flex items-start gap-2 font-medium">
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            <span>Sin conexion con el servidor · {freshnessLabel}. Puede haber pedidos que no ves.</span>
          </p>
          <Button variant="outline" className="shrink-0" leftIcon={<RefreshCw className="size-4" />} onClick={refresh}>
            Reintentar
          </Button>
        </div>
      )}

      {scheduledOrders.length > 0 && (
        <section className="mb-5 rounded-card border border-accent-200 bg-white p-4 shadow-e1" aria-labelledby="scheduled-kitchen-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-accent-700">Agenda confirmada</p>
              <h2 id="scheduled-kitchen-title" className="text-lg font-black text-ink">Programados ({scheduledOrders.length})</h2>
            </div>
            <p className="text-xs text-ink-muted">Son pedidos pagados. Aún no requieren acción de cocina.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scheduledOrders.map((order) => <ScheduledOrderCard key={order.id} order={order} isTarget={requestedScheduled?.id === order.id} />)}
          </div>
        </section>
      )}

      {content}
    </div>
  );
};

export default KitchenPage;
