import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChefHat, CircleCheck, ClipboardList, Clock3, Eye, MapPin, ReceiptText, RefreshCw, Search, ShoppingBag, Store, Truck, WifiOff, XCircle } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Spinner } from '@components/ui/Spinner';
import { Pagination } from '@components/ui/Pagination';
import { FilterPills } from '@components/ui/FilterPills';
import { StickyActionBar } from '@components/ui/StickyActionBar';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { useReceiptSettings } from '@services/businessInfo';
import { formatCurrency, formatDate, formatRelative } from '@lib/format';
import { useDebounce } from '@hooks/useDebounce';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import { KitchenStatusBadge } from '../components/StatusBadges';
import { OrderDetailPanel } from '../components/OrderDetailPanel';
import { OperationFlowGuide } from '../components/OperationFlowGuide';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';
import type { AdminOrderRow, AdminOrderStatus } from '../types';
import type { PaginationMeta } from '@/types/api';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING_PAYMENT', label: 'Esperando pago' },
  { value: 'CONFIRMED,PREPARING,READY', label: 'En curso' },
  { value: 'OUT_FOR_DELIVERY', label: 'En camino' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'CANCELLED', label: 'Cancelados' },
  { value: 'REFUNDED', label: 'Devueltos' },
];

const PAYMENT_SUMMARY_LABELS: Record<string, string> = {
  NO_PAYMENT: 'Sin cobro',
  PENDING_PAYMENT: 'Pago pendiente',
  REVIEW: 'Yape/Plin por verificar',
  OBSERVED: 'Pago observado',
  PAID: 'Pagado',
  FAILED: 'Cobro fallido',
  REFUND_PENDING: 'Devolución pendiente',
};

type OrderPeriod = 'all' | '7' | '30' | 'custom';
const limaToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftDate = (iso: string, days: number): string => {
  const date = new Date(`${iso}T12:00:00-05:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

const STATUS_HELP = [
  ['Esperando pago', 'Revisa el cobro en Detalles. Cocina aún no debe prepararlo.'],
  ['En curso', 'Incluye confirmados, en preparación y listos. Abre Detalles para ver quién debe actuar.'],
  ['En camino', 'Reparto tiene la entrega; consulta su avance antes de responder al cliente.'],
  ['Entregados', 'La entrega terminó. Revisa el ticket, el cobro y el comprobante si aplica.'],
  ['Cancelados', 'Consulta el motivo y verifica si quedó una devolución pendiente.'],
] as const;

/**
 * Espejo de `ORDER_STATUS_FLOW` del backend, recortado a lo que acepta el endpoint.
 *
 * CONFIRMED no aparece a proposito: un pedido solo pasa a confirmado por un webhook
 * de pago con firma valida (RN-015). Y REFUNDED lo produce el reembolso, no un
 * cambio manual de estado.
 *
 * Antes esta tabla no existia: teniendo `order.update_status` no se ofrecia NINGUNA
 * transicion hacia adelante, y "Cancelar" solo se pintaba en CONFIRMED o
 * PENDING_PAYMENT, asi que un pedido ya en preparacion no se podia ni cancelar.
 */
const CANCELLABLE_STATUSES = new Set<AdminOrderStatus>([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
]);

const nextStepCopy = (order: AdminOrderRow, internalOnly = false): string => {
  if (order.status === 'PENDING_PAYMENT') return 'Revisar el cobro en Detalles; todavía no enviarlo a Cocina';
  if (order.status === 'CONFIRMED' && !order.kitchenTicket && order.cakeTasks?.length) {
    const pending = order.cakeTasks.filter((task) => task.status !== 'DONE');
    if (pending.some((task) => task.status === 'BLOCKED')) return 'Producción bloqueada; resolver la etapa antes de entregar';
    if (pending.some((task) => !task.assigned)) return 'Asignar responsables en Producción de tortas';
    if (pending.length) return `Producción planificada: siguiente etapa ${pending[0].workDate}`;
    return 'Producción terminada; revisar comanda de cierre y entrega';
  }
  if (order.status === 'CONFIRMED' && order.serviceMode === 'SCHEDULED' && order.scheduledAt) {
    return `Programado para ${formatDate(order.scheduledAt)}; entrará a Cocina al iniciar su preparación`;
  }
  if (order.status === 'CONFIRMED') return 'Cocina debe aceptar y comenzar';
  if (order.status === 'PREPARING') return 'Cocina debe marcarlo como listo';
  if (order.status === 'READY') {
    if (order.deliveryType === 'DELIVERY') return 'Reparto debe recogerlo';
    if (order.deliveryType === 'DINE_IN') return 'Servir, cobrar y liberar mesa en Salón';
    return 'Entregar en mostrador';
  }
  if (order.status === 'OUT_FOR_DELIVERY') return 'Confirmar entrega al cliente';
  if (order.status === 'DELIVERED') return internalOnly ? 'Ticket interno disponible' : order.invoiceStatus === 'ISSUED' ? 'Comprobante emitido y disponible' : 'Revisar emisión del comprobante';
  return order.status === 'CANCELLED' ? 'Pedido cerrado por cancelación' : 'Pedido cerrado';
};

const attentionFor = (order: AdminOrderRow): { late: boolean; label: string } => {
  if (['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status)) return { late: false, label: 'Cerrado' };
  if (order.cakeTasks?.length) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const pending = order.cakeTasks.filter((task) => task.status !== 'DONE');
    if (pending.some((task) => task.workDate < today)) return { late: true, label: 'Producción atrasada' };
    if (pending.some((task) => task.status === 'BLOCKED')) return { late: true, label: 'Producción bloqueada' };
    if (pending.some((task) => task.workDate === today)) return { late: false, label: 'Producción para hoy' };
  }
  if (order.serviceMode === 'SCHEDULED' && order.scheduledAt && new Date(order.scheduledAt).getTime() > Date.now()) {
    return { late: false, label: `Programado ${formatDate(order.scheduledAt)}` };
  }
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(order.placedAt).getTime()) / 60_000));
  const limit = order.status === 'CONFIRMED' ? 10 : order.status === 'PREPARING' ? 25 : order.status === 'READY' ? 15 : order.status === 'OUT_FOR_DELIVERY' ? 40 : 15;
  return { late: minutes > limit, label: minutes < 60 ? `Hace ${minutes} min` : formatRelative(order.placedAt) };
};

/** Tablero de pedidos en tiempo real (seccion 9.7). */
const AdminOrdersPage = () => {
  const { can, isSuperAdmin } = usePermissions();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const canCancel = can(PERM.ORDER_CANCEL);
  const canManageInvoices = can(PERM.INVOICE_MANAGE);
  const receiptSettings = useReceiptSettings();
  const internalOnly = receiptSettings.mode === 'INTERNAL_ONLY';

  /**
   * Los filtros viven en la URL, no en `useState`: asi sobreviven a entrar en una
   * ficha y volver, y el enlace se le puede pasar a un companero ("mira estos").
   */
  const [params, setParams] = useSearchParams();
  const status = params.get('estado') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const urlSearch = params.get('q') ?? '';
  const sourceParam = params.get('origen');
  const source = sourceParam === 'WEB' || sourceParam === 'POS' ? sourceParam : undefined;
  const deliveryTypeParam = params.get('modalidad');
  const deliveryType = deliveryTypeParam === 'DELIVERY' || deliveryTypeParam === 'PICKUP' || deliveryTypeParam === 'DINE_IN'
    ? deliveryTypeParam
    : undefined;
  const today = limaToday();
  const periodParam = params.get('periodo');
  const period: OrderPeriod = periodParam === '7' || periodParam === '30' || periodParam === 'custom' ? periodParam : 'all';
  const customFrom = params.get('desde') ?? shiftDate(today, -29);
  const customTo = params.get('hasta') ?? today;
  const dateRange = useMemo(() => {
    if (period === '7') return { from: shiftDate(today, -6), to: today };
    if (period === '30') return { from: shiftDate(today, -29), to: today };
    if (period === 'custom') return { from: customFrom, to: customTo };
    return { from: undefined, to: undefined };
  }, [customFrom, customTo, period, today]);

  // El input necesita estado local para responder a cada tecla; la URL solo se
  // reescribe cuando el usuario deja de escribir.
  const [search, setSearch] = useState(urlSearch);
  const debouncedSearch = useDebounce(search, 400);
  const lastUrlSearch = useRef(urlSearch);
  const skipSearchWrite = useRef(false);

  const updateParams = useCallback(
    (changes: Record<string, string>, resetPage = true) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (resetPage) next.delete('pagina');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (lastUrlSearch.current === urlSearch) return;
    lastUrlSearch.current = urlSearch;
    skipSearchWrite.current = true;
    setSearch(urlSearch);
  }, [urlSearch]);
  useEffect(() => {
    if (skipSearchWrite.current) {
      skipSearchWrite.current = false;
      return;
    }
    if (debouncedSearch !== urlSearch) {
      lastUrlSearch.current = debouncedSearch;
      updateParams({ q: debouncedSearch });
    }
  }, [debouncedSearch, urlSearch, updateParams]);

  const { branchId, branches, setBranchId, setGlobalScope, isLoadingBranches, branchesError, reloadBranches } =
    useActiveBranch({ allowAll: isSuperAdmin });

  const fetcher = useCallback(
    (signal: AbortSignal) =>
      adminApi.orders(
        {
          branchId: branchId ?? undefined,
          status: status || undefined,
          search: urlSearch || undefined,
          source: source || undefined,
          deliveryType: deliveryType || undefined,
          from: dateRange.from,
          to: dateRange.to,
          page,
        },
        signal,
      ),
    [branchId, dateRange.from, dateRange.to, deliveryType, page, source, status, urlSearch],
  );

  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<{
    rows: AdminOrderRow[];
    meta: PaginationMeta;
    summary?: { totalAmount: number; counts: Record<string, number>; paymentCounts: Record<string, number>; pendingPaymentAmount: number; pendingRefundAmount: number };
  }>(fetcher, 8000);

  // `usePolling` limpia `data` al cambiar de filtro, y sin esto la pantalla entera
  // volvia al spinner y dejaba al usuario sin los controles que acababa de tocar.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (data) setHasLoadedOnce(true);
  }, [data]);

  const orders = useMemo(() => data?.rows ?? [], [data]);
  const meta = data?.meta ?? null;
  const summary = data?.summary;
  const activeBranchName = branches.find((branch) => branch.id === branchId)?.name ?? null;
  /** Filtro o pagina nuevos: hay peticion en vuelo y todavia no hay respuesta. */
  const isRefetching = data === null && hasLoadedOnce && error === null;
  const delayedOrders = orders.filter((order) => attentionFor(order).late)
    .sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());
  const metrics = [
    { label: 'Por atender', value: summary?.counts.CONFIRMED ?? orders.filter((order) => order.status === 'CONFIRMED').length, icon: Clock3, tone: 'accent' as const },
    { label: 'En cocina', value: summary?.counts.PREPARING ?? orders.filter((order) => order.status === 'PREPARING').length, icon: ChefHat, tone: 'brand' as const },
    { label: 'Listos', value: summary?.counts.READY ?? orders.filter((order) => order.status === 'READY').length, icon: CircleCheck, tone: 'brand' as const },
    { label: 'En reparto', value: summary?.counts.OUT_FOR_DELIVERY ?? orders.filter((order) => order.status === 'OUT_FOR_DELIVERY').length, icon: Truck, tone: 'neutral' as const },
    { label: 'Alertas visibles', value: delayedOrders.length, icon: AlertTriangle, tone: delayedOrders.length ? 'danger' as const : 'neutral' as const },
    { label: 'Pagos pendientes', value: (summary?.paymentCounts.REVIEW ?? 0) + (summary?.paymentCounts.OBSERVED ?? 0), icon: ReceiptText, tone: 'accent' as const },
    { label: 'Devoluciones', value: summary?.paymentCounts.REFUND_PENDING ?? 0, icon: XCircle, tone: 'danger' as const },
    { label: 'Cancelados', value: summary?.counts.CANCELLED ?? 0, icon: XCircle, tone: 'neutral' as const },
    { label: 'Devueltos', value: summary?.counts.REFUNDED ?? 0, icon: CircleCheck, tone: 'brand' as const },
  ];

  // --- Seleccion para acciones masivas ---
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = useMemo(
    () => orders.filter((order) => CANCELLABLE_STATUSES.has(order.status as AdminOrderStatus)),
    [orders],
  );
  // La seleccion no puede sobrevivir a un cambio de pagina o de filtro: cancelaria
  // pedidos que el usuario ya no tiene delante.
  useEffect(() => {
    setSelected([]);
  }, [status, urlSearch, page, branchId]);
  useEffect(() => {
    const allowed = new Set(selectable.map((order) => order.orderNumber));
    setSelected((current) => current.every((number) => allowed.has(number))
      ? current : current.filter((number) => allowed.has(number)));
  }, [selectable]);

  const toggle = (orderNumber: string) =>
    setSelected((current) =>
      current.includes(orderNumber)
        ? current.filter((item) => item !== orderNumber)
        : [...current, orderNumber],
    );

  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const toggleAll = () =>
    setSelected(allSelected ? [] : selectable.map((order) => order.orderNumber));

  // --- Acciones ---
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const detailOrder = params.get('pedido');
  const setDetailOrder = (orderNumber: string | null) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (orderNumber) next.set('pedido', orderNumber); else next.delete('pedido');
    return next;
  }, { replace: true });
  const [refundAttention, setRefundAttention] = useState<string[]>([]);
  const filtersActive = Boolean(status || urlSearch || source || deliveryType || period !== 'all');
  const clearFilters = () => {
    setSearch('');
    updateParams({ estado: '', q: '', origen: '', modalidad: '', periodo: '', desde: '', hasta: '' });
  };

  const cancelCopy = (count: number, selectedOrders: AdminOrderRow[] = []) => {
    const paymentWarning = selectedOrders.length ? 'Revisa los pagos de los pedidos seleccionados antes de cancelar. ' : '';
    return ({
    title: count === 1 ? 'Cancelar el pedido' : `Cancelar ${count} pedidos`,
    message:
      `Se libera el cupo de la franja, se restaura el stock que corresponda y se cierran las tareas de Cocina y Reparto. ${can(PERM.PAYMENT_REFUND) ? 'Se intentarán devolver los cobros online. Efectivo, Yape y Plin requieren entregar el dinero antes de registrar la devolución en Detalles.' : 'Los cobros confirmados quedarán pendientes para alguien con permiso de reembolsos.'} ${paymentWarning}${count > 1 ? 'El mismo motivo se aplicará a todos los pedidos seleccionados. ' : ''}La cancelación no se puede deshacer.`,
    confirmLabel: count === 1 ? 'Cancelar el pedido' : `Cancelar ${count} pedidos`,
    cancelLabel: 'Volver',
    tone: 'danger' as const,
    reasonLabel: 'Motivo (se guarda en el historial del pedido)',
    reasonHint: 'De 4 a 255 caracteres. Se guarda en el historial; revisa después si el cobro necesita devolución.',
    reasonRequired: true,
    reasonMinLength: 4,
    reasonMaxLength: 255,
    });
  };

  const changeStatus = async (order: AdminOrderRow, next: 'CANCELLED') => {
    let reason = '';

    if (next === 'CANCELLED') {
      // El motivo estaba HARDCODEADO ("Cancelado desde el panel") y no habia ni una
      // confirmacion: un toque cancelaba un pedido pagado.
      const answer = await confirm(cancelCopy(1, [order]));
      if (!answer.confirmed) return;
      reason = answer.reason;
    }

    setBusyOrder(order.orderNumber);
    try {
      const result = await adminApi.updateOrderStatus(
        order.orderNumber,
        next,
        reason || undefined,
      );
      // El servidor avisa aqui cuando queda un cobro sin devolver. Ese mensaje se
      // estaba tirando a la basura (`updateOrderStatus` devolvia `void`) y el dinero
      // se quedaba sin devolver en silencio. `refundPending` viaja en la respuesta;
      // El contrato incluye `refundPending` para no confundir cancelación con devolución.
      const pending = result.refundPending;
      if (pending) {
        setRefundAttention((current) => [...new Set([...current, order.orderNumber])]);
        toast.warning(result.message);
      }
      else toast.success(result.message);
      refresh();
    } catch (actionError) {
      toast.error(getApiErrorMessage(actionError));
    } finally {
      setBusyOrder(null);
    }
  };

  const cancelSelected = async () => {
    const answer = await confirm(cancelCopy(selected.length, orders.filter((order) => selected.includes(order.orderNumber))));
    if (!answer.confirmed) return;

    setIsBulkRunning(true);
    // Secuencial a proposito: cada cancelacion bloquea la fila del pedido y la de
    // su franja horaria, y lanzarlas a la vez solo produce esperas y reintentos.
    const failed: string[] = [];
    const pendingRefunds: string[] = [];
    for (const orderNumber of selected) {
      try {
        const result = await adminApi.updateOrderStatus(orderNumber, 'CANCELLED', answer.reason);
        if (result.refundPending) pendingRefunds.push(orderNumber);
      } catch (bulkError) {
        failed.push(`${orderNumber}: ${getApiErrorMessage(bulkError)}`);
      }
    }
    setIsBulkRunning(false);
    setSelected([]);
    refresh();
    if (pendingRefunds.length) setRefundAttention((current) => [...new Set([...current, ...pendingRefunds])]);

    const done = selected.length - failed.length;
    if (failed.length) toast.error(`${done} de ${selected.length} cancelados. ${failed[0]}`);
    else if (pendingRefunds.length) toast.warning(`${done} pedidos cancelados; ${pendingRefunds.length} requieren revisar su devolución.`);
    else toast.success(`${done} pedidos cancelados`);
  };

  const header = (
    <PageHeader
      eyebrow="Operaciones"
      icon={ClipboardList}
      title="Gestión de pedidos"
      description="Consulta qué pidió el cliente, verifica pagos y sigue la preparación y la entrega desde una sola lista."
      action={
        <>
          <BranchSelector
            value={branchId}
            branches={branches}
            onChange={setBranchId}
            allowAll={isSuperAdmin}
            onSelectAll={setGlobalScope}
            hasError={Boolean(branchesError)}
          />
          <Button
            variant="outline"
            size="sm"
            isLoading={isLoading && hasLoadedOnce}
            leftIcon={<RefreshCw className="size-4" />}
            onClick={() => refresh()}
          >
            Actualizar
          </Button>
        </>
      }
    />
  );

  if (branchesError) {
    return (
      <div>
        {header}
        <LoadError message={branchesError} onRetry={() => void reloadBranches()} />
      </div>
    );
  }

  if ((isLoading && !hasLoadedOnce) || isLoadingBranches) return <PageLoader />;

  /** Celda de acciones: ficha + transiciones permitidas por el estado actual. */
  const rowActions = (order: AdminOrderRow) => {
    const cancellable = canCancel && CANCELLABLE_STATUSES.has(order.status as AdminOrderStatus);
    const kitchenActive = order.kitchenTicket
      && !['DISPATCHED', 'CANCELLED'].includes(order.kitchenTicket.status);

    return (
      <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
        <Button size="sm" variant={!internalOnly && canManageInvoices && order.status === 'DELIVERED' && order.invoiceStatus !== 'ISSUED' ? 'primary' : 'outline'} leftIcon={!internalOnly && canManageInvoices && order.status === 'DELIVERED' && order.invoiceStatus !== 'ISSUED' ? <ReceiptText className="size-4" /> : <Eye className="size-4" />} onClick={() => setDetailOrder(order.orderNumber)}>
          {!internalOnly && canManageInvoices && order.status === 'DELIVERED' && order.invoiceStatus !== 'ISSUED' ? 'Detalle y comprobante' : internalOnly && order.status === 'DELIVERED' ? 'Pedido y ticket' : 'Ver detalles'}
        </Button>

        {kitchenActive && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<ChefHat className="size-4" />}
            onClick={() => navigate(`${ROUTES.adminKitchen}?pedido=${encodeURIComponent(order.orderNumber)}&branchId=${order.branch?.id ?? ''}`)}
          >
            Ver en Cocina
          </Button>
        )}

        {order.paymentSummary && ['REVIEW', 'OBSERVED', 'REFUND_PENDING'].includes(order.paymentSummary.state) && (
          <Button size="sm" variant="outline" onClick={() => navigate(`${ROUTES.adminDirectPayments}?pedido=${encodeURIComponent(order.orderNumber)}`)}>
            Revisar pago
          </Button>
        )}

        {cancellable && <Button size="sm" variant="ghost" disabled={isBulkRunning || busyOrder !== null} onClick={() => void changeStatus(order, 'CANCELLED')} className="text-red-700">Cancelar</Button>}
      </div>
    );
  };

  const bulkLabel =
    selected.length === 1 ? '1 pedido seleccionado' : `${selected.length} pedidos seleccionados`;

  return (
    <div className={selected.length > 0 ? 'pb-24 xl:pb-0' : undefined}>
      {header}

      <OperationFlowGuide stage="orders" branchName={activeBranchName} />

      <Card className="mb-4 border-brand-200 bg-brand-50/40 p-4 sm:p-5" shadow="e1">
        <h2 className="text-base font-black text-ink">Qué hacer en esta pantalla</h2>
        <p className="mt-1 text-sm text-ink-muted">Este es el seguimiento de pedidos de clientes. Las órdenes para comprar insumos se gestionan en Compras.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-brand-100 bg-white p-3">
            <strong className="text-sm text-ink">1. Encuentra el pedido</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Filtra por estado o busca su número, el nombre o el teléfono del cliente. Selecciona la cocina para acotar la lista.</p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-3">
            <strong className="text-sm text-ink">2. Abre Detalles</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Comprueba productos, indicaciones, contacto, pago, entrega e historial antes de responder o actuar.</p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-3">
            <strong className="text-sm text-ink">3. Sigue la siguiente etapa</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Cocina prepara; Reparto entrega a domicilio; Salón atiende mesas. Aquí puedes revisar incidencias, registrar datos del pedido y cancelar con un motivo si tu rol lo permite.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-brand-700">
          {(can(PERM.KITCHEN_READ) || can(PERM.KITCHEN_OPERATE)) && <Link className="hover:underline" to={ROUTES.adminKitchen}>Ir a Cocina →</Link>}
          {(can(PERM.DELIVERY_READ) || can(PERM.DELIVERY_ASSIGN) || can(PERM.DELIVERY_OPERATE)) && <Link className="hover:underline" to={ROUTES.adminDelivery}>Ir a Reparto →</Link>}
          {(can(PERM.DINING_READ) || can(PERM.DINING_OPERATE)) && <Link className="hover:underline" to={ROUTES.adminDining}>Ir a Salón →</Link>}
          {(can(PERM.REPORT_SALES_READ) || can(PERM.PAYMENT_VERIFY)) && <Link className="hover:underline" to={ROUTES.adminCash}>Ir a Caja →</Link>}
        </div>
        <details className="mt-4 rounded-lg border border-line bg-white px-3 py-2 text-sm">
          <summary className="cursor-pointer font-bold text-ink">Qué significa cada filtro de estado</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {STATUS_HELP.map(([label, meaning]) => <div key={label}><dt className="font-bold text-ink">{label}</dt><dd className="text-xs leading-5 text-ink-muted">{meaning}</dd></div>)}
          </dl>
        </details>
      </Card>

      {refundAttention.length > 0 && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="size-5 shrink-0" />
          <div className="min-w-0 flex-1"><strong>Revisar devolución pendiente</strong><p className="mt-1 text-xs">La cancelación se registró, pero el reembolso requiere seguimiento en {refundAttention.join(', ')}. Abre Detalles y revisa el cobro.</p></div>
          <Button size="sm" variant="outline" onClick={() => setDetailOrder(refundAttention[0])}>Abrir pedido</Button>
          <Button size="sm" variant="ghost" onClick={() => setRefundAttention([])}>Entendido</Button>
        </div>
      )}

      <Card className="mb-4 p-4" shadow="e1">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><p className="font-extrabold text-ink">Pulso de la operación</p><p className="text-xs text-ink-muted">Conteos del filtro actual · actualización automática cada 8 segundos</p></div>
          {meta && <p className="text-xs font-semibold text-ink-muted">{meta.total} pedidos en el filtro{summary ? ` · ${formatCurrency(summary.totalAmount)}` : ''}</p>}
        </div>
        <OperationsMetricStrip metrics={metrics} ariaLabel="Estado operativo de pedidos" />
        {summary && <p className="mt-3 text-xs text-ink-muted">Pagos por atender: {formatCurrency(summary.pendingPaymentAmount)} · Devoluciones pendientes: {formatCurrency(summary.pendingRefundAmount)}</p>}
      </Card>

      {delayedOrders.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-card border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-card bg-red-100 text-red-700"><AlertTriangle className="size-5" /></span>
          <div className="min-w-0 flex-1"><p className="font-bold text-red-800">{delayedOrders.length === 1 ? '1 pedido necesita seguimiento' : `${delayedOrders.length} pedidos necesitan seguimiento`}</p><p className="mt-0.5 text-xs leading-relaxed text-red-700">Revisa primero: {delayedOrders.slice(0, 4).map((order) => order.orderNumber).join(', ')}{delayedOrders.length > 4 ? '…' : ''}. Esta señal orientativa compara el estado con el tiempo desde que se hizo el pedido; verifica la situación real en Detalles.</p></div>
          <Button size="sm" variant="outline" onClick={() => setDetailOrder(delayedOrders[0].orderNumber)}>Revisar el más antiguo</Button>
        </div>
      )}

      {/* Datos viejos: sin esta banda una red caida se pintaba como "No hay pedidos". */}
      {isStale && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <WifiOff className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Sin conexion con el servidor. La lista es de{' '}
            {lastSuccessAt ? formatRelative(new Date(lastSuccessAt)) : 'antes'}.
          </span>
          <Button size="sm" variant="outline" onClick={() => refresh()}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-e1 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterPills
          options={STATUS_FILTERS}
          value={status}
          onChange={(value) => updateParams({ estado: value })}
          ariaLabel="Filtrar pedidos por estado"
        />

        <select aria-label="Filtrar pedidos por origen" className="min-h-10 rounded-field border border-line bg-surface-muted px-2 text-xs" value={source ?? ''} onChange={(event) => updateParams({ origen: event.target.value })}>
          <option value="">Todos los orígenes</option><option value="WEB">Web</option><option value="POS">POS / Salón</option>
        </select>
        <select aria-label="Filtrar pedidos por modalidad" className="min-h-10 rounded-field border border-line bg-surface-muted px-2 text-xs" value={deliveryType ?? ''} onChange={(event) => updateParams({ modalidad: event.target.value })}>
          <option value="">Todas las modalidades</option><option value="DELIVERY">Delivery</option><option value="PICKUP">Recojo</option><option value="DINE_IN">Salón</option>
        </select>
        <select aria-label="Filtrar pedidos por periodo" className="min-h-10 rounded-field border border-line bg-surface-muted px-2 text-xs" value={period} onChange={(event) => { const value = event.target.value as OrderPeriod; updateParams({ periodo: value === 'all' ? '' : value, desde: value === 'custom' ? customFrom : '', hasta: value === 'custom' ? customTo : '' }); }}>
          <option value="all">Todo el historial</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="custom">Periodo personalizado</option>
        </select>
        {period === 'custom' && <div className="flex flex-wrap gap-2"><input aria-label="Desde pedidos" type="date" value={customFrom} max={customTo} onChange={(event) => updateParams({ desde: event.target.value })} className="min-h-10 rounded-field border border-line bg-surface-muted px-2 text-xs" /><input aria-label="Hasta pedidos" type="date" value={customTo} min={customFrom} max={today} onChange={(event) => updateParams({ hasta: event.target.value })} className="min-h-10 rounded-field border border-line bg-surface-muted px-2 text-xs" /></div>}

        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          {/* Sin `toUpperCase()`: forzaba mayusculas porque solo se buscaba por
              numero de pedido, y con el cliente al telefono hay que buscarlo por su
              nombre. El servidor busca en numero, nombre y telefono. */}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="N.o de pedido, nombre o telefono"
            aria-label="Buscar pedidos"
            className="h-11 w-full rounded-field border border-line bg-surface-muted pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-surface sm:w-72"
          />
        </div>
        {filtersActive && <Button size="sm" variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>}
      </div>
      <p className="mt-2 text-xs text-ink-muted">La lista se actualiza cada 8 segundos. Los filtros y la búsqueda no cambian el estado de ningún pedido.</p>

      {/* El fallo de carga se pintaba como "No hay pedidos": se ramifica ANTES de
          mirar la longitud de la lista. Y mientras se recarga por un filtro nuevo
          tampoco se afirma que no hay nada: todavia no se ha preguntado. */}
      {error && orders.length === 0 ? (
        <LoadError className="mt-4" message={error} onRetry={() => refresh()} />
      ) : isRefetching ? (
        <div className="mt-4 grid place-items-center rounded-card border border-line bg-surface py-16 shadow-e1">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-card border border-line bg-surface shadow-e1 md:block">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">
                Pedidos filtrados, con su estado, cocina, importe y acciones
              </caption>
              <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  {canCancel && (
                    <th scope="col" className="w-10 p-3">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los pedidos cancelables"
                        className="size-4 accent-brand-600"
                        checked={allSelected}
                        disabled={selectable.length === 0 || isBulkRunning}
                        onChange={toggleAll}
                      />
                    </th>
                  )}
                  <th scope="col" className="p-3">Pedido</th>
                  <th scope="col" className="p-3">Estado</th>
                  <th scope="col" className="p-3">Cocina</th>
                  <th scope="col" className="p-3">Contenido</th>
                  <th scope="col" className="p-3">Total</th>
                  <th scope="col" className="p-3">Antigüedad</th>
                  <th scope="col" className="p-3 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className={attentionFor(order).late ? 'border-b border-l-4 border-b-line border-l-red-500 bg-red-50/35 last:border-b-0' : 'border-b border-l-4 border-b-line border-l-transparent last:border-b-0'}>
                    {canCancel && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${order.orderNumber}`}
                          className="size-4 accent-brand-600"
                          checked={selected.includes(order.orderNumber)}
                          disabled={isBulkRunning || !CANCELLABLE_STATUSES.has(order.status as AdminOrderStatus)}
                          onChange={() => toggle(order.orderNumber)}
                        />
                      </td>
                    )}
                    <td className="p-3">
                      <p className="flex flex-wrap items-center gap-1.5 font-mono font-extrabold text-ink">{order.orderNumber}{attentionFor(order).late && <span className="rounded-pill bg-red-100 px-1.5 py-0.5 font-sans text-[9px] font-extrabold uppercase tracking-wide text-red-700">Prioridad</span>}</p>
                      <p className="text-xs text-ink-muted">
                        {order.deliveryType === 'DELIVERY' ? 'Delivery' : order.deliveryType === 'DINE_IN' ? 'Salón' : 'Recojo'}
                        {order.contactName ? ` · ${order.contactName}` : ''}
                      </p>
                      {order.source !== 'POS' && !order.customerContactJson && ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status) && <p className="mt-1 text-xs font-semibold text-brand-700">Contacto inicial pendiente</p>}
                      <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                        {order.deliveryType === 'DELIVERY' ? <MapPin className="size-3" /> : <Store className="size-3" />}
                        {order.deliveryType === 'DELIVERY'
                          ? order.addressSnapshotJson?.districtName ?? order.addressSnapshotJson?.line1 ?? 'Destino sin distrito'
                          : order.deliveryType === 'DINE_IN'
                            ? `${order.diningTable?.code ?? 'Mesa'} · ${order.branch?.name ?? activeBranchName ?? 'Sucursal'}`
                            : order.branch?.name ?? activeBranchName ?? 'Sucursal de recojo'}
                      </p>
                    </td>
                    <td className="p-3">
                      <OrderStatusBadge status={order.status} />
                      <p className="mt-1.5 max-w-44 text-[11px] font-medium leading-relaxed text-ink-muted">Siguiente: {nextStepCopy(order, internalOnly)}</p>
                    </td>
                    <td className="p-3">
                      {order.kitchenTicket ? (
                        <KitchenStatusBadge status={order.kitchenTicket.status} />
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                      {Boolean(order.cakeTasks?.length) && <p className="mt-1.5 text-xs font-semibold text-brand-700">Torta: {order.cakeTasks?.filter((task) => task.status === 'DONE').length}/{order.cakeTasks?.length} etapas</p>}
                    </td>
                    <td className="p-3 text-xs text-ink-muted">
                      <p className="font-bold text-ink">{order.items.reduce((total, item) => total + item.quantity, 0)} platos</p>
                      <p className="mt-1 line-clamp-2 max-w-56">{order.items.map((item) => `${item.quantity}× ${item.productNameSnapshot}`).join(', ')}</p>
                    </td>
                    <td className="p-3 font-medium"><p>{formatCurrency(order.grandTotal)}</p>{order.paymentSummary && <span className={`mt-1 inline-block rounded-pill px-1.5 py-0.5 text-[10px] font-bold ${['REVIEW', 'OBSERVED', 'REFUND_PENDING'].includes(order.paymentSummary.state) ? 'bg-amber-100 text-amber-800' : 'bg-surface-muted text-ink-muted'}`}>{PAYMENT_SUMMARY_LABELS[order.paymentSummary.state] ?? order.paymentSummary.state}</span>}</td>
                    <td className="p-3 text-xs"><p className={attentionFor(order).late ? 'font-bold text-red-700' : 'font-semibold text-ink'}>{attentionFor(order).label}</p><p className="mt-1 text-[10px] text-ink-muted">{formatDate(order.placedAt)}</p></td>
                    <td className="p-3 text-right">{rowActions(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {orders.length === 0 && (
              <EmptyState icon={ShoppingBag} title={filtersActive ? 'No hay pedidos con estos filtros' : 'Aún no hay pedidos'} description={filtersActive ? 'Prueba otro estado, nombre, teléfono o número de pedido.' : 'Los pedidos de clientes aparecerán aquí cuando se registren desde la web, Salón o Punto de venta.'} action={filtersActive ? <Button size="sm" variant="outline" onClick={clearFilters}>Mostrar todos</Button> : undefined} className="m-4" />
            )}
          </div>

          <div className="mt-4 grid gap-3 md:hidden">
            {orders.map((order) => (
              <Card key={order.id} className={attentionFor(order).late ? 'border-red-200 bg-red-50/30 p-4' : 'p-4'}>
                {attentionFor(order).late && <p className="mb-3 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-red-700"><AlertTriangle className="size-3.5" /> Necesita seguimiento · {attentionFor(order).label}</p>}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {canCancel && CANCELLABLE_STATUSES.has(order.status as AdminOrderStatus) && (
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${order.orderNumber}`}
                        className="mt-1 size-4 accent-brand-600"
                        checked={selected.includes(order.orderNumber)}
                        disabled={isBulkRunning}
                        onChange={() => toggle(order.orderNumber)}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono font-extrabold text-ink">{order.orderNumber}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                        <ShoppingBag className="size-3" />
                        {order.deliveryType === 'DELIVERY' ? 'Delivery' : order.deliveryType === 'DINE_IN' ? 'Salón' : 'Recojo'}
                        {order.contactName ? ` · ${order.contactName}` : ''}
                      </p>
                      {order.source !== 'POS' && !order.customerContactJson && ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status) && <p className="mt-1 text-xs font-semibold text-brand-700">Contacto inicial pendiente</p>}
                      <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                        {order.deliveryType === 'DELIVERY' ? <MapPin className="size-3" /> : <Store className="size-3" />}
                        {order.deliveryType === 'DELIVERY'
                          ? order.addressSnapshotJson?.districtName ?? order.addressSnapshotJson?.line1 ?? 'Destino sin distrito'
                          : order.deliveryType === 'DINE_IN'
                            ? `${order.diningTable?.code ?? 'Mesa'} · ${order.branch?.name ?? activeBranchName ?? 'Sucursal'}`
                            : order.branch?.name ?? activeBranchName ?? 'Sucursal de recojo'}
                      </p>
                    </div>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="my-3 border-t border-line" />
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{order.items.reduce((total, item) => total + item.quantity, 0)} platos</p>
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{order.items.map((item) => `${item.quantity}× ${item.productNameSnapshot}`).join(', ')}</p>
                <div className="mt-3 rounded-card border border-brand-100 bg-brand-50/70 p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-brand-700">Siguiente paso</p>
                  <p className="mt-1 text-sm font-bold text-brand-900">{nextStepCopy(order, internalOnly)}</p>
                  {order.kitchenTicket && <div className="mt-2"><KitchenStatusBadge status={order.kitchenTicket.status} /></div>}
                  {Boolean(order.cakeTasks?.length) && <p className="mt-2 text-xs font-bold text-brand-700">Producción de torta: {order.cakeTasks?.filter((task) => task.status === 'DONE').length}/{order.cakeTasks?.length} etapas</p>}
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={attentionFor(order).late ? 'text-xs font-bold text-red-700' : 'text-xs text-ink-muted'}>{attentionFor(order).label}</p>
                    <p className="mt-0.5 text-lg font-bold text-ink">{formatCurrency(order.grandTotal)}</p>
                    {order.paymentSummary && <span className="mt-1 inline-block rounded-pill bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">{PAYMENT_SUMMARY_LABELS[order.paymentSummary.state] ?? order.paymentSummary.state}</span>}
                  </div>
                  {rowActions(order)}
                </div>
              </Card>
            ))}
            {orders.length === 0 && <EmptyState icon={ShoppingBag} title={filtersActive ? 'No hay pedidos con estos filtros' : 'Aún no hay pedidos'} description={filtersActive ? 'Prueba otro estado, nombre, teléfono o número de pedido.' : 'Los pedidos de clientes aparecerán aquí cuando se registren desde la web, Salón o Punto de venta.'} action={filtersActive ? <Button size="sm" variant="outline" onClick={clearFilters}>Mostrar todos</Button> : undefined} />}
          </div>

          {/* La lista se cortaba en 20 filas SIN AVISAR: el fetcher no mandaba
              `page` y descartaba el `meta` que el controlador si devolvia. */}
          {meta && meta.total > 0 && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onChange={(next) => updateParams({ pagina: String(next) }, false)}
              />
              <p className="text-xs text-ink-muted">
                {orders.length} de {meta.total} pedidos
              </p>
            </div>
          )}
        </>
      )}

      {/* Acciones masivas: Soporte cancelaba cinco pedidos de uno en uno. */}
      {selected.length > 0 && (
        <>
          <div className="sticky bottom-4 z-20 mt-4 hidden items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-e3 xl:flex">
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{bulkLabel} · se aplicará el mismo motivo de cancelación a todos</p>
            <Button variant="ghost" disabled={isBulkRunning} onClick={() => setSelected([])}>
              Quitar seleccion
            </Button>
            <Button
              variant="danger"
              isLoading={isBulkRunning}
              leftIcon={<XCircle className="size-4" />}
              onClick={() => void cancelSelected()}
            >
              Cancelar seleccionados
            </Button>
          </div>

          <StickyActionBar hideFrom="xl" maxWidth="6xl" label="Seleccion" value={bulkLabel}>
            <Button variant="outline" disabled={isBulkRunning} onClick={() => setSelected([])}>
              Quitar
            </Button>
            <Button
              variant="danger"
              isLoading={isBulkRunning}
              leftIcon={<XCircle className="size-4" />}
              onClick={() => void cancelSelected()}
            >
              Cancelar
            </Button>
          </StickyActionBar>
        </>
      )}

      <OrderDetailPanel
        orderNumber={detailOrder}
        onClose={() => setDetailOrder(null)}
        onChanged={() => refresh()}
      />
    </div>
  );
};

export default AdminOrdersPage;
