import { useCallback, useState } from 'react';
import { ClipboardList, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { useDebounce } from '@hooks/useDebounce';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import type { AdminOrderRow } from '../types';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING_PAYMENT', label: 'Esperando pago' },
  { value: 'CONFIRMED,PREPARING,READY', label: 'En curso' },
  { value: 'OUT_FOR_DELIVERY', label: 'En camino' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

/** Tablero de pedidos en tiempo real (seccion 9.7). */
const AdminOrdersPage = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const { branchId, branches, setBranchId, isLoadingBranches } = useActiveBranch();

  const fetcher = useCallback(
    () =>
      adminApi.orders({
        branchId: branchId ?? undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
      }),
    [branchId, status, debouncedSearch],
  );

  const { data, isLoading, refresh } = usePolling<AdminOrderRow[]>(fetcher, 8000);

  const handleCancel = async (order: AdminOrderRow) => {
    try {
      await adminApi.updateOrderStatus(order.orderNumber, 'CANCELLED', 'Cancelado desde el panel');
      toast.success('Pedido cancelado');
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const orders = data ?? [];

  return (
    <div>
      <PageHeader eyebrow="Operaciones" icon={ClipboardList} title="Gestion de pedidos" description="Supervisa y gestiona todos los pedidos desde un solo lugar." action={<div className="flex flex-wrap gap-2"><BranchSelector value={branchId} branches={branches} onChange={setBranchId} /><Button variant="outline" size="sm" leftIcon={<RefreshCw className="size-4" />} onClick={() => void refresh()}>Actualizar</Button></div>} />

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              status === filter.value
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line text-ink-muted hover:border-brand-300'
            }`}
          >
            {filter.label}
          </button>
        ))}

        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value.toUpperCase())}
            placeholder="Buscar N.o de pedido"
            className="h-10 w-full rounded-xl border border-line bg-surface-muted pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-surface sm:w-60"
          />
        </div>
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-card border border-line bg-surface shadow-sm md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="p-3">Pedido</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Cocina</th>
              <th className="p-3">Platos</th>
              <th className="p-3">Total</th>
              <th className="p-3">Fecha</th>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <p className="font-medium text-ink">{order.orderNumber}</p>
                  <p className="text-xs text-ink-muted">
                    {order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'}
                    {order.contactName ? ` · ${order.contactName}` : ''}
                  </p>
                </td>
                <td className="p-3">
                  <OrderStatusBadge status={order.status} />
                </td>
                <td className="p-3 text-xs text-ink-muted">
                  {order.kitchenTicket?.status ?? '—'}
                </td>
                <td className="p-3 text-xs text-ink-muted">
                  {order.items
                    .map((item) => `${item.quantity}x ${item.productNameSnapshot}`)
                    .join(', ')}
                </td>
                <td className="p-3 font-medium">{formatCurrency(order.grandTotal)}</td>
                <td className="p-3 text-xs text-ink-muted">{formatDate(order.placedAt)}</td>
                <td className="p-3 text-right">
                  {['CONFIRMED', 'PENDING_PAYMENT'].includes(order.status) && (
                    <Button size="sm" variant="ghost" onClick={() => handleCancel(order)}>
                      Cancelar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {orders.length === 0 && (
          <EmptyState icon={ShoppingBag} title="No hay pedidos" description="No encontramos pedidos con los filtros seleccionados." className="m-4" />
        )}
      </div>

      <div className="mt-4 grid gap-3 md:hidden">
        {orders.map((order) => (
          <Card key={order.id} className="p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-ink">{order.orderNumber}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted"><ShoppingBag className="size-3" /> {order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'}{order.contactName ? ` · ${order.contactName}` : ''}</p></div><OrderStatusBadge status={order.status} /></div>
            <div className="my-3 border-t border-line" />
            <p className="line-clamp-2 text-sm text-ink-muted">{order.items.map((item) => `${item.quantity}x ${item.productNameSnapshot}`).join(', ')}</p>
            <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-ink-muted">{formatDate(order.placedAt)}</p><p className="mt-0.5 text-lg font-bold text-ink">{formatCurrency(order.grandTotal)}</p></div>{['CONFIRMED', 'PENDING_PAYMENT'].includes(order.status) && <Button size="sm" variant="ghost" onClick={() => handleCancel(order)}>Cancelar</Button>}</div>
          </Card>
        ))}
        {orders.length === 0 && <EmptyState icon={ShoppingBag} title="No hay pedidos" description="No encontramos pedidos con los filtros seleccionados." />}
      </div>
    </div>
  );
};

export default AdminOrdersPage;
