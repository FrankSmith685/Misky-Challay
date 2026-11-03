import { useEffect, useMemo, useState } from 'react';
import { Banknote, BarChart3, Clock3, CreditCard, ReceiptText, Smartphone, Store, TrendingDown, TrendingUp } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { useLocalPaymentSettings } from '@services/businessInfo';
import { BranchSelector } from '../components/BranchSelector';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { adminApi } from '../services/admin.service';
import type { Reports } from '../types';

type Period = 'TODAY' | '7D' | '30D';

const PERIODS: Array<{ value: Period; label: string; days: number }> = [
  { value: 'TODAY', label: 'Hoy', days: 1 },
  { value: '7D', label: '7 días', days: 7 },
  { value: '30D', label: '30 días', days: 30 },
];

const isoInLima = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
};

const addDays = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const CHANNEL_LABEL: Record<string, string> = {
  DELIVERY: 'Delivery', PICKUP: 'Recojo', DINE_IN: 'Salón',
};

const PAYMENT_LABEL: Record<string, string> = {
  stripe: 'Tarjeta / pago online', wallet: 'Saldo del plan', cash: 'Efectivo cobrado', cash_pending: 'Efectivo por cobrar',
  yape: 'Yape validado', plin: 'Plin validado', yape_pending: 'Yape por validar', plin_pending: 'Plin por validar',
};

const CashPage = () => {
  const { can } = usePermissions();
  const canReadReports = can(PERM.REPORT_SALES_READ);
  const localPayments = useLocalPaymentSettings();
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } = useActiveBranch();
  const [period, setPeriod] = useState<Period>('TODAY');
  const [data, setData] = useState<Reports | null>(null);
  const [previous, setPrevious] = useState<Reports | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const today = isoInLima(new Date());
    const days = PERIODS.find((item) => item.value === period)?.days ?? 1;
    const from = addDays(today, -(days - 1));
    return {
      current: { from, to: today },
      previous: { from: addDays(from, -days), to: addDays(from, -1) },
    };
  }, [period]);

  useEffect(() => {
    if (!branchId || !canReadReports) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      adminApi.reports(branchId, controller.signal, range.current),
      adminApi.reports(branchId, controller.signal, range.previous),
    ])
      .then(([currentData, previousData]) => {
        setData(currentData);
        setPrevious(previousData);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(loadError));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [branchId, range, canReadReports]);

  if (!canReadReports) return <Navigate to={ROUTES.adminDirectPayments} replace />;
  if ((loading && !data) || isLoadingBranches) return <PageLoader />;

  const sales = data?.sales;
  const previousSales = previous?.sales;
  const salesChange = previousSales?.revenue
    ? Math.round(((sales?.revenue ?? 0) - previousSales.revenue) / previousSales.revenue * 100)
    : null;
  const payments = data?.paymentBreakdown ?? [];
  const showManualPaymentReview = localPayments.yapeEnabled || localPayments.plinEnabled;
  const cashPending = payments.filter((item) => item.method.endsWith('_pending')).reduce((total, item) => total + item.amount, 0);
  const collected = payments
    .filter((item) => !item.method.endsWith('_pending'))
    .reduce((total, item) => total + item.amount, 0);
  const busiest = [...(data?.hourlySales ?? [])].sort((left, right) => right.orders - left.orders)[0];
  const maxHourly = Math.max(1, ...(data?.hourlySales ?? []).map((item) => item.orders));

  const header = (
    <PageHeader
      eyebrow="Control comercial por local"
      title="Caja y rendimiento"
      description="Comprueba cuánto vende el local, qué se cobra, qué queda pendiente y cuáles son sus horas y productos fuertes."
      icon={Banknote}
      action={<BranchSelector value={branchId} branches={branches} onChange={setBranchId} hasError={Boolean(branchesError)} />}
    />
  );

  if (branchesError) return <div>{header}<LoadError message={branchesError} onRetry={() => void reloadBranches()} /></div>;
  if (error || !data || !sales) return <div>{header}<LoadError title="No pudimos abrir la caja" message={error ?? 'Tu rol necesita permiso para ver reportes de ventas.'} /></div>;

  return (
    <div>
      {header}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Periodo del informe">
        {PERIODS.map((item) => <Button key={item.value} size="sm" variant={period === item.value ? 'primary' : 'outline'} onClick={() => setPeriod(item.value)}>{item.label}</Button>)}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Venta registrada</p><p className="mt-2 text-3xl font-black text-ink">{formatCurrency(sales.revenue)}</p></div><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><Banknote className="size-5" /></span></div>{salesChange !== null && <p className={`mt-3 flex items-center gap-1 text-xs font-bold ${salesChange >= 0 ? 'text-brand-700' : 'text-red-700'}`}>{salesChange >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{Math.abs(salesChange)}% frente al periodo anterior</p>}</Card>
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Pedidos vendidos</p><p className="mt-2 text-3xl font-black text-ink">{sales.orders}</p><p className="mt-2 text-xs text-ink-muted">Ticket promedio {formatCurrency(sales.averageTicket)}</p></div><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><ReceiptText className="size-5" /></span></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Cobrado</p><p className="mt-2 text-3xl font-black text-brand-800">{formatCurrency(collected)}</p><p className="mt-2 text-xs text-ink-muted">Según pagos registrados</p></div><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><CreditCard className="size-5" /></span></div></Card>
        <Card className={`p-5 ${cashPending > 0 ? 'border-amber-200 bg-amber-50/60' : ''}`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Pendiente de conciliar</p><p className={`mt-2 text-3xl font-black ${cashPending > 0 ? 'text-amber-800' : 'text-ink'}`}>{formatCurrency(cashPending)}</p><p className="mt-2 text-xs text-ink-muted">{showManualPaymentReview ? 'Efectivo por cobrar o pago manual por validar' : 'Efectivo por cobrar'}</p></div><span className="grid size-10 place-items-center rounded-card bg-white text-amber-700"><Clock3 className="size-5" /></span></div></Card>
      </div>

      {can(PERM.PAYMENT_VERIFY) && <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5"><div className="flex items-center gap-3"><Smartphone className="size-5 text-brand-700" /><div><h2 className="font-bold text-ink">Yape y Plin directos</h2><p className="mt-1 text-xs text-ink-muted">Revisa reportes, solicita correcciones y consulta el historial de cobros.</p></div></div><Button component={Link} to={ROUTES.adminDirectPayments} variant="outline">Revisar pagos</Button></Card>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-ink">Ranking de productos</h2><p className="mt-1 text-xs text-ink-muted">Qué sostiene la venta de este local.</p></div><BarChart3 className="size-5 text-brand-600" /></div>
          <div className="mt-5 space-y-4">
            {data.topProducts.length === 0 ? <p className="text-sm text-ink-muted">Todavía no hay ventas en este periodo.</p> : data.topProducts.slice(0, 8).map((product, index) => {
              const max = data.topProducts[0]?.units || 1;
              return <div key={product.name}><div className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-black text-brand-700">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3 text-sm"><b className="truncate text-ink">{product.name}</b><span className="shrink-0 text-ink-muted">{product.units} und · {formatCurrency(product.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-muted"><div className="h-full rounded-pill bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${Math.max(4, product.units / max * 100)}%` }} /></div></div></div></div>;
            })}
          </div>
        </Card>

        <div className="grid gap-5">
          <Card className="p-5">
            <div className="flex items-center justify-between"><div><h2 className="font-bold text-ink">Canales de atención</h2><p className="mt-1 text-xs text-ink-muted">Delivery, recojo y consumo en salón.</p></div><Store className="size-5 text-brand-600" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {data.channelBreakdown.map((item) => <div key={item.channel} className="flex items-center justify-between rounded-card border border-line p-3"><div><p className="font-bold text-ink">{CHANNEL_LABEL[item.channel] ?? item.channel}</p><p className="text-xs text-ink-muted">{item.orders} pedidos</p></div><b className="text-brand-800">{formatCurrency(item.revenue)}</b></div>)}
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start justify-between"><div><h2 className="font-bold text-ink">Formas de pago</h2><p className="mt-1 text-xs text-ink-muted">Conciliación operativa, sin datos de tarjeta.</p></div>{busiest && <Badge variant="brand">Hora fuerte {String(busiest.hour).padStart(2, '0')}:00</Badge>}</div>
            <div className="mt-4 space-y-2">{payments.map((item) => <div key={item.method} className="flex items-center justify-between gap-3 rounded-field bg-surface-muted px-3 py-2 text-sm"><span className="text-ink-muted">{PAYMENT_LABEL[item.method] ?? item.method} · {item.transactions}</span><b className={item.method.endsWith('_pending') ? 'text-amber-800' : 'text-ink'}>{formatCurrency(item.amount)}</b></div>)}</div>
          </Card>
        </div>
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        <div><h2 className="font-bold text-ink">Demanda por hora</h2><p className="mt-1 text-xs text-ink-muted">Ayuda a decidir turnos, preparación y abastecimiento.</p></div>
        <div className="mt-5 flex min-h-40 items-end gap-2 overflow-x-auto pb-2">{data.hourlySales.length === 0 ? <p className="self-center text-sm text-ink-muted">Sin pedidos en el periodo.</p> : data.hourlySales.map((item) => <div key={item.hour} className="flex min-w-12 flex-1 flex-col items-center gap-2"><span className="text-[11px] font-bold text-ink">{item.orders}</span><div className="w-full rounded-t-field bg-brand-500" style={{ height: `${Math.max(8, item.orders / maxHourly * 100)}px` }} /><span className="text-[10px] text-ink-muted">{String(item.hour).padStart(2, '0')}h</span></div>)}</div>
      </Card>
    </div>
  );
};

export default CashPage;
