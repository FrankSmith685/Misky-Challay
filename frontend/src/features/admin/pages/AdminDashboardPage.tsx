import { useCallback } from 'react';
import { AlertTriangle, BarChart3, Clock, MapPinned, Percent, ShoppingBag, Sparkles, TrendingUp, XCircle } from 'lucide-react';
import { Card, CardDescription } from '@components/ui/Card';
import { PageLoader } from '@components/common/PageLoader';
import { formatCurrency } from '@lib/format';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import type { Reports } from '../types';

/** Resumen operativo de los ultimos 30 dias (seccion 18.3). */
const AdminDashboardPage = () => {
  const { branchId, branches, setBranchId, isLoadingBranches } = useActiveBranch();
  const fetcher = useCallback(() => adminApi.reports(branchId ?? undefined), [branchId]);
  const { data, isLoading } = usePolling<Reports>(fetcher, 30000);

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;
  if (!data) return null;

  const tiles = [
    {
      icon: ShoppingBag,
      label: 'Pedidos vendidos',
      value: String(data.sales.orders),
      hint: 'Ultimos 30 dias',
    },
    {
      icon: TrendingUp,
      label: 'Ventas',
      value: formatCurrency(data.sales.revenue),
      hint: `Ticket promedio ${formatCurrency(data.sales.averageTicket)}`,
    },
    {
      icon: Percent,
      label: 'Descuentos',
      value: formatCurrency(data.sales.discounts),
      hint: `${data.sales.deliveryShare}% de los pedidos son delivery`,
    },
    {
      icon: Clock,
      label: 'Preparacion promedio',
      value: `${data.operations.avgPrepMinutes} min`,
      hint: `${data.operations.ticketsMeasured} tickets medidos`,
    },
    {
      icon: XCircle,
      label: 'Cancelaciones',
      value: String(data.quality.cancelled),
      hint: `${data.quality.cancellationRate}% de los pedidos`,
    },
  ];

  return (
    <div>
      <div className="relative overflow-hidden rounded-[1.5rem] bg-brand-800 p-5 text-white shadow-lg shadow-brand-900/10 sm:p-7">
        <div className="absolute -right-12 -top-16 size-56 rounded-full bg-brand-500/25 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-brand-100"><Sparkles className="size-3.5" /> Vista general</span>
            <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Tu negocio, de un vistazo</h1>
            <p className="mt-1 text-sm text-brand-100">Rendimiento de los ultimos 30 dias en la cocina seleccionada.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BranchSelector value={branchId} branches={branches} onChange={setBranchId} />
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm"><p className="text-xs text-brand-100">Ingresos del periodo</p><p className="mt-0.5 text-2xl font-bold">{formatCurrency(data.sales.revenue)}</p></div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <Card key={label} className="group p-4 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white"><Icon className="size-[18px]" /></span>
            </div>
            <CardDescription className="mt-2 text-xs">{hint}</CardDescription>
          </Card>
        ))}
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-semibold text-ink">Productos mas vendidos</h2><p className="mt-0.5 text-xs text-ink-muted">Preferencias de tus clientes este mes</p></div><BarChart3 className="size-5 text-brand-500" /></div>

        {data.topProducts.length === 0 ? (
          <CardDescription>Aun no hay ventas en este periodo.</CardDescription>
        ) : (
          <ul className="space-y-3">
            {data.topProducts.map((product) => {
              const max = data.topProducts[0].units || 1;
              const percent = Math.round((product.units / max) * 100);

              return (
                <li key={product.name}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink">{product.name}</span>
                    <span className="text-ink-muted">
                      {product.units} und · {formatCurrency(product.revenue)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface-muted">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><MapPinned className="size-5" /></span><div><h2 className="font-bold text-ink">Calidad de cobertura</h2><p className="text-xs text-ink-muted">Validaciones reales del cliente</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-brand-50 p-3"><p className="text-2xl font-black text-brand-800">{data.experience?.COVERAGE_SUCCESS ?? 0}</p><p className="text-xs text-brand-700">direcciones cubiertas</p></div><div className="rounded-2xl bg-amber-50 p-3"><p className="text-2xl font-black text-amber-900">{data.experience?.COVERAGE_FAIL ?? 0}</p><p className="text-xs text-amber-800">fuera de cobertura</p></div></div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-700"><AlertTriangle className="size-5" /></span><div><h2 className="font-bold text-ink">Fricción de compra</h2><p className="text-xs text-ink-muted">Errores que requieren atención</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-muted p-3"><p className="text-2xl font-black text-ink">{data.experience?.CHECKOUT_START ?? 0}</p><p className="text-xs text-ink-muted">intentos de pago</p></div><div className="rounded-2xl bg-red-50 p-3"><p className="text-2xl font-black text-red-800">{data.experience?.CHECKOUT_ERROR ?? 0}</p><p className="text-xs text-red-700">errores de checkout</p></div></div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
