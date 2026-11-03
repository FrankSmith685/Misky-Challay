import { useLiveRefresh } from '@services/realtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, CreditCard, ReceiptText, RefreshCw, Search, ShoppingBag, Wallet } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Pagination } from '@components/ui/Pagination';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi, type CakeFinanceReport } from '../cakes.service';

type Mode = 'expense' | 'supplier' | 'fee' | 'platform';
type EntryKind = 'all' | 'BUSINESS_EXPENSE' | 'SUPPLIER_PAYMENT' | 'PAYMENT_FEE';

const PAGE_SIZE = 8;
const CATEGORY_LABELS: Record<string, string> = {
  LABOR: 'Mano de obra', PACKAGING: 'Empaque', UTILITIES: 'Servicios',
  RENT: 'Alquiler', DELIVERY: 'Reparto', MARKETING: 'Marketing',
  HOSTING: 'Alojamiento web', SOFTWARE: 'Software', OTHER: 'Otro',
};
const KIND_LABELS: Record<string, string> = {
  BUSINESS_EXPENSE: 'Gasto del negocio', PLATFORM_EXPENSE: 'Gasto Misky Challay',
  SUPPLIER_PAYMENT: 'Pago a proveedor', PAYMENT_FEE: 'Tarifa Mercado Pago',
};
const MODE_LABELS: Record<Mode, string> = {
  expense: 'Gasto', supplier: 'Pago a proveedor', fee: 'Tarifa de pago', platform: 'Gasto Misky Challay',
};
const MODE_HELP: Record<Mode, string> = {
  expense: 'Registra mano de obra, empaque u otro gasto. Si eliges un pedido, se descuenta de su margen; sin pedido, queda como gasto general de la sucursal.',
  supplier: 'Anota un pago que ya realizaste por una orden de compra. Reduce su saldo pendiente; no vuelve a descontarse del margen de las tortas.',
  fee: 'Concilia un cobro de Mercado Pago: el importe cobrado debe ser igual al neto recibido más la tarifa descontada.',
  platform: 'Registra un gasto global de Misky Challay. Se muestra por separado del resultado de esta sucursal.',
};
const fieldClass = 'mt-1 block w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'block min-w-0 text-sm font-semibold text-ink';

const todayInLima = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const SummaryLine = ({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) => (
  <div className={`flex items-center justify-between gap-3 py-2.5 text-sm ${strong ? 'border-t border-line font-black text-ink' : 'text-ink-muted'}`}>
    <span>{label}</span><span className="shrink-0 tabular-nums text-ink">{formatCurrency(value)}</span>
  </div>
);

export const CakeFinanceBoard = ({ branchId }: { branchId: number | null }) => {
  const [report, setReport] = useState<CakeFinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [mode, setMode] = useState<Mode>('expense');
  const [category, setCategory] = useState('LABOR');
  const [amount, setAmount] = useState('');
  const [net, setNet] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayInLima);
  const [notes, setNotes] = useState('');
  const [orderId, setOrderId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [entryKind, setEntryKind] = useState<EntryKind>('all');
  const [entryQuery, setEntryQuery] = useState('');
  const [ordersPage, setOrdersPage] = useState(1);
  const [entriesPage, setEntriesPage] = useState(1);
  const requestId = useRef(0);
  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (background = false) => {
    if (!branchId) { setReport(null); setLoading(false); return; }
    const currentRequest = ++requestId.current;
    if (!background) { setLoading(true); setReport(null); }
    setError('');
    try {
      const data = await cakesApi.financeReport(branchId, period.from || undefined, period.to || undefined);
      if (currentRequest !== requestId.current) return;
      setReport(data);
      if (!data.canManageFinance && data.canManagePlatform) setMode('platform');
    } catch (cause) {
      if (currentRequest === requestId.current) setError(getApiErrorMessage(cause));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [branchId, period]);

  useEffect(() => { void load(); return () => { requestId.current += 1; }; }, [load]);

  useLiveRefresh(['finance', 'orders', 'payments', 'inventory', 'procurement'], () => load(true));

  const payments = useMemo(() => report?.rows.flatMap((row) => row.payments
    .filter((payment) => !payment.reconciled && payment.provider === 'mercadopago')
    .map((payment) => ({ ...payment, orderNumber: row.orderNumber }))) ?? [], [report]);
  const availablePurchases = useMemo(() => report?.purchaseOrders.filter((row) => row.paid < row.total) ?? [], [report]);
  const selectedPayment = payments.find((payment) => payment.id === Number(paymentId));
  const selectedPurchase = availablePurchases.find((purchase) => purchase.id === Number(purchaseOrderId));
  const filteredOrders = useMemo(() => (report?.rows ?? []).filter((row) =>
    row.orderNumber.toLowerCase().includes(orderQuery.trim().toLowerCase()) && (!onlyIncomplete || !row.costsComplete)), [report, orderQuery, onlyIncomplete]);
  const filteredEntries = useMemo(() => (report?.entries ?? []).filter((entry) =>
    (entryKind === 'all' || entry.kind === entryKind) &&
    entry.reference.toLowerCase().includes(entryQuery.trim().toLowerCase())), [report, entryKind, entryQuery]);
  const ordersTotalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const entriesTotalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const visibleOrders = filteredOrders.slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE);
  const visibleEntries = filteredEntries.slice((entriesPage - 1) * PAGE_SIZE, entriesPage * PAGE_SIZE);

  useEffect(() => { setOrdersPage(1); }, [orderQuery, onlyIncomplete, report]);
  useEffect(() => { setEntriesPage(1); }, [entryKind, entryQuery, report]);

  const applyPeriod = () => {
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setError('La fecha inicial debe ser anterior o igual a la fecha final.');
      return;
    }
    setError('');
    if (draftFrom === period.from && draftTo === period.to) void load();
    else setPeriod({ from: draftFrom, to: draftTo });
  };

  const startRecord = (nextMode: Mode, nextOrderId = '', nextCategory?: string, nextPaymentId = '') => {
    setMode(nextMode);
    setCategory(nextCategory ?? (nextMode === 'platform' ? 'HOSTING' : 'LABOR'));
    setOrderId(nextOrderId);
    setPaymentId(nextPaymentId);
    setPurchaseOrderId('');
    setAmount('');
    setNet('');
    setFormError('');
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const save = async () => {
    if (!branchId) return;
    setBusy(true);
    setFormError('');
    try {
      const value = Number(amount);
      if (!date || reference.trim().length < 3 || amount === '' || !Number.isFinite(value) || value < 0 || (mode !== 'fee' && value === 0)) {
        throw new Error('Completa la fecha, un importe válido y una referencia de al menos 3 caracteres.');
      }
      if (mode === 'supplier' && (!selectedPurchase || value > selectedPurchase.total - selectedPurchase.paid)) {
        throw new Error('Selecciona una compra y registra un importe que no supere su saldo pendiente.');
      }
      if (mode === 'fee' && (!selectedPayment || net === '' || !Number.isFinite(Number(net)) || Number(net) < 0 ||
        Math.round((value + Number(net)) * 100) !== Math.round(selectedPayment.amount * 100))) {
        throw new Error('Selecciona un pago y comprueba que tarifa más neto sea igual al importe cobrado.');
      }
      const base = { reference: reference.trim(), occurredAt: new Date(`${date}T12:00:00-05:00`).toISOString(), notes: notes.trim() || undefined };
      if (mode === 'expense') await cakesApi.createExpense({ ...base, branchId, category, amount: value, orderId: orderId ? Number(orderId) : undefined });
      if (mode === 'supplier') await cakesApi.recordSupplierPayment({ ...base, branchId, purchaseOrderId: Number(purchaseOrderId), amount: value });
      if (mode === 'fee') await cakesApi.reconcilePayment({ ...base, branchId, paymentId: Number(paymentId), fee: value, netAmount: Number(net) });
      if (mode === 'platform') await cakesApi.createPlatformExpense({ ...base, category, amount: value });
      toast.success('Movimiento registrado');
      setReference(''); setAmount(''); setNet(''); setNotes('');
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error && !('response' in cause) ? cause.message : getApiErrorMessage(cause));
    } finally { setBusy(false); }
  };

  if (!branchId) return <Card className="p-5 text-sm text-ink-muted">Selecciona una sucursal para consultar sus costos y pagos.</Card>;
  if (loading) return <Card className="p-5 text-sm text-ink-muted">Cargando ingresos, costos y movimientos de esta sucursal…</Card>;
  if (!report) return <Card className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-red-700"><span>{error || 'No se pudo cargar el informe financiero.'}</span><Button size="sm" variant="outline" onClick={() => void load()}>Reintentar</Button></Card>;

  const summary = report.summary;
  const canRecord = report.canManageFinance || report.canManagePlatform;
  const availableModes: Mode[] = [
    ...(report.canManageFinance ? ['expense', 'supplier', 'fee'] as Mode[] : []),
    ...(report.canManagePlatform ? ['platform'] as Mode[] : []),
  ];
  const selectedMode = availableModes.includes(mode) ? mode : availableModes[0];

  return (
    <section className="space-y-5">
      <Card className="border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm"><Calculator className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Costos y pagos</p>
            <h2 className="mt-1 text-lg font-black text-ink">¿Cuánto deja cada torta y qué pagos faltan?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">Aquí comparas las ventas cobradas con insumos, gastos, tarifas y comisión. También registras pagos a proveedores y consultas su saldo. Las cifras se recalculan con los movimientos guardados.</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 lg:max-w-xs lg:mr-auto">
            <h3 className="font-black text-ink">Período del informe</h3>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Los pedidos se filtran por fecha de creación; los movimientos, por fecha de registro. Deja ambas fechas vacías para ver todo el historial.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[440px]">
            <label className={labelClass}>Desde<input type="date" className={fieldClass} value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} /></label>
            <label className={labelClass}>Hasta<input type="date" className={fieldClass} value={draftTo} onChange={(event) => setDraftTo(event.target.value)} /></label>
          </div>
          <Button className="w-full lg:w-auto" size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={applyPeriod}>Consultar</Button>
        </div>
      </Card>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_1fr]">
        <Card className="border-brand-700 bg-brand-800 p-5 text-white">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/75"><Wallet className="size-4" /> Resultado operativo estimado</div>
          <p className="mt-3 text-3xl font-black tabular-nums">{formatCurrency(summary.operatingContribution)}</p>
          <p className="mt-2 text-xs leading-5 text-white/80">Margen de las tortas menos gastos generales registrados en el período.</p>
        </Card>
        <Card className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Ventas netas de tortas</p><p className="mt-3 text-2xl font-black tabular-nums text-ink">{formatCurrency(summary.revenue)}</p><p className="mt-2 text-xs leading-5 text-ink-muted">Pedidos cobrados incluidos en el período, después de devoluciones.</p></Card>
        <Card className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Margen de las tortas</p><p className="mt-3 text-2xl font-black tabular-nums text-ink">{formatCurrency(summary.contribution)}</p><p className="mt-2 text-xs leading-5 text-ink-muted">Ventas menos materiales, gastos directos, tarifas y comisión.</p></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2"><Calculator className="size-5 text-brand-700" /><h3 className="font-black text-ink">Cómo se obtiene el margen</h3></div>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Se usa el costo estimado de insumos hasta que Producción registra el consumo real.</p>
          <div className="mt-3 divide-y divide-line">
            <SummaryLine label="Ventas netas" value={summary.revenue} />
            <SummaryLine label="− Insumos utilizados o estimados" value={summary.materials} />
            <SummaryLine label="− Gastos directos, mano de obra y empaque" value={summary.directExpenses} />
            <SummaryLine label="− Tarifas de pago conciliadas" value={summary.paymentFees} />
            <SummaryLine label="− Comisión Misky Challay" value={summary.commission} />
            <SummaryLine label="Margen de las tortas" value={summary.contribution} strong />
            <SummaryLine label="− Gastos generales de la sucursal" value={summary.generalExpenses} />
          </div>
          {summary.incompleteOrders > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{summary.incompleteOrders} {summary.incompleteOrders === 1 ? 'pedido tiene' : 'pedidos tienen'} costos pendientes de revisar. El resultado es provisional; usa el filtro «Por revisar» de abajo.</p>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2"><ShoppingBag className="size-5 text-brand-700" /><h3 className="font-black text-ink">Compras y pagos a proveedores</h3></div>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Los saldos de compras corresponden a todas las órdenes activas de la sucursal, aunque filtres un período. «Pagado» sí respeta las fechas elegidas.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Compras activas acumuladas</p><p className="mt-1 text-xl font-black tabular-nums text-ink">{formatCurrency(summary.supplierCommitted)}</p></div>
            <div className="rounded-xl border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Saldo por pagar acumulado</p><p className="mt-1 text-xl font-black tabular-nums text-ink">{formatCurrency(summary.supplierOutstanding)}</p></div>
            <div className="rounded-xl border border-line bg-surface-muted p-4 sm:col-span-2"><p className="text-xs text-ink-muted">Pagado a proveedores en el período</p><p className="mt-1 text-xl font-black tabular-nums text-ink">{formatCurrency(summary.supplierPaid)}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-muted">Registrar un pago reduce el saldo de la compra. El costo de insumos ya se refleja en el margen de cada torta según su receta o consumo real.</p>
        </Card>
      </div>

      {report.platform && <Card className="border-brand-200 bg-brand-50/60 p-5"><div className="flex items-center gap-2"><Wallet className="size-5 text-brand-700" /><h3 className="font-black text-ink">Misky Challay · vista global del propietario</h3></div><p className="mt-1 text-xs text-ink-muted">Estas cifras reúnen todas las sucursales y se muestran separadas del resultado de la sucursal seleccionada.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([['Comisión devengada', report.platform.earned], ['Transferencias registradas', report.platform.received], ['Gastos de plataforma', report.platform.operatingExpenses], ['Resultado estimado', report.platform.contribution]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-brand-100 bg-white p-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-lg font-black tabular-nums text-ink">{formatCurrency(value)}</p></div>)}</div></Card>}

      {canRecord && <div ref={formRef} className="scroll-mt-5"><Card className="p-5">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><ReceiptText className="size-5" /></span><div><h3 className="font-black text-ink">Registrar un movimiento</h3><p className="mt-1 text-sm text-ink-muted">Elige qué ocurrió y guarda el importe junto con la fecha y la referencia del comprobante.</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de movimiento">{availableModes.map((entry) => <button key={entry} type="button" role="tab" aria-selected={selectedMode === entry} className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${selectedMode === entry ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink-muted hover:border-brand-300 hover:text-brand-800'}`} onClick={() => startRecord(entry)}>{MODE_LABELS[entry]}</button>)}</div>
        <p className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm leading-5 text-ink-muted">{MODE_HELP[selectedMode]}</p>
        {selectedMode === 'supplier' && availablePurchases.length === 0 && <p className="mt-3 rounded-lg border border-line bg-surface-muted p-3 text-sm text-ink-muted">No hay órdenes de compra activas con saldo pendiente en esta sucursal.</p>}
        {selectedMode === 'fee' && payments.length === 0 && <p className="mt-3 rounded-lg border border-line bg-surface-muted p-3 text-sm text-ink-muted">No hay cobros de Mercado Pago pendientes de conciliar en los pedidos incluidos en el informe.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(selectedMode === 'expense' || selectedMode === 'platform') && <label className={labelClass}>Categoría<select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)}>{(selectedMode === 'platform' ? ['HOSTING', 'SOFTWARE', 'MARKETING', 'LABOR', 'OTHER'] : ['LABOR', 'PACKAGING', 'UTILITIES', 'RENT', 'DELIVERY', 'MARKETING', 'OTHER']).map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}</select></label>}
          {selectedMode === 'expense' && <label className={labelClass}>Pedido asociado<select className={fieldClass} value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Ninguno · gasto general</option>{report.rows.map((row) => <option key={row.orderId} value={row.orderId}>{row.orderNumber}</option>)}</select></label>}
          {selectedMode === 'supplier' && <label className={labelClass}>Orden de compra<select className={fieldClass} value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)}><option value="">Selecciona una compra</option>{availablePurchases.map((row) => <option key={row.id} value={row.id}>{row.orderNumber} · pendiente {formatCurrency(row.total - row.paid)}</option>)}</select></label>}
          {selectedMode === 'fee' && <label className={labelClass}>Cobro de Mercado Pago<select className={fieldClass} value={paymentId} onChange={(event) => { setPaymentId(event.target.value); const payment = payments.find((row) => row.id === Number(event.target.value)); setNet(payment && amount !== '' ? Math.max(0, payment.amount - Number(amount)).toFixed(2) : ''); }}><option value="">Selecciona un cobro</option>{payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.orderNumber} · {formatCurrency(payment.amount)}</option>)}</select></label>}
          <label className={labelClass}>{selectedMode === 'fee' ? 'Tarifa descontada (S/)' : 'Importe (S/)'}<input type="number" min="0" step="0.01" inputMode="decimal" className={fieldClass} value={amount} onChange={(event) => { setAmount(event.target.value); if (selectedMode === 'fee') setNet(selectedPayment && event.target.value !== '' ? Math.max(0, selectedPayment.amount - Number(event.target.value)).toFixed(2) : ''); }} /></label>
          {selectedMode === 'fee' && <label className={labelClass}>Neto recibido (S/)<input type="number" min="0" step="0.01" inputMode="decimal" className={fieldClass} value={net} onChange={(event) => setNet(event.target.value)} /></label>}
          <label className={labelClass}>Referencia del comprobante<input className={fieldClass} maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ej. transferencia 12345" /></label>
          <label className={labelClass}>Fecha del movimiento<input type="date" className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}>Notas (opcional)<input className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalle útil para la conciliación" /></label>
        </div>
        {selectedMode === 'supplier' && selectedPurchase && <p className="mt-3 text-sm text-ink-muted">Saldo disponible de esta compra: <strong className="text-ink">{formatCurrency(selectedPurchase.total - selectedPurchase.paid)}</strong></p>}
        {selectedMode === 'fee' && selectedPayment && <p className="mt-3 text-sm text-ink-muted">Cobrado: <strong className="text-ink">{formatCurrency(selectedPayment.amount)}</strong> = tarifa + neto recibido.</p>}
        {formError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
        <div className="mt-5 flex justify-end border-t border-line pt-4"><Button size="sm" disabled={busy || (selectedMode === 'supplier' && !selectedPurchase) || (selectedMode === 'fee' && !selectedPayment)} isLoading={busy} onClick={() => void save()}>Registrar {MODE_LABELS[selectedMode].toLowerCase()}</Button></div>
      </Card></div>}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-ink">Resultado por pedido</h3><p className="mt-1 text-xs text-ink-muted">Revisa qué pedidos aún necesitan costos o tarifas para completar su resultado.</p></div><div className="flex flex-wrap items-center gap-3"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" /><span className="sr-only">Buscar pedido</span><input className={`${fieldClass} mt-0 w-full pl-9 sm:w-44`} value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Buscar pedido" /></label><label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={onlyIncomplete} onChange={(event) => setOnlyIncomplete(event.target.checked)} /> Por revisar{summary.incompleteOrders > 0 ? ` (${summary.incompleteOrders})` : ''}</label></div></div>
        {filteredOrders.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[870px] text-left text-sm"><thead className="border-y border-line bg-surface-muted text-xs uppercase text-ink-muted"><tr><th scope="col" className="p-3">Pedido</th><th scope="col" className="p-3">Venta</th><th scope="col" className="p-3">Insumos</th><th scope="col" className="p-3">Gastos y tarifa</th><th scope="col" className="p-3">Comisión</th><th scope="col" className="p-3">Margen</th><th scope="col" className="p-3">Revisión</th></tr></thead><tbody>{visibleOrders.map((row) => { const missing = [row.missingMaterialCost ? 'Costo de insumos' : '', row.missingPaymentFee ? 'Tarifa de pago' : '', row.missingLabor ? 'Mano de obra' : '', row.missingPackaging ? 'Empaque' : '', row.mixedProducts ? 'Pedido mixto' : ''].filter(Boolean); const pendingFee = row.payments.find((payment) => payment.provider === 'mercadopago' && !payment.reconciled); return <tr key={row.orderId} className="border-b border-line align-top last:border-b-0"><td className="p-3 font-bold text-ink">{row.orderNumber}</td><td className="p-3 tabular-nums">{formatCurrency(row.revenue)}</td><td className="p-3 tabular-nums">{formatCurrency(row.materialCost)}<span className="block text-xs text-ink-muted">{row.materialCostType === 'ESTIMATED' ? 'Estimado' : 'Consumo real'}</span></td><td className="p-3 tabular-nums">{formatCurrency(row.directExpenses + row.paymentFees)}</td><td className="p-3 tabular-nums">{formatCurrency(row.platformCommission)}</td><td className="p-3 font-black tabular-nums text-ink">{formatCurrency(row.contribution)}</td><td className="p-3 text-xs"><span className={row.costsComplete ? 'font-bold text-green-700' : 'font-bold text-amber-800'}>{row.costsComplete ? 'Costos completos' : `Falta: ${missing.join(', ')}`}</span>{report.canManageFinance && !row.costsComplete && <div className="mt-2 flex flex-wrap gap-1">{row.missingLabor && <button type="button" className="font-bold text-brand-700 hover:underline" onClick={() => startRecord('expense', String(row.orderId), 'LABOR')}>Agregar mano de obra</button>}{row.missingPackaging && <button type="button" className="font-bold text-brand-700 hover:underline" onClick={() => startRecord('expense', String(row.orderId), 'PACKAGING')}>Agregar empaque</button>}{row.missingPaymentFee && pendingFee && <button type="button" className="font-bold text-brand-700 hover:underline" onClick={() => startRecord('fee', '', undefined, String(pendingFee.id))}>Conciliar tarifa</button>}</div>}</td></tr>; })}</tbody></table></div> : <div className="border-t border-line p-6 text-center text-sm text-ink-muted">{report.rows.length ? 'No hay pedidos que coincidan con estos filtros.' : 'Aún no hay pedidos de tortas cobrados para este período.'}</div>}
        {filteredOrders.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><p className="text-xs text-ink-muted">{filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'} · página {ordersPage} de {ordersTotalPages}</p><Pagination page={ordersPage} totalPages={ordersTotalPages} onChange={setOrdersPage} /></div>}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CreditCard className="size-5 text-brand-700" /><div><h3 className="font-black text-ink">Movimientos registrados</h3><p className="mt-1 text-xs text-ink-muted">Comprobantes de gastos, pagos y tarifas de esta sucursal.</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><label><span className="sr-only">Filtrar tipo de movimiento</span><select className={`${fieldClass} mt-0`} value={entryKind} onChange={(event) => setEntryKind(event.target.value as EntryKind)}><option value="all">Todos los movimientos</option><option value="BUSINESS_EXPENSE">Gastos</option><option value="SUPPLIER_PAYMENT">Pagos a proveedores</option><option value="PAYMENT_FEE">Tarifas de pago</option></select></label><label><span className="sr-only">Buscar referencia</span><input className={`${fieldClass} mt-0`} value={entryQuery} onChange={(event) => setEntryQuery(event.target.value)} placeholder="Buscar referencia" /></label></div></div>
        {filteredEntries.length > 0 ? <div className="divide-y divide-line border-t border-line">{visibleEntries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><div className="min-w-0"><p className="font-bold text-ink">{KIND_LABELS[entry.kind] ?? entry.kind}{entry.kind === 'BUSINESS_EXPENSE' && ` · ${CATEGORY_LABELS[entry.category] ?? entry.category}`}</p><p className="mt-0.5 break-all text-xs text-ink-muted">{new Date(entry.occurredAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })} · Ref. {entry.reference}</p></div><strong className="tabular-nums text-ink">{formatCurrency(entry.amount)}</strong></div>)}</div> : <div className="border-t border-line p-6 text-center text-sm text-ink-muted">{report.entries.length ? 'No hay movimientos que coincidan con estos filtros.' : 'Aún no hay movimientos registrados en este período.'}</div>}
        {filteredEntries.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><p className="text-xs text-ink-muted">{filteredEntries.length} {filteredEntries.length === 1 ? 'movimiento' : 'movimientos'} · página {entriesPage} de {entriesTotalPages}</p><Pagination page={entriesPage} totalPages={entriesTotalPages} onChange={setEntriesPage} /></div>}
      </Card>
    </section>
  );
};
