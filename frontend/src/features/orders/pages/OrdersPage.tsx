import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  MapPin,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Modal } from '@components/ui/Modal';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { useLiveRefresh } from '@services/realtime';
import { ordersApi } from '../services/orders.service';
import { useReorder } from '../hooks/useReorder';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import type { OrderDetail } from '@features/checkout/types';

/** RN-018: cancelar solo mientras el pedido no entró a cocina. */
const CANCELLABLE = ['PENDING_PAYMENT', 'CONFIRMED'];
const ACTIVE = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

type OrderFilter = 'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';

const OrdersPage = () => {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [filter, setFilter] = useState<OrderFilter>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ ALL: 0, ACTIVE: 0, DELIVERED: 0, CANCELLED: 0 });
  const [pendingCancel, setPendingCancel] = useState<OrderDetail | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  /** Que tarjeta lanzo el "Volver a pedir": el spinner va solo en su boton. */
  const [reorderingNumber, setReorderingNumber] = useState<string | null>(null);
  const { reorder, isReordering } = useReorder();

  const reload = useCallback(() => setRetryNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    if (!orders.length) setIsLoading(true);
    setLoadError(null);

    ordersApi
      .listPage(page, filter)
      .then((result) => {
        if (active) { setOrders(result.orders); setCounts(result.meta.counts); setTotalPages(result.meta.totalPages); }
      })
      .catch((error) => {
        if (!active) return;
        // Sin esto la lista vacia le dice "todavia no tienes pedidos" a alguien que
        // solo se quedo sin cobertura. El vacio real es una respuesta 200 sin filas.
        setOrders([]);
        setLoadError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  // The cleanup prevents a response for an old filter from replacing the current page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce, page, filter]);
  useLiveRefresh(['orders', 'payments'], reload);

  const handleCancel = async () => {
    if (!pendingCancel) return;
    setCancellingId(pendingCancel.id);
    try {
      const message = await ordersApi.cancel(pendingCancel.orderNumber, 'Cancelado por el cliente');
      toast.success(message);
      setPendingCancel(null);
      reload();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCancellingId(null);
    }
  };

  const handleReorder = async (orderNumber: string) => {
    setReorderingNumber(orderNumber);
    try {
      await reorder(orderNumber);
    } finally {
      setReorderingNumber(null);
    }
  };

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()),
    [orders],
  );
  const filteredOrders = sortedOrders;

  if (isLoading) return <PageLoader />;

  const filters: Array<{ value: OrderFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ACTIVE', label: 'En curso' },
    { value: 'DELIVERED', label: 'Entregados' },
    { value: 'CANCELLED', label: 'Cancelados' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Actividad"
        title="Mis pedidos"
        description={orders.length ? 'Consulta el estado, la entrega y el detalle de todas tus compras.' : 'Sigue tus compras y consulta cada detalle desde un solo lugar.'}
        icon={ClipboardList}
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }, { label: 'Pedidos' }]}
        action={<Button component={Link} to={ROUTES.menu} leftIcon={<ShoppingBag className="size-4" />}>Hacer un pedido</Button>}
        className="mb-6"
      />

      {loadError ? (
        <div className="grid justify-items-center gap-4 rounded-card border border-line bg-white p-8 text-center shadow-e2 sm:p-10">
          <span className="grid size-14 place-items-center rounded-card bg-red-50 text-red-600">
            <AlertCircle className="size-7" />
          </span>
          <h2 className="text-xl font-black text-ink">No pudimos cargar tus pedidos</h2>
          <p className="max-w-md leading-7 text-ink-muted">{loadError}</p>
          <p className="max-w-md text-sm text-ink-muted">
            Tus compras siguen registradas. Vuelve a intentarlo en unos segundos.
          </p>
          <Button onClick={reload} leftIcon={<RefreshCw className="size-4" />}>Reintentar</Button>
        </div>
      ) : counts.ALL === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Todavía no tienes pedidos"
          description="Cuando hagas tu primera compra podrás seguirla y revisar su detalle aquí."
          action={<Button component={Link} to={ROUTES.menu} leftIcon={<ShoppingBag className="size-4" />}>Explorar el menú</Button>}
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-3 gap-2" aria-label="Resumen de pedidos">
            <OrderStat value={counts.ALL} label="Pedidos" icon={ShoppingBag} />
            <OrderStat value={counts.ACTIVE} label="En curso" icon={Clock3} highlighted={counts.ACTIVE > 0} />
            <OrderStat value={counts.DELIVERED} label="Entregados" icon={CheckCircle2} />
          </section>

          <nav className="mb-5 overflow-x-auto border-b border-line" aria-label="Filtrar pedidos">
            <div className="flex min-w-max gap-1">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => { setPage(1); setFilter(item.value); }}
                  aria-pressed={filter === item.value}
                  className={cn(
                    'relative flex min-h-11 items-center gap-2 px-3 text-sm font-bold transition',
                    filter === item.value ? 'text-brand-800' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                  <span className={cn('rounded-pill px-1.5 py-0.5 text-[10px]', filter === item.value ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted')}>{counts[item.value]}</span>
                  {filter === item.value && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-brand-700" />}
                </button>
              ))}
            </div>
          </nav>

          {filteredOrders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No hay pedidos en esta categoría"
              description="Puedes volver a ver todo tu historial de compras."
              action={<Button variant="outline" onClick={() => setFilter('ALL')}>Ver todos los pedidos</Button>}
            />
          ) : (
            <ul className="space-y-4">
              {filteredOrders.map((order) => {
                const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
                const isActive = ACTIVE.includes(order.status);
                const destination = order.deliveryType === 'DELIVERY'
                  ? order.addressSnapshotJson?.districtName ?? 'Entrega a domicilio'
                  : order.branch?.name ?? 'Recojo en taller';

                return (
                  <li key={order.id}>
                    <Card className={cn('overflow-hidden rounded-card p-0 transition hover:border-brand-200 hover:shadow-e3', isActive && 'border-brand-200 shadow-e3')}>
                      {/* Un pedido en curso y uno de hace tres meses no pueden leerse
                          igual: el primero es lo unico que el cliente vino a mirar. */}
                      {isActive && (
                        <p className="flex items-center gap-2 bg-brand-700 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-[.12em] text-white sm:px-5">
                          <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" /> Pedido en curso
                        </p>
                      )}
                      <div className={cn('flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5', isActive ? 'bg-brand-50/55' : 'bg-surface-muted/45')}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={ROUTES.accountOrderDetail(order.orderNumber)} className="font-extrabold text-ink transition hover:text-brand-700 hover:underline">
                              Pedido {order.orderNumber}
                            </Link>
                            <OrderStatusBadge status={order.status} paymentState={order.directPaymentState} />
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                            <CalendarDays className="size-3.5 shrink-0" /> {formatDate(order.placedAt)}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-muted">Total</p>
                          <p className="text-lg font-black text-brand-800">{formatCurrency(order.grandTotal)}</p>
                        </div>
                      </div>

                      <div className="p-4 sm:p-5">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.1em] text-ink-muted">
                              {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
                            </p>
                            <ul className="space-y-2">
                              {order.items.slice(0, 3).map((item) => (
                                <li key={item.id} className="flex items-start gap-2 text-sm text-ink">
                                  <span className="grid min-w-6 place-items-center rounded-pill bg-surface-muted px-1.5 py-0.5 text-[11px] font-extrabold text-brand-800">{item.quantity}x</span>
                                  <span className="min-w-0 font-semibold">{item.productNameSnapshot}</span>
                                </li>
                              ))}
                            </ul>
                            {order.items.length > 3 && <p className="mt-2 text-xs font-semibold text-brand-700">+ {order.items.length - 3} productos más</p>}
                          </div>

                          <div className="rounded-card border border-line bg-surface-muted/45 p-3">
                            <p className="flex items-center gap-2 text-xs font-extrabold text-ink">
                              {order.deliveryType === 'DELIVERY' ? <Truck className="size-4 text-brand-700" /> : <Store className="size-4 text-brand-700" />}
                              {order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-ink-muted">{destination}</p>
                            {order.serviceMode === 'SCHEDULED' && order.scheduledAt && (
                              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-800"><Clock3 className="size-3.5" /> Programado: {formatDate(order.scheduledAt)}</p>
                            )}
                          </div>
                        </div>

                        {order.discounts.length > 0 && (
                          <p className="mt-4 rounded-card bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800">
                            Ahorro aplicado: {formatCurrency(order.discounts.reduce((total, discount) => total + discount.amount, 0))}
                          </p>
                        )}
                        {order.cancelReason && (
                          <p className="mt-4 flex items-start gap-2 rounded-card border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span><strong>Motivo de cancelación:</strong> {order.cancelReason}</span>
                          </p>
                        )}

                        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                          {CANCELLABLE.includes(order.status) ? (
                            <Button variant="ghost" size="sm" className="sm:self-start" onClick={() => setPendingCancel(order)}>Cancelar pedido</Button>
                          ) : <span />}
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<RotateCcw className="size-3.5" />}
                              isLoading={reorderingNumber === order.orderNumber}
                              disabled={isReordering}
                              onClick={() => void handleReorder(order.orderNumber)}
                            >
                              Volver a pedir
                            </Button>
                            <Button component={Link} to={ROUTES.accountOrderDetail(order.orderNumber)} variant={isActive ? 'primary' : 'outline'} size="sm">
                              {isActive ? 'Ver seguimiento' : 'Ver detalle'} <ChevronRight className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {!loadError && totalPages > 1 && <div className="mt-5 flex items-center justify-center gap-4"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>{page} / {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div>}

      <Modal
        isOpen={pendingCancel !== null}
        onClose={() => cancellingId === null && setPendingCancel(null)}
        title="¿Cancelar este pedido?"
        description="Solo puede cancelarse antes de que la cocina empiece a prepararlo."
        icon={AlertTriangle}
        eyebrow="Confirma la acción"
        maxWidth="xs"
      >
        <div className="rounded-card border border-line bg-surface-muted/55 p-4">
          <p className="text-xs font-bold uppercase tracking-[.1em] text-ink-muted">Pedido</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-extrabold text-ink">{pendingCancel?.orderNumber}</p>
            <p className="font-black text-brand-800">{pendingCancel ? formatCurrency(pendingCancel.grandTotal) : ''}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-muted">Esta acción solicitará la cancelación y ya no podrás continuar con este pedido.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={cancellingId !== null} onClick={() => setPendingCancel(null)}>Conservar pedido</Button>
          <Button variant="danger" isLoading={cancellingId !== null} onClick={() => void handleCancel()}>Sí, cancelar</Button>
        </div>
      </Modal>
    </div>
  );
};

const OrderStat = ({
  value,
  label,
  icon: Icon,
  highlighted = false,
}: {
  value: number;
  label: string;
  icon: typeof MapPin;
  highlighted?: boolean;
}) => (
  <div className={cn('rounded-card border p-3 text-center sm:flex sm:items-center sm:gap-3 sm:text-left', highlighted ? 'border-brand-200 bg-brand-50' : 'border-line bg-white')}>
    <span className={cn('mx-auto grid size-8 place-items-center rounded-card sm:mx-0', highlighted ? 'bg-brand-700 text-white' : 'bg-surface-muted text-brand-700')}><Icon className="size-4" /></span>
    <div className="mt-2 min-w-0 sm:mt-0"><p className="text-lg font-black text-ink">{value}</p><p className="truncate text-[10px] font-semibold text-ink-muted sm:text-xs">{label}</p></div>
  </div>
);

export default OrdersPage;
