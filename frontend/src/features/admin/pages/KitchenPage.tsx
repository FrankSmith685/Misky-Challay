import { OrderCakeReference } from '@features/cakes/components/OrderCakeReference';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Bell, BellOff, CalendarClock, Clock, Download, Maximize2, Minimize2, MonitorUp, PauseCircle, PlayCircle, Printer, Radio, RefreshCw, Store, Utensils, WifiOff, Zap } from 'lucide-react';
import { useAppSelector } from '@app/hooks';
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
import { ROUTES } from '@constants/routes';
import { formatDate, formatRelative, formatTime } from '@lib/format';
import { cn } from '@lib/cn';
import { adminApi } from '../services/admin.service';
import { CakeThemeReference } from '@features/cakes/components/CakeThemeBanner';
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

type KitchenAdvanceStatus = 'ACCEPTED' | 'PREPARING' | 'READY' | 'DISPATCHED';
type KitchenAssignment = { station?: string | null; assignedTo?: number | null };
const STATIONS = ['GENERAL', 'HORNO', 'DECORACION', 'FRIO', 'DESPACHO'] as const;

const NEXT_STEP: Partial<Record<TicketStatus, { status: KitchenAdvanceStatus; label: string }>> = {
  QUEUED: { status: 'ACCEPTED', label: 'Aceptar' },
  ACCEPTED: { status: 'PREPARING', label: 'Empezar a preparar' },
  PREPARING: { status: 'READY', label: 'Marcar listo' },
  READY: { status: 'DISPATCHED', label: 'Despachar' },
};

const COLUMNS: Array<{ status: TicketStatus; title: string; description: string }> = [
  { status: 'QUEUED', title: 'En cola', description: 'Pedidos confirmados que cocina debe aceptar.' },
  { status: 'ACCEPTED', title: 'Aceptados', description: 'Aceptados, pendientes de empezar.' },
  { status: 'PREPARING', title: 'Preparando', description: 'En elaboracion; revisa notas y alergenos.' },
  { status: 'READY', title: 'Listos', description: 'Esperan recojo, Reparto o Salon.' },
  { status: 'ON_HOLD', title: 'Incidencias', description: 'Pedidos detenidos hasta resolver un problema.' },
];

const stepHelp = (ticket: KitchenTicket): string => {
  if (ticket.status === 'QUEUED') return 'Aceptar confirma que esta cocina se encargará del pedido. Todavía no se consumen insumos.';
  if (ticket.status === 'ACCEPTED') return 'Al empezar, el inventario registra el consumo de insumos. Verifica productos, cambios, notas y alérgenos antes.';
  if (ticket.status === 'PREPARING') return 'Marca listo solo cuando todo esté terminado. El pedido quedará disponible para Reparto, Salón o mostrador según su tipo.';
  if (ticket.order?.deliveryType === 'PICKUP') return 'Entrega el pedido en mostrador antes de confirmar: esta acción lo marca como entregado.';
  if (ticket.status === 'ON_HOLD') return 'El pedido esta detenido por una incidencia. Resuelve el motivo y reanuda el estado anterior.';
  return ticket.order?.deliveryType === 'DINE_IN'
    ? 'Cocina terminó. Salón debe servir, cobrar si corresponde y cerrar la mesa.'
    : 'Cocina terminó. Reparto confirma el retiro y continúa la entrega.';
};

const PAGE_TITLE = 'Tablero de cocina | Misky Challay';
const AUTO_PRINT_KEY = 'verde-bowl.admin.kitchen-auto-print';
const KDS_MODE_KEY = 'verde-bowl.admin.kitchen-kds-mode';
const ESCALATE_AFTER_MS = 2 * 60_000;
const CRITICAL_AFTER_MS = 5 * 60_000;

const TicketCard = ({
  ticket,
  onAdvance,
  onCancel,
  onHold,
  onResume,
  onAssign,
  currentUserId,
  isBusy,
  canOperate,
  canCancel,
  isFresh,
  isTarget,
  waitingMinutes,
  onPrint,
  actionError,
  canSeeOrders,
  canSeeInventory,
  canSeeCakes,
  canSeeDelivery,
  canSeeDining,
}: {
  ticket: KitchenTicket;
  onAdvance: (ticket: KitchenTicket, status: KitchenAdvanceStatus) => void;
  onCancel: (ticket: KitchenTicket) => void;
  onHold: (ticket: KitchenTicket) => void;
  onResume: (ticket: KitchenTicket) => void;
  onAssign: (ticket: KitchenTicket, input: KitchenAssignment) => void;
  currentUserId: number | null;
  isBusy: boolean;
  canOperate: boolean;
  canCancel: boolean;
  isFresh: boolean;
  isTarget: boolean;
  waitingMinutes: number;
  onPrint: (ticket: KitchenTicket) => void;
  actionError: string | null;
  canSeeOrders: boolean;
  canSeeInventory: boolean;
  canSeeCakes: boolean;
  canSeeDelivery: boolean;
  canSeeDining: boolean;
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
          <button type="button" onClick={() => onPrint(ticket)} disabled={!ticket.order} title="Imprimir comanda de cocina" className="grid size-8 place-items-center rounded-field text-ink-muted transition hover:bg-white hover:text-brand-700 disabled:opacity-40" aria-label={`Imprimir comanda ${ticket.order?.orderNumber ?? ''}`}><Printer className="size-4" /></button>
          <span className={cn('flex items-center gap-1 text-xs', ticket.isLate ? 'font-medium text-red-600' : 'text-ink-muted')} title="Hora objetivo del pedido"><Clock className="size-3.5" />Meta {formatTime(ticket.targetAt)}</span>
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

      {canOperate && !['DISPATCHED', 'CANCELLED'].includes(ticket.status) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-field border border-line bg-surface-muted p-2">
          <select aria-label="Estacion de cocina" value={ticket.station ?? 'GENERAL'} onChange={(event) => onAssign(ticket, { station: event.target.value })} className="min-w-0 flex-1 rounded-field border border-line bg-white px-2 py-1.5 text-xs font-semibold">
            {STATIONS.map((station) => <option key={station} value={station}>{station}</option>)}
          </select>
          <Button size="sm" variant="ghost" disabled={isBusy || ticket.assignedTo === currentUserId} onClick={() => onAssign(ticket, { assignedTo: currentUserId })}>{ticket.assignedTo === currentUserId ? 'Asignado a ti' : 'Tomar ticket'}</Button>
          {ticket.assignedName && ticket.assignedTo !== currentUserId && <span className="w-full text-xs text-ink-muted">Responsable: {ticket.assignedName}</span>}
        </div>
      )}
      {ticket.status === 'ON_HOLD' && ticket.incidentReason && <p className="mt-2 rounded-card border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-800"><AlertTriangle className="mr-1 inline size-4" />{ticket.incidentReason}</p>}
      {ticket.productionTasks && ticket.productionTasks.length > 0 && <p className="mt-2 rounded-card border border-accent-200 bg-accent-50 p-2 text-xs font-semibold text-accent-800">Produccion: {ticket.productionTasks.filter((task) => task.status === 'DONE').length}/{ticket.productionTasks.length} etapas completas{ticket.productionTasks.some((task) => !task.assigned) ? ' · hay etapas sin responsable' : ''}</p>}

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
            {item.themeSnapshotJson && <CakeThemeReference theme={item.themeSnapshotJson} />}
            <OrderCakeReference orderNumber={ticket.order!.orderNumber} itemId={item.id} images={item.designImages} hasReference={false} />

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
            : 'Salón ya puede servir, cobrar si corresponde y cerrar esta mesa.'}
        </p>
      )}

      <p className="mt-3 rounded-field bg-surface-muted px-3 py-2 text-xs leading-5 text-ink-muted">{stepHelp(ticket)}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
        {canSeeOrders && ticket.order && <Link className="text-brand-700 hover:underline" to={`${ROUTES.adminOrders}?q=${encodeURIComponent(ticket.order.orderNumber)}`}>Ver pedido completo →</Link>}
        {ticket.status === 'READY' && ticket.order?.deliveryType === 'DELIVERY' && canSeeDelivery && <Link className="text-brand-700 hover:underline" to={ROUTES.adminDelivery}>Abrir Reparto →</Link>}
        {ticket.status === 'READY' && ticket.order?.deliveryType === 'DINE_IN' && canSeeDining && <Link className="text-brand-700 hover:underline" to={ROUTES.adminDining}>Abrir Salón →</Link>}
      </div>

      {actionError && (
        <div role="alert" className="mt-3 rounded-field border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
          <strong>No se cambió el estado.</strong> {actionError}
          {ticket.status === 'ACCEPTED' && /insumo|stock|inventario|receta/i.test(actionError) && canSeeInventory && <Link className="mt-1 block font-bold underline" to={ROUTES.adminInventory}>Revisar insumos en Inventario →</Link>}
          {ticket.status === 'PREPARING' && /torta|calidad|producci[oó]n/i.test(actionError) && canSeeCakes && <Link className="mt-1 block font-bold underline" to={ROUTES.adminCakes}>Ir a Tortas, pestaña Producción →</Link>}
        </div>
      )}

      {canOperate && (
        <div className="mt-4 grid gap-2">
          {next && (
            <Button size="lg" disabled={isBusy} onClick={() => onAdvance(ticket, next.status)}>
              {next.status === 'DISPATCHED'
                ? 'Confirmar entrega en mostrador'
                : next.status === 'READY'
                  ? ticket.order?.deliveryType === 'DELIVERY'
                    ? 'Marcar listo para reparto'
                    : ticket.order?.deliveryType === 'DINE_IN'
                      ? 'Marcar listo para Salón'
                      : 'Marcar listo para recojo'
                  : next.label}
            </Button>
          )}

          {ticket.status === 'ON_HOLD' ? <Button size="lg" disabled={isBusy} onClick={() => onResume(ticket)} leftIcon={<PlayCircle className="size-4" />}>Reanudar ticket</Button> : <Button size="sm" variant="outline" disabled={isBusy} onClick={() => onHold(ticket)} leftIcon={<PauseCircle className="size-4" />}>Registrar incidencia</Button>}

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

const ScheduledOrderCard = ({ order, isTarget, branchId }: { order: ScheduledKitchenOrder; isTarget: boolean; branchId: number }) => {
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const datePart = (type: string) => today.find((part) => part.type === type)?.value ?? '';
  const todayKey = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
  const pendingTasks = (order.productionTasks ?? []).filter((task) => task.status !== 'DONE');
  const overdueTasks = pendingTasks.filter((task) => task.workDate < todayKey);
  const dueTasks = pendingTasks.filter((task) => task.workDate === todayKey);
  return (
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
      Comanda de cierre prevista: {formatDate(order.releaseAt)}.
    </p>
    {order.productionTasks && order.productionTasks.length > 0 && <div className="mt-3 rounded-lg border border-accent-200 bg-white p-3 text-xs text-ink">
      <p className="font-bold">Producción: {order.productionTasks.length - pendingTasks.length} de {order.productionTasks.length} etapas terminadas</p>
      <p className={`mt-1 ${overdueTasks.length ? 'font-bold text-red-700' : dueTasks.length ? 'font-bold text-amber-800' : 'text-ink-muted'}`}>{overdueTasks.length ? `${overdueTasks.length} etapa(s) atrasada(s)` : dueTasks.length ? `${dueTasks.length} etapa(s) para hoy` : 'Próxima etapa según el calendario'}</p>
      {pendingTasks.some((task) => !task.assigned) && <p className="mt-1 font-semibold text-amber-800">Hay etapas sin responsable.</p>}
      <Link className="mt-2 inline-block font-bold text-brand-700 underline" to={`${ROUTES.adminCakes}?seccion=production&pedido=${encodeURIComponent(order.orderNumber)}&branchId=${branchId}`}>Abrir plan de producción →</Link>
    </div>}
    <ul className="mt-3 space-y-1 border-t border-accent-200 pt-3 text-sm text-ink">
      {order.items.map((item) => (
        <li key={item.id}>
          <strong>{item.quantity}x</strong> {item.name}
          {item.customizations.length > 0 && <span className="block pl-3 text-xs text-ink-muted">{item.customizations.map((customization) => `${customization.group}: ${customization.option}${customization.quantity > 1 ? ` x${customization.quantity}` : ''}`).join(' · ')}</span>}
          {item.themeSnapshotJson && <CakeThemeReference theme={item.themeSnapshotJson} />}
          <OrderCakeReference orderNumber={order.orderNumber} itemId={item.id} images={item.designImages} hasReference={false} />
          {item.allergens && item.allergens.length > 0 && <span className="block pl-3 text-xs font-bold text-red-700">Alérgenos: {item.allergens.join(', ').replace(/_/g, ' ')}</span>}
          {item.specialInstructions && <span className="block pl-3 text-xs text-accent-800">Indicación: {item.specialInstructions}</span>}
        </li>
      ))}
    </ul>
    {order.notes && <p className="mt-3 rounded-field bg-white p-2 text-xs text-ink"><strong>Nota:</strong> {order.notes}</p>}
  </Card>
  );
};

const KitchenPage = () => {
  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrderNumber = searchParams.get('pedido');
  const requestedBranchId = Number(searchParams.get('branchId')) || null;
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<{ ticketId: number; message: string } | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{ orderNumber: string; message: string; pending: boolean } | null>(null);
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
  const appliedBranchParam = useRef<number | null>(null);

  useEffect(() => {
    if (!requestedBranchId) {
      appliedBranchParam.current = null;
      return;
    }
    if (appliedBranchParam.current === requestedBranchId) return;
    if (branches.some((branch) => branch.id === requestedBranchId)) {
      appliedBranchParam.current = requestedBranchId;
      if (requestedBranchId !== branchId) setBranchId(requestedBranchId);
    }
  }, [branchId, branches, requestedBranchId, setBranchId]);

  const changeBranch = (nextBranchId: number) => {
    setBranchId(nextBranchId);
    // El pedido del enlace pertenecía a otra cocina; no conservar una búsqueda
    // que haría parecer que desapareció al cambiar de sucursal.
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('pedido');
      next.delete('branchId');
      return next;
    }, { replace: true });
  };
  const { can } = usePermissions();
  const confirm = useConfirm();
  const device = useKdsDevice();
  const { notify: notifyDevice } = device;
  const remotePush = useKitchenPush(branchId);
  const escalationSeen = useRef(new Set<number>());

  const canOperate = can(PERM.KITCHEN_OPERATE);
  // Cancelar arrastra el pedido a CANCELLED: el servidor exige los dos permisos.
  const canCancel = canOperate && can(PERM.ORDER_CANCEL);

  useEffect(() => {
    setActionError(null);
    setCancelFeedback(null);
  }, [branchId]);

  const fetcher = useCallback(
    (signal: AbortSignal): Promise<KitchenBoard> => branchId
      ? adminApi.kitchenBoard(branchId, signal)
      : Promise.resolve({ tickets: [], scheduled: [], stats: { queued: 0, preparing: 0, ready: 0, late: 0, scheduled: 0, incidents: 0, escalated: 0, acceptedAvgMinutes: 0, prepAvgMinutes: 0 } }),
    [branchId],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<KitchenBoard>(fetcher, 30_000);
  const handleRealtimeEvent = useCallback(() => refresh(), [refresh]);
  const realtime = useKitchenRealtime(branchId, handleRealtimeEvent);
  const printTicket = useCallback((ticket: KitchenTicket) => {
    printKitchenTicket(ticket);
    void adminApi.recordKitchenPrint(ticket.id).catch(() => undefined);
  }, []);
  const handleIncoming = useCallback((incoming: KitchenTicket[]) => {
    incoming.forEach((ticket) => {
      if (autoPrint) printTicket(ticket);
      void notifyDevice({
        title: `Nuevo pedido ${ticket.order?.orderNumber ?? ''}`.trim(),
        body: `${ticket.order?.deliveryType === 'DINE_IN' ? `Mesa ${ticket.order.diningTable?.code ?? ''}` : ticket.order?.deliveryType === 'PICKUP' ? 'Recojo en local' : 'Delivery'} · ${ticket.order?.items.length ?? 0} productos esperando aceptación`,
        tag: `kitchen-ticket-${ticket.id}`,
      });
    });
  }, [autoPrint, notifyDevice, printTicket]);
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

  const runTicketAction = async (ticket: KitchenTicket, status: KitchenAdvanceStatus) => {
    const printWindow = status === 'READY' && receiptSettings.autoPrintCustomerTicket && ticket.order?.orderNumber
      ? window.open('', '_blank', 'popup,width=420,height=760')
      : null;
    setBusyId(ticket.id);
    setActionError(null);
    try {
      await adminApi.advanceTicket(ticket.id, status);
      refresh();
      toast.success(status === 'ACCEPTED' ? 'Comanda aceptada.' : status === 'PREPARING' ? 'Preparación iniciada; insumos consumidos.' : status === 'READY' ? 'Pedido listo. Continúa el equipo de entrega correspondiente.' : 'Pedido entregado en mostrador.');

      // El estado ya cambió en el servidor. Un fallo de impresión no debe mostrar
      // "acción fallida" ni invitar a repetir una transición irreversible.
      if (status === 'READY' && receiptSettings.autoPrintCustomerTicket && ticket.order?.orderNumber) {
        if (!printWindow) toast.warning('El pedido quedó listo, pero el navegador bloqueó la impresión. Imprime el ticket desde Pedidos.');
        else try {
          const detail = await adminApi.orderDetail(ticket.order.orderNumber);
          await adminApi.recordInternalReceiptPrint(detail.orderNumber);
          await printInternalReceiptWindow(detail, printWindow);
        } catch {
          printWindow.close();
          toast.warning('El pedido quedó listo, pero no se pudo imprimir el ticket. Abre el pedido para imprimirlo.');
        }
      }
    } catch (actionError) {
      printWindow?.close();
      const message = getApiErrorMessage(actionError);
      setActionError({ ticketId: ticket.id, message });
      toast.error(message);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvance = async (ticket: KitchenTicket, status: KitchenAdvanceStatus) => {
    if (status === 'DISPATCHED') {
      const { confirmed } = await confirm({
        title: `Confirmar entrega ${ticket.order?.orderNumber ?? ''}`.trim(),
        message: ticket.order?.paymentDueOnDelivery
          ? 'Este pedido indica cobro pendiente en mostrador. Confirma con Caja el importe y recibe el pago antes de entregar. Al confirmar, el sistema marcará el pedido como entregado y el pago en efectivo como recibido.'
          : 'Confirma solo después de entregar físicamente el pedido al cliente en mostrador. El pedido quedará como entregado y saldrá de Cocina.',
        confirmLabel: 'Sí, ya lo entregué',
        cancelLabel: 'Todavía no',
        requireTypedText: ticket.order?.paymentDueOnDelivery ? 'COBRADO' : undefined,
      });
      if (!confirmed) return;
    }
    await runTicketAction(ticket, status);
  };

  const handleHold = async (ticket: KitchenTicket) => {
    const answer = await confirm({ title: `Registrar incidencia ${ticket.order?.orderNumber ?? ''}`.trim(), message: 'El ticket quedara detenido y no consumira insumos hasta reanudarlo.', confirmLabel: 'Registrar incidencia', cancelLabel: 'Volver', reasonLabel: 'Motivo de la incidencia', reasonRequired: true, reasonMinLength: 3, reasonMaxLength: 500 });
    if (!answer.confirmed || !answer.reason) return;
    setBusyId(ticket.id); setActionError(null);
    try { await adminApi.holdKitchenTicket(ticket.id, answer.reason); refresh(); toast.warning('Incidencia registrada.'); }
    catch (cause) { const message = getApiErrorMessage(cause); setActionError({ ticketId: ticket.id, message }); toast.error(message); refresh(); }
    finally { setBusyId(null); }
  };

  const handleResume = async (ticket: KitchenTicket) => {
    setBusyId(ticket.id); setActionError(null);
    try { await adminApi.resumeKitchenTicket(ticket.id); refresh(); toast.success('Ticket reanudado.'); }
    catch (cause) { const message = getApiErrorMessage(cause); setActionError({ ticketId: ticket.id, message }); toast.error(message); refresh(); }
    finally { setBusyId(null); }
  };

  const handleAssign = async (ticket: KitchenTicket, input: KitchenAssignment) => {
    setBusyId(ticket.id); setActionError(null);
    try { await adminApi.assignKitchenTicket(ticket.id, input); refresh(); toast.success('Asignacion actualizada.'); }
    catch (cause) { const message = getApiErrorMessage(cause); setActionError({ ticketId: ticket.id, message }); toast.error(message); refresh(); }
    finally { setBusyId(null); }
  };

  const handleCancel = async (ticket: KitchenTicket) => {
    const { confirmed, reason } = await confirm({
      title: `Cancelar el pedido ${ticket.order?.orderNumber ?? ''}`.trim(),
      message:
        'Se cancela el pedido completo y se detiene su preparación. Se liberan las reservas y se devuelve el saldo de billetera usado. Los cobros online se intentan devolver si tienes permiso; efectivo, Yape y Plin pueden requerir una devolución manual en Pedidos. No se puede deshacer.',
      confirmLabel: 'Cancelar el pedido',
      cancelLabel: 'Volver al tablero',
      tone: 'danger',
      reasonLabel: 'Motivo de la cancelación',
      reasonRequired: true,
      reasonMinLength: 3,
      reasonMaxLength: 255,
      reasonHint: 'Explica lo ocurrido. Se guardará en el historial del pedido.',
    });
    if (!confirmed) return;
    if (!ticket.order) return;

    setBusyId(ticket.id);
    setActionError(null);
    try {
      // La cancelación de Pedidos también cierra esta comanda y atiende los cobros.
      const result = await adminApi.updateOrderStatus(ticket.order.orderNumber, 'CANCELLED', reason);
      setCancelFeedback({ orderNumber: ticket.order.orderNumber, message: result.message, pending: result.refundPending });
      if (result.refundPending) toast.warning(result.message);
      else toast.success(result.message);
      refresh();
    } catch (cancelError) {
      const message = getApiErrorMessage(cancelError);
      setActionError({ ticketId: ticket.id, message });
      toast.error(message);
      refresh();
    } finally {
      setBusyId(null);
    }
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

              {!kdsMode && <p className="mb-3 min-h-8 text-xs leading-4 text-ink-muted">{column.description}</p>}

              <div className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto">
                {columnTickets.length === 0 && <p className="rounded-field border border-dashed border-line bg-white/70 p-3 text-center text-xs text-ink-muted">No hay pedidos en esta etapa.</p>}
                {columnTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    isBusy={busyId !== null}
                    canOperate={canOperate && !isStale}
                    canCancel={canCancel && !isStale}
                    isFresh={freshIds.includes(ticket.id)}
                    isTarget={requestedTicket?.id === ticket.id}
                    actionError={actionError?.ticketId === ticket.id ? actionError.message : null}
                    canSeeOrders={can(PERM.ORDER_READ)}
                    canSeeInventory={can(PERM.INVENTORY_READ)}
                    canSeeCakes={can(PERM.KITCHEN_READ)}
                    canSeeDelivery={can(PERM.DELIVERY_READ) || can(PERM.DELIVERY_ASSIGN) || can(PERM.DELIVERY_OPERATE)}
                    canSeeDining={can(PERM.DINING_READ) || can(PERM.DINING_OPERATE)}
                    waitingMinutes={ticket.createdAt ? Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60_000)) : 0}
                    onPrint={printTicket}
                    onAdvance={handleAdvance}
                    onCancel={(target) => void handleCancel(target)}
                    onHold={(target) => void handleHold(target)}
                    onResume={(target) => void handleResume(target)}
                    onAssign={(target, input) => void handleAssign(target, input)}
                    currentUserId={currentUserId}
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
    <div className={cn(kdsMode && 'fixed inset-0 z-[1400] overflow-y-auto bg-surface-muted p-3 sm:p-5')}>
      <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-4', kdsMode && 'hidden')}>
        <PageHeader className="mb-0" eyebrow="Producción" icon={Utensils} title="Tablero de cocina" description="Acepta las comandas de tu sucursal, prepara cada producto y márcalo listo para la entrega. El tablero se actualiza en vivo y consulta al servidor cada 30 segundos como respaldo." />

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <BranchSelector value={branchId} branches={branches} onChange={changeBranch} hasError={Boolean(branchesError)} />

          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="size-4" />} disabled={!branchId} onClick={refresh}>Actualizar</Button>
          <span className="text-xs text-ink-muted">{freshnessLabel}</span>

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
                ...(stats.incidents > 0 ? [{ label: 'Incidencias', value: stats.incidents, tone: 'danger' as const }] : []),
                ...(stats.escalated > 0 ? [{ label: 'Escaladas', value: stats.escalated, tone: 'accent' as const }] : []),
                { label: 'Aceptacion media', value: `${stats.acceptedAvgMinutes} min` },
                { label: 'Preparacion media', value: `${stats.prepAvgMinutes} min` },
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
              <BranchSelector value={branchId} branches={branches} onChange={changeBranch} hasError={Boolean(branchesError)} />
              <Button size="sm" variant={isAlertOn ? 'outline' : 'ghost'} leftIcon={isAlertOn ? <Bell className="size-4" /> : <BellOff className="size-4" />} onClick={toggleAlert}>{isAlertOn ? 'Sonido activo' : 'Activar sonido'}</Button>
              <Button size="sm" variant="outline" leftIcon={<Zap className="size-4" />} onClick={() => setDevicePanelOpen((open) => !open)}>{devicePanelOpen ? 'Ocultar equipo' : 'Configurar equipo'}</Button>
              <Button size="sm" variant="outline" aria-label={device.isFullscreen ? 'Salir de pantalla completa' : 'Usar pantalla completa'} onClick={() => void device.toggleFullscreen()}>{device.isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
              <Button size="sm" onClick={toggleKdsMode}>Salir</Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-bold', realtime.status === 'connected' ? 'bg-brand-100 text-brand-800' : 'bg-accent-50 text-accent-700')}><Radio className="size-3.5" /> {realtime.status === 'connected' ? 'En vivo' : 'Reconectando'}</span>
            {stats && <><Badge variant={stats.scheduled ? 'warning' : 'neutral'}>Programados {stats.scheduled}</Badge><Badge variant={stats.queued ? 'warning' : 'neutral'}>En cola {stats.queued}</Badge><Badge variant="brand">Preparando {stats.preparing}</Badge><Badge variant="success">Listos {stats.ready}</Badge>{stats.incidents > 0 && <Badge variant="danger">Incidencias {stats.incidents}</Badge>}{stats.late > 0 && <Badge variant="danger">Con retraso {stats.late}</Badge>}</>}
            <span className="ml-auto text-[11px] font-semibold text-ink-muted">{freshnessLabel}</span>
          </div>
          <details className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
            <summary className="cursor-pointer font-bold text-brand-700">Cómo usar Cocina y qué hace cada botón</summary>
            <p className="mt-2 leading-5">Acepta la comanda, comprueba notas y alérgenos, empieza a preparar (se consumen insumos) y marca listo. Reparto retira los pedidos a domicilio; Salón sirve las mesas. En recojo, confirma la entrega aquí solo después de dar el pedido al cliente.</p>
          </details>
        </header>
      )}

      <Card className={cn('mb-4 overflow-hidden p-0', kdsMode && !devicePanelOpen && 'hidden')} shadow="e1">
        <div className="flex flex-col gap-3 border-b border-line bg-gradient-to-r from-brand-50 via-white to-accent-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="flex items-center gap-2 text-sm font-black text-ink"><Zap className="size-4 text-brand-700" /> Estado del equipo de cocina</p><p className="mt-1 text-xs text-ink-muted">Al abrir el turno, comprueba la conexión, el sonido y la impresión. KDS amplía el tablero para usarlo en una pantalla de cocina; pantalla completa solo cambia la vista del navegador.</p></div>
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
        <p className="border-t border-line px-4 py-2 text-xs leading-5 text-ink-muted">El sonido avisa de comandas nuevas en esta pestaña. Las alertas fuera de la app requieren permiso del navegador. La autoimpresión intenta imprimir comandas nuevas cuando el tablero las recibe; puede aparecer el diálogo de impresión del navegador. También puedes imprimir cada comanda desde su tarjeta.</p>
        {remotePush.error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">{remotePush.error}</p>}
      </Card>

      {attentionTickets.length > 0 && (
        <div role="alert" className="mb-4 flex flex-col gap-3 rounded-card border border-red-300 bg-red-50 px-4 py-3 text-red-800 shadow-e2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-black"><Bell className="mt-0.5 size-4 shrink-0" /><span>{attentionTickets.length} {attentionTickets.length === 1 ? 'pedido lleva' : 'pedidos llevan'} más de 2 minutos sin aceptar. Revisa la columna En cola y acepta los que puedas preparar.</span></p>
          <Button size="sm" onClick={() => document.getElementById(`kitchen-ticket-${attentionTickets[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Ver urgente</Button>
        </div>
      )}

      {!kdsMode && <OperationFlowGuide stage="kitchen" branchName={activeBranchName} />}

      {!canOperate && branchId && (
        <p role="status" className="mb-4 rounded-card border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-800">
          Tu acceso a Cocina es de consulta. Puedes revisar e imprimir comandas, pero tu rol no permite aceptar, preparar ni marcar pedidos como listos.
        </p>
      )}

      {!kdsMode && (
        <Card className="mb-4 border-brand-200 bg-brand-50/40 p-4 sm:p-5" shadow="e1">
          <h2 className="text-base font-black text-ink">¿Qué hace Cocina y en qué orden?</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">Aquí se trabajan las comandas de la sucursal seleccionada. Cada tarjeta muestra productos, cantidades, cambios, alérgenos, notas, destino y hora objetivo. La columna indica quién debe actuar ahora.</p>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            <li className="rounded-card border border-line bg-white p-3"><strong className="text-sm text-ink">1. Revisa el pedido confirmado</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Los programados aparecen en Agenda desde su confirmación. Las tortas tienen etapas en Producción desde ese momento; la comanda de cierre entra en la cola según el trabajo previsto para el día de entrega.</p></li>
            <li className="rounded-card border border-line bg-white p-3"><strong className="text-sm text-ink">2. Revisa y prepara</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Antes de empezar, revisa personalizaciones, instrucciones y alérgenos. Empezar registra el consumo en Inventario.</p></li>
            <li className="rounded-card border border-line bg-white p-3"><strong className="text-sm text-ink">3. Marca listo y entrega</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Al terminar, marca listo. Reparto retira el delivery, Salón atiende la mesa y Cocina confirma el recojo en mostrador tras entregarlo.</p></li>
          </ol>
          <p className="mt-3 text-xs leading-5 text-ink-muted">Si un pedido dice «Cobrar al entregar», Cocina solo lo prepara: la cobranza corresponde al equipo que hace la entrega o al Salón.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-brand-200 pt-3 text-xs font-bold">
            {can(PERM.ORDER_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminOrders}>Ver pedidos y pagos →</Link>}
            {can(PERM.INVENTORY_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminInventory}>Revisar insumos →</Link>}
            {can(PERM.KITCHEN_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminCakes}>Tortas: pestaña Producción →</Link>}
            {(can(PERM.DELIVERY_READ) || can(PERM.DELIVERY_ASSIGN) || can(PERM.DELIVERY_OPERATE)) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminDelivery}>Abrir Reparto →</Link>}
            {(can(PERM.DINING_READ) || can(PERM.DINING_OPERATE)) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminDining}>Abrir Salón →</Link>}
          </div>
        </Card>
      )}

      {cancelFeedback && (
        <div role="status" className={cn('mb-4 rounded-card border px-4 py-3 text-sm', cancelFeedback.pending ? 'border-accent-300 bg-accent-50 text-accent-800' : 'border-brand-200 bg-brand-50 text-brand-800')}>
          <strong>{cancelFeedback.orderNumber}: </strong>{cancelFeedback.message}{' '}
          {can(PERM.ORDER_READ) && <Link className="font-bold underline" to={`${ROUTES.adminOrders}?q=${encodeURIComponent(cancelFeedback.orderNumber)}`}>Abrir en Pedidos →</Link>}
        </div>
      )}

      {requestedOrderNumber && !isLoading && data && !requestedTicket && !requestedScheduled && (
        <div role="status" className="mb-4 rounded-card border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-800">
          El pedido <strong>{requestedOrderNumber}</strong> no tiene una comanda activa en esta cocina. Puede estar pendiente de pago, fuera de la agenda de siete días, despachado o cerrado. Comprueba la sucursal seleccionada.
          {can(PERM.ORDER_READ) && <> <Link className="font-bold underline" to={`${ROUTES.adminOrders}?q=${encodeURIComponent(requestedOrderNumber)}`}>Buscar en Pedidos →</Link></>}
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
            <span>Sin conexión con el servidor · {freshnessLabel}. Puede haber pedidos que no ves. {isStale && 'Las acciones se pausaron hasta recuperar datos recientes.'}</span>
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
            <p className="text-xs text-ink-muted">Los pedidos de torta ya tienen un plan de producción. Revisa las etapas de hoy; la comanda de cierre se activará antes de la entrega.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scheduledOrders.map((order) => <ScheduledOrderCard key={order.id} order={order} branchId={branchId!} isTarget={requestedScheduled?.id === order.id} />)}
          </div>
        </section>
      )}

      {content}
    </div>
  );
};

export default KitchenPage;
