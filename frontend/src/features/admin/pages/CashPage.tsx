import { useEffect, useMemo, useState } from 'react';
import { Banknote, BarChart3, Clock3, CreditCard, Download, LockKeyhole, Plus, ReceiptText, Smartphone, Store, TrendingDown, TrendingUp } from 'lucide-react';
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
import type { CashSessionDetail, CashSummary, Reports } from '../types';

type Period = 'TODAY' | '7D' | '30D' | 'CUSTOM';

const PERIODS: Array<{ value: Period; label: string; days: number }> = [
  { value: 'TODAY', label: 'Hoy', days: 1 },
  { value: '7D', label: '7 días', days: 7 },
  { value: '30D', label: '30 días', days: 30 },
  { value: 'CUSTOM', label: 'Personalizado', days: 0 },
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
  const { can, isSuperAdmin } = usePermissions();
  const canReadReports = can(PERM.REPORT_SALES_READ);
  const localPayments = useLocalPaymentSettings();
  const { branchId, branches, setBranchId, setGlobalScope, isLoadingBranches, branchesError, reloadBranches } = useActiveBranch({ allowAll: isSuperAdmin });
  const [period, setPeriod] = useState<Period>('TODAY');
  const [paymentMethod, setPaymentMethod] = useState('');
  const today = isoInLima(new Date());
  const [customFrom, setCustomFrom] = useState(() => addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const [data, setData] = useState<Reports | null>(null);
  const [previous, setPrevious] = useState<Reports | null>(null);
  const [cashSummary, setCashSummary] = useState<CashSummary | null>(null);
  const [sessionDetail, setSessionDetail] = useState<CashSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [movementType, setMovementType] = useState<'EXPENSE' | 'CASH_IN' | 'CASH_OUT' | 'ADJUSTMENT'>('EXPENSE');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [declaredCash, setDeclaredCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const range = useMemo(() => {
    const days = PERIODS.find((item) => item.value === period)?.days ?? 1;
    if (period === 'CUSTOM') {
      const length = Math.max(1, Math.round((new Date(`${customTo}T12:00:00`).getTime() - new Date(`${customFrom}T12:00:00`).getTime()) / 86_400_000) + 1);
      return { current: { from: customFrom, to: customTo }, previous: { from: addDays(customFrom, -length), to: addDays(customFrom, -1) } };
    }
    const from = addDays(today, -(days - 1));
    return {
      current: { from, to: today },
      previous: { from: addDays(from, -days), to: addDays(from, -1) },
    };
  }, [customFrom, customTo, period, today]);

  useEffect(() => {
    if (!canReadReports) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      adminApi.reports(branchId ?? undefined, controller.signal, range.current),
      adminApi.reports(branchId ?? undefined, controller.signal, range.previous),
      adminApi.cashSummary({ branchId: branchId ?? undefined, ...range.current }, controller.signal),
    ])
      .then(([currentData, previousData, summary]) => {
        setData(currentData);
        setPrevious(previousData);
        setCashSummary(summary);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(loadError));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [branchId, range, canReadReports, reloadKey]);

  const activeSession = branchId
    ? cashSummary?.openSessions.find((session) => session.branchId === branchId) ?? null
    : null;
  const activeSessionId = activeSession?.id;

  useEffect(() => {
    if (!activeSessionId) { setSessionDetail(null); return undefined; }
    const controller = new AbortController();
    void adminApi.cashSessionDetail(activeSessionId, controller.signal).then(setSessionDetail).catch(() => undefined);
    return () => controller.abort();
  }, [activeSessionId]);

  if (!canReadReports) return <Navigate to={ROUTES.adminDirectPayments} replace />;
  if ((loading && !data) || isLoadingBranches) return <PageLoader />;

  const sales = data?.sales;
  const previousSales = previous?.sales;
  const salesChange = previousSales?.revenue
    ? Math.round(((sales?.revenue ?? 0) - previousSales.revenue) / previousSales.revenue * 100)
    : null;
  const payments = data?.paymentBreakdown ?? [];
  const visiblePayments = paymentMethod ? payments.filter((item) => item.method.replace('_pending', '') === paymentMethod) : payments;
  const showManualPaymentReview = localPayments.yapeEnabled || localPayments.plinEnabled;
  const cashPending = paymentMethod ? visiblePayments.filter((item) => item.method.endsWith('_pending')).reduce((total, item) => total + item.amount, 0) : (cashSummary?.pending.amount ?? visiblePayments.filter((item) => item.method.endsWith('_pending')).reduce((total, item) => total + item.amount, 0));
  const collected = visiblePayments
    .filter((item) => !item.method.endsWith('_pending'))
    .reduce((total, item) => total + item.amount, 0);
  const busiest = [...(data?.hourlySales ?? [])].sort((left, right) => right.orders - left.orders)[0];
  const maxHourly = Math.max(1, ...(data?.hourlySales ?? []).map((item) => item.orders));

  const refresh = () => setReloadKey((value) => value + 1);
  const downloadReport = async () => {
    setBusy('export');
    try {
      const blob = await adminApi.exportReports(branchId ?? undefined, range.current);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `dulceflow-caja-${range.current.from}-${range.current.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  const openSession = async () => {
    if (!branchId) return;
    setBusy('open');
    try {
      await adminApi.openCashSession({ branchId, businessDate: today, openingFloat: Number(openingFloat) });
      setOpeningFloat('0.00');
      refresh();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  const addMovement = async () => {
    if (!activeSession || !movementReason.trim()) return;
    setBusy('movement');
    try {
      await adminApi.recordCashMovement(activeSession.id, { type: movementType, amount: Number(movementAmount), reason: movementReason });
      setMovementAmount('');
      setMovementReason('');
      refresh();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  const closeSession = async () => {
    if (!activeSession || declaredCash === '') return;
    setBusy('close');
    try {
      await adminApi.closeCashSession(activeSession.id, { declaredCash: Number(declaredCash), notes: closingNotes || undefined });
      setDeclaredCash('');
      setClosingNotes('');
      refresh();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <PageHeader
      eyebrow="Control comercial por local"
      title="Caja y rendimiento"
      description="Comprueba cuánto vende el local, qué se cobra, qué queda pendiente y cuáles son sus horas y productos fuertes."
      icon={Banknote}
      action={<div className="flex flex-wrap items-center gap-2"><BranchSelector value={branchId} branches={branches} onChange={setBranchId} allowAll={isSuperAdmin} onSelectAll={setGlobalScope} hasError={Boolean(branchesError)} /><Button size="sm" variant="outline" isLoading={busy === 'export'} leftIcon={<Download className="size-4" />} onClick={() => void downloadReport()}>Exportar CSV</Button></div>}
    />
  );

  if (branchesError) return <div>{header}<LoadError message={branchesError} onRetry={() => void reloadBranches()} /></div>;
  if (error || !data || !sales) return <div>{header}<LoadError title="No pudimos abrir la caja" message={error ?? 'Tu rol necesita permiso para ver reportes de ventas.'} /></div>;

  return (
    <div>
      {header}

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Periodo y método del informe">
        {PERIODS.map((item) => <Button key={item.value} size="sm" variant={period === item.value ? 'primary' : 'outline'} onClick={() => setPeriod(item.value)}>{item.label}</Button>)}
        {period === 'CUSTOM' && <div className="flex flex-wrap gap-2"><input aria-label="Desde caja" type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} className="min-h-10 rounded-field border border-line bg-surface px-2 text-xs" /><input aria-label="Hasta caja" type="date" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value)} className="min-h-10 rounded-field border border-line bg-surface px-2 text-xs" /></div>}
        <select aria-label="Filtrar caja por método de pago" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="min-h-10 rounded-field border border-line bg-surface px-3 text-xs"><option value="">Todos los métodos</option><option value="cash">Efectivo</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="stripe">Tarjeta / online</option><option value="wallet">Saldo del plan</option></select>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Venta registrada</p><p className="mt-2 text-3xl font-black text-ink">{formatCurrency(sales.revenue)}</p></div><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><Banknote className="size-5" /></span></div>{salesChange !== null && <p className={`mt-3 flex items-center gap-1 text-xs font-bold ${salesChange >= 0 ? 'text-brand-700' : 'text-red-700'}`}>{salesChange >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{Math.abs(salesChange)}% frente al periodo anterior</p>}</Card>
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Pedidos vendidos</p><p className="mt-2 text-3xl font-black text-ink">{sales.orders}</p><p className="mt-2 text-xs text-ink-muted">Ticket promedio {formatCurrency(sales.averageTicket)}</p></div><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><ReceiptText className="size-5" /></span></div></Card>
        <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Cobrado</p><p className="mt-2 text-3xl font-black text-brand-800">{formatCurrency(collected)}</p><p className="mt-2 text-xs text-ink-muted">Según pagos registrados</p></div><span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><CreditCard className="size-5" /></span></div></Card>
        <Card className={`p-5 ${cashPending > 0 ? 'border-amber-200 bg-amber-50/60' : ''}`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Pendiente de conciliar</p><p className={`mt-2 text-3xl font-black ${cashPending > 0 ? 'text-amber-800' : 'text-ink'}`}>{formatCurrency(cashPending)}</p><p className="mt-2 text-xs text-ink-muted">{showManualPaymentReview ? 'Efectivo por cobrar o pago manual por validar' : 'Efectivo por cobrar'}</p></div><span className="grid size-10 place-items-center rounded-card bg-white text-amber-700"><Clock3 className="size-5" /></span></div></Card>
        {isSuperAdmin && <Card className="border-brand-200 bg-brand-50/50 p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-800">Comisión plataforma {Math.round((cashSummary?.platform.rate ?? 0.15) * 100)}%</p><p className="mt-2 text-3xl font-black text-brand-900">{formatCurrency(data.platform?.accrued ?? 0)}</p><p className="mt-2 text-xs text-brand-800">Pendiente de liquidar {formatCurrency(data.platform?.outstanding ?? 0)}</p></div><span className="grid size-10 place-items-center rounded-card bg-white text-brand-700"><Banknote className="size-5" /></span></div></Card>}
      </div>

      {can(PERM.PAYMENT_VERIFY) && <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5"><div className="flex items-center gap-3"><Smartphone className="size-5 text-brand-700" /><div><h2 className="font-bold text-ink">Yape y Plin directos</h2><p className="mt-1 text-xs text-ink-muted">Revisa reportes, solicita correcciones y consulta el historial de cobros.</p></div></div><Button component={Link} to={ROUTES.adminDirectPayments} variant="outline">Revisar pagos</Button></Card>}

      <Card className="mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 font-bold text-ink"><LockKeyhole className="size-5 text-brand-700" /> Cierre de caja</h2><p className="mt-1 text-xs text-ink-muted">Registra el fondo, los movimientos manuales y el efectivo contado por jornada.</p></div>
          {cashSummary && <div className="text-right text-xs text-ink-muted"><p>{cashSummary.sessions.open} abierta{cashSummary.sessions.open === 1 ? '' : 's'}</p><p>Variación cerrada: {formatCurrency(cashSummary.sessions.variance)}</p></div>}
        </div>
        {!branchId ? (
          <p className="mt-4 rounded-field border border-accent-200 bg-accent-50 p-3 text-sm text-accent-900">Selecciona una sucursal para abrir o cerrar su caja. El alcance global sigue disponible para consultar los totales consolidados.</p>
        ) : activeSession && sessionDetail ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-card border border-brand-200 bg-brand-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-800">Caja abierta · {activeSession.businessDate}</p><p className="mt-2 text-2xl font-black text-ink">Esperado {formatCurrency(sessionDetail.reconciliation.expectedCash)}</p><p className="mt-1 text-xs text-ink-muted">Ventas {formatCurrency(sessionDetail.reconciliation.cashSales)} · Reembolsos {formatCurrency(sessionDetail.reconciliation.cashRefunds)}</p></div><Badge variant="brand">En curso</Badge></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-field bg-white p-3"><p className="text-xs text-ink-muted">Entradas manuales</p><p className="mt-1 font-black text-brand-800">{formatCurrency(sessionDetail.reconciliation.manualIn)}</p></div><div className="rounded-field bg-white p-3"><p className="text-xs text-ink-muted">Salidas</p><p className="mt-1 font-black text-red-700">{formatCurrency(sessionDetail.reconciliation.manualOut)}</p></div><div className="rounded-field bg-white p-3"><p className="text-xs text-ink-muted">Ajustes</p><p className="mt-1 font-black text-ink">{formatCurrency(sessionDetail.reconciliation.adjustments)}</p></div></div>
              <div className="mt-4 border-t border-brand-200 pt-4"><p className="text-sm font-bold text-ink">Registrar movimiento</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]"><select aria-label="Tipo de movimiento" value={movementType} onChange={(event) => setMovementType(event.target.value as typeof movementType)} className="min-h-10 rounded-field border border-line bg-white px-2 text-sm"><option value="EXPENSE">Gasto</option><option value="CASH_IN">Ingreso</option><option value="CASH_OUT">Salida</option><option value="ADJUSTMENT">Ajuste</option></select><input aria-label="Importe del movimiento" type="number" min={movementType === 'ADJUSTMENT' ? undefined : 0.01} step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="Importe" className="min-h-10 rounded-field border border-line bg-white px-3 text-sm" /><input aria-label="Motivo del movimiento" value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="Motivo obligatorio" className="min-h-10 rounded-field border border-line bg-white px-3 text-sm" /><Button size="sm" isLoading={busy === 'movement'} disabled={!movementAmount || !movementReason.trim()} leftIcon={<Plus className="size-4" />} onClick={() => void addMovement()}>Registrar</Button></div></div>
              <div className="mt-4 border-t border-brand-200 pt-4"><p className="text-sm font-bold text-ink">Cerrar jornada</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input aria-label="Efectivo contado" type="number" min="0" step="0.01" value={declaredCash} onChange={(event) => setDeclaredCash(event.target.value)} placeholder="Efectivo contado" className="min-h-10 rounded-field border border-line bg-white px-3 text-sm" /><input aria-label="Notas del cierre" value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Notas si existe diferencia" className="min-h-10 rounded-field border border-line bg-white px-3 text-sm" /><Button size="sm" variant="outline" isLoading={busy === 'close'} disabled={!declaredCash} onClick={() => void closeSession()}>Cerrar caja</Button></div></div>
            </div>
            <div><p className="text-sm font-bold text-ink">Movimientos recientes</p><div className="mt-2 max-h-72 space-y-2 overflow-auto">{sessionDetail.movements.length === 0 ? <p className="rounded-field border border-dashed border-line p-4 text-sm text-ink-muted">Las ventas automáticas se calculan desde los pagos; aún no hay movimientos manuales.</p> : sessionDetail.movements.slice().reverse().map((movement) => <div key={movement.id} className="flex items-center justify-between gap-3 rounded-field border border-line px-3 py-2 text-sm"><div><p className="font-semibold text-ink">{movement.reason}</p><p className="text-xs text-ink-muted">{movement.type}</p></div><b className={['EXPENSE', 'CASH_OUT'].includes(movement.type) ? 'text-red-700' : 'text-brand-800'}>{['EXPENSE', 'CASH_OUT'].includes(movement.type) ? '-' : '+'}{formatCurrency(movement.amount)}</b></div>)}</div></div>
          </div>
        ) : activeSession ? (
          <p className="mt-4 rounded-field border border-line bg-surface-muted p-4 text-sm text-ink-muted">Cargando la conciliación de la caja abierta...</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-dashed border-line p-4"><label className="text-xs font-bold text-ink">Fondo inicial<input aria-label="Fondo inicial" type="number" min="0" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} className="mt-1 min-h-10 rounded-field border border-line bg-white px-3 text-sm font-normal" /></label><Button size="sm" isLoading={busy === 'open'} onClick={() => void openSession()}>Abrir caja de hoy</Button><span className="text-xs text-ink-muted">No se puede abrir una segunda jornada para la misma sucursal y fecha.</span></div>
        )}
        {cashSummary && cashSummary.recentSessions.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-bold text-ink">Historial de cierres</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="p-2">Fecha</th><th className="p-2">Sucursal</th><th className="p-2">Estado</th><th className="p-2">Esperado</th><th className="p-2">Declarado</th><th className="p-2">Diferencia</th></tr></thead><tbody>{cashSummary.recentSessions.map((session) => <tr key={session.id} className="border-b border-line"><td className="p-2">{session.businessDate}</td><td className="p-2">{session.branchName ?? session.branchId}</td><td className="p-2">{session.status === 'OPEN' ? 'Abierta' : 'Cerrada'}</td><td className="p-2">{session.expectedCash === null ? '—' : formatCurrency(session.expectedCash)}</td><td className="p-2">{session.declaredCash === null ? '—' : formatCurrency(session.declaredCash)}</td><td className={`p-2 font-bold ${(session.variance ?? 0) === 0 ? 'text-brand-800' : 'text-red-700'}`}>{session.variance === null ? '—' : formatCurrency(session.variance)}</td></tr>)}</tbody></table></div></details>}
      </Card>

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
            <div className="mt-4 space-y-2">{visiblePayments.map((item) => <div key={item.method} className="flex items-center justify-between gap-3 rounded-field bg-surface-muted px-3 py-2 text-sm"><span className="text-ink-muted">{PAYMENT_LABEL[item.method] ?? item.method} · {item.transactions}</span><b className={item.method.endsWith('_pending') ? 'text-amber-800' : 'text-ink'}>{formatCurrency(item.amount)}</b></div>)}</div>
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
