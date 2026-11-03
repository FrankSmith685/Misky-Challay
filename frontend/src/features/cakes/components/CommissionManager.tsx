import { useEffect, useMemo, useState } from 'react';
import { Calculator, ClipboardList, RefreshCw, Search, WalletCards } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Modal } from '@components/ui/Modal';
import { Pagination } from '@components/ui/Pagination';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi, type CakeCommissionReport, type CakeCommissionRow } from '../cakes.service';

type Action = 'adjust' | 'settle';
type StatusFilter = 'ALL' | 'PENDING' | 'LIQUIDATED' | 'OVERPAID';
const PAGE_SIZE = 8;
const fieldClass = 'mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-normal text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const rowName = (row: CakeCommissionRow) => row.order?.orderNumber ?? `Pedido ${row.orderId}`;

export const CommissionManager = ({ report, onRefresh }: { report: CakeCommissionReport | null; onRefresh: () => Promise<void> }) => {
  const [selected, setSelected] = useState<CakeCommissionRow | null>(null);
  const [action, setAction] = useState<Action>('settle');
  const [adjustment, setAdjustment] = useState('0');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => report?.rows ?? [], [report]);
  const summary = report?.summary;
  const pendingCount = rows.filter((row) => Number(row.outstandingAmount) > 0).length;
  const overpaidCount = rows.filter((row) => Number(row.overpaidAmount) > 0).length;
  const filteredRows = useMemo(() => rows.filter((row) => {
    const term = query.trim().toLocaleLowerCase('es');
    const searchable = `${rowName(row)} ${row.orderId}`.toLocaleLowerCase('es');
    const matchesStatus = statusFilter === 'ALL' ||
      (statusFilter === 'OVERPAID' ? Number(row.overpaidAmount) > 0 : row.status === statusFilter);
    return (!term || searchable.includes(term)) && matchesStatus;
  }), [rows, query, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, statusFilter, report]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const open = (row: CakeCommissionRow, next: Action) => {
    setSelected(row);
    setAction(next);
    setAdjustment(String(row.adjustmentAmount));
    setAmount(Number(row.outstandingAmount).toFixed(2));
    setReference('');
    setNotes('');
    setError('');
  };
  const close = () => { if (!busy) { setSelected(null); setError(''); } };
  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  const adjustedBase = selected ? Math.max(0, Number(selected.baseAmount) + Number(adjustment || 0) - Number(selected.refundAmount)) : 0;
  const adjustedCommission = selected ? roundMoney(adjustedBase * Number(selected.rate)) : 0;
  const adjustedOutstanding = selected ? Math.max(0, roundMoney(adjustedCommission - Number(selected.settledAmount))) : 0;
  const settlementRemainder = selected ? Math.max(0, roundMoney(Number(selected.outstandingAmount) - Number(amount || 0))) : 0;

  const perform = async () => {
    if (!selected) return;
    const adjustmentValue = Number(adjustment);
    const transferValue = Number(amount);
    if (action === 'adjust' && (
      adjustment.trim() === '' || !Number.isFinite(adjustmentValue) || Math.abs(adjustmentValue) > 100000 ||
      roundMoney(adjustmentValue) === roundMoney(Number(selected.adjustmentAmount)) ||
      notes.trim().length < 3 || notes.trim().length > 500
    )) { setError('Indica un ajuste distinto al actual, entre -100 000 y 100 000, y un motivo de 3 a 500 caracteres.'); return; }
    if (action === 'settle' && (
      reference.trim().length < 3 || reference.trim().length > 120 || notes.trim().length > 500 ||
      amount.trim() === '' || !Number.isFinite(transferValue) || roundMoney(transferValue) <= 0 || transferValue > 1000000 ||
      roundMoney(transferValue) > roundMoney(Number(selected.outstandingAmount))
    )) { setError('Indica una referencia de 3 a 120 caracteres y un importe positivo que no supere el saldo pendiente.'); return; }

    setBusy(true);
    setError('');
    try {
      if (action === 'adjust') await cakesApi.adjustCommission(selected.id, adjustmentValue, notes.trim());
      else await cakesApi.liquidateCommission(selected.id, reference.trim(), transferValue, notes.trim() || undefined);
      toast.success(action === 'adjust' ? 'Ajuste guardado' : 'Transferencia registrada');
      setSelected(null);
      await onRefresh();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5">
      <Card className="border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm"><Calculator className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Control de comisiones</p>
              <h2 className="mt-1 text-lg font-black text-ink">Del cobro de la torta al saldo por transferir</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">El sistema calcula la comisión cuando se cobra una torta. Después, el propietario registra las transferencias que realmente hizo a Misky Challay para descontarlas del saldo pendiente.</p>
            </div>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} isLoading={refreshing} onClick={() => void refresh()}>Actualizar</Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
        <Card className="border-brand-700 bg-brand-800 p-5 text-white"><p className="text-xs font-bold uppercase tracking-wide text-white/75">Pendiente de transferir</p><p className="mt-2 text-3xl font-black tabular-nums">{formatCurrency(Number(summary?.outstanding ?? 0))}</p><p className="mt-2 text-xs leading-5 text-white/80">{pendingCount} {pendingCount === 1 ? 'pedido con saldo pendiente' : 'pedidos con saldo pendiente'}.</p></Card>
        <Card className="p-5"><p className="text-xs font-bold text-ink-muted">Base cobrada de tortas</p><p className="mt-2 text-xl font-black tabular-nums text-ink">{formatCurrency(Number(summary?.baseAmount ?? 0))}</p><p className="mt-2 text-xs leading-5 text-ink-muted">Parte de las tortas efectivamente cobrada, tras descuentos y sin reparto.</p></Card>
        <Card className="p-5"><p className="text-xs font-bold text-ink-muted">Comisión generada</p><p className="mt-2 text-xl font-black tabular-nums text-ink">{formatCurrency(Number(summary?.commission ?? 0))}</p><p className="mt-2 text-xs leading-5 text-ink-muted">15 % de la base, ajustada por correcciones y reembolsos.</p></Card>
        <Card className="p-5"><p className="text-xs font-bold text-ink-muted">Transferencias registradas</p><p className="mt-2 text-xl font-black tabular-nums text-ink">{formatCurrency(Number(summary?.settled ?? 0))}</p><p className="mt-2 text-xs leading-5 text-ink-muted">Importes enviados y anotados con su referencia.</p></Card>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2"><ClipboardList className="size-5 text-brand-700" /><h3 className="font-black text-ink">Cómo funciona</h3></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface-muted p-3"><span className="text-xs font-black text-brand-700">1 · Cálculo automático</span><p className="mt-1 text-xs leading-5 text-ink-muted">Se toma solo la parte cobrada de la torta. Descuentos y reembolsos reducen la base; el reparto queda fuera.</p></div>
          <div className="rounded-xl border border-line bg-surface-muted p-3"><span className="text-xs font-black text-brand-700">2 · Transferencia real</span><p className="mt-1 text-xs leading-5 text-ink-muted">El negocio envía el dinero por fuera del sistema. Esta pantalla registra el importe y la referencia, pero no mueve fondos.</p></div>
          <div className="rounded-xl border border-line bg-surface-muted p-3"><span className="text-xs font-black text-brand-700">3 · Saldo actualizado</span><p className="mt-1 text-xs leading-5 text-ink-muted">Cada registro reduce lo pendiente. Un ajuste justificado corrige la base mientras la liquidación siga abierta.</p></div>
        </div>
        {(Number(summary?.adjustments ?? 0) !== 0 || Number(summary?.refunds ?? 0) > 0) && <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-muted">Correcciones registradas: {formatCurrency(Number(summary?.adjustments ?? 0))} · reembolsos aplicados: {formatCurrency(Number(summary?.refunds ?? 0))}.</p>}
      </Card>

      {overpaidCount > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p><strong>{formatCurrency(Number(summary?.overpaid ?? 0))} transferidos en exceso</strong> en {overpaidCount} {overpaidCount === 1 ? 'pedido' : 'pedidos'} después de correcciones o reembolsos. Revisa estos casos antes de la siguiente liquidación.</p><Button size="sm" variant="outline" onClick={() => setStatusFilter('OVERPAID')}>Ver casos</Button></div>}

      {rows.length === 0 ? <Card className="flex flex-col items-center px-5 py-10 text-center"><span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><WalletCards className="size-6" /></span><h3 className="mt-3 font-black text-ink">Aún no hay comisiones en esta sucursal</h3><p className="mt-1 max-w-md text-sm leading-6 text-ink-muted">Aparecerán automáticamente cuando se cobre un pedido que incluya una torta. No necesitas crear una liquidación manualmente.</p></Card> : <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="font-black text-ink">Liquidaciones por pedido</h3><p className="mt-1 text-xs text-ink-muted">Busca un pedido, revisa cómo se calculó y consulta su historial de transferencias.</p></div><div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_185px] lg:w-[500px]"><label className="block text-xs font-bold text-ink-muted">Buscar pedido<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número de pedido" className="h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm font-normal text-ink" /></span></label><label className="block text-xs font-bold text-ink-muted">Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink"><option value="ALL">Todas</option><option value="PENDING">Abiertas</option><option value="LIQUIDATED">Liquidadas</option><option value="OVERPAID">Con exceso</option></select></label></div></div>
        {filteredRows.length === 0 ? <div className="border-t border-line p-8 text-center text-sm text-ink-muted">No hay liquidaciones que coincidan con la búsqueda. <button type="button" className="font-bold text-brand-700 underline" onClick={() => { setQuery(''); setStatusFilter('ALL'); }}>Limpiar filtros</button></div> : <div className="divide-y divide-line border-t border-line">{pageRows.map((row) => {
          const due = Number(row.outstandingAmount);
          const overpaid = Number(row.overpaidAmount);
          const effectiveBase = Math.max(0, Number(row.baseAmount) + Number(row.adjustmentAmount) - Number(row.refundAmount));
          return <article key={row.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-black text-ink">{rowName(row)}</h4><p className="mt-1 text-xs text-ink-muted">Pedido del {row.order?.placedAt ? new Date(row.order.placedAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : 'día no disponible'} · Tasa {(Number(row.rate) * 100).toFixed(0)} %</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${overpaid > 0 ? 'bg-amber-50 text-amber-900' : due > 0 ? 'bg-brand-50 text-brand-800' : 'bg-green-50 text-green-800'}`}>{overpaid > 0 ? 'Con exceso' : due > 0 ? 'Saldo pendiente' : row.status === 'LIQUIDATED' ? 'Liquidada' : 'Sin saldo por pagar'}</span></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-line bg-surface-muted p-3"><p className="text-xs text-ink-muted">Comisión de este pedido</p><p className="mt-1 text-lg font-black tabular-nums text-ink">{formatCurrency(Number(row.commissionAmount))}</p></div><div className="rounded-xl border border-line bg-surface-muted p-3"><p className="text-xs text-ink-muted">Transferido</p><p className="mt-1 text-lg font-black tabular-nums text-ink">{formatCurrency(Number(row.settledAmount))}</p></div><div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3"><p className="text-xs text-brand-800">{overpaid > 0 ? 'Transferido en exceso' : 'Pendiente'}</p><p className="mt-1 text-lg font-black tabular-nums text-brand-900">{formatCurrency(overpaid > 0 ? overpaid : due)}</p></div></div>
            <details className="group mt-3 rounded-xl border border-line bg-white text-sm"><summary className="cursor-pointer px-3 py-2.5 font-bold text-brand-800">Ver cálculo e historial</summary><div className="border-t border-line px-3 py-3 text-xs text-ink-muted"><div className="grid gap-2 sm:grid-cols-2"><p>Base cobrada: <strong className="text-ink">{formatCurrency(Number(row.baseAmount))}</strong></p><p>Ajuste: <strong className="text-ink">{formatCurrency(Number(row.adjustmentAmount))}</strong></p><p>Reembolso: <strong className="text-ink">{formatCurrency(Number(row.refundAmount))}</strong></p><p>Base para calcular ({(Number(row.rate) * 100).toFixed(0)} %): <strong className="text-ink">{formatCurrency(effectiveBase)}</strong></p></div>{row.settlements.length > 0 ? <div className="mt-3 border-t border-line pt-3"><p className="font-bold text-ink">Transferencias registradas ({row.settlements.length})</p><ol className="mt-2 space-y-1">{row.settlements.map((entry) => <li key={entry.id}>{new Date(entry.createdAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })} · {formatCurrency(Number(entry.amount))} · Ref. {entry.reference}</li>)}</ol></div> : <p className="mt-3 border-t border-line pt-3">Aún no hay transferencias registradas para este pedido.</p>}</div></details>
            {report?.canManage && <div className="mt-4 flex flex-wrap gap-2">{row.status !== 'LIQUIDATED' && <Button size="sm" variant="outline" onClick={() => open(row, 'adjust')}>Ajustar base</Button>}{due > 0 && <Button size="sm" onClick={() => open(row, 'settle')}>Registrar transferencia</Button>}</div>}
          </article>;
        })}</div>}
        {filteredRows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><p className="text-xs text-ink-muted">{filteredRows.length} {filteredRows.length === 1 ? 'pedido' : 'pedidos'} · página {page} de {totalPages}</p><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
      </Card>}

      <Modal isOpen={Boolean(selected)} onClose={close} disableBackdropClose maxWidth="sm" icon={WalletCards} eyebrow="COMISIONES" title={action === 'adjust' ? 'Ajustar base de comisión' : 'Registrar transferencia'} description={action === 'adjust' ? 'Corrige la base de este pedido e indica el motivo. La comisión se recalculará al guardar.' : 'Anota una transferencia que ya realizaste fuera del sistema. Esta acción no envía dinero.'} actions={<><Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button><Button onClick={() => void perform()} disabled={busy} isLoading={busy}>{action === 'adjust' ? 'Guardar ajuste' : 'Registrar transferencia'}</Button></>}>
        {selected && <div className="space-y-4">
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm"><strong className="text-ink">{rowName(selected)}</strong><p className="mt-1 text-ink-muted">Comisión actual: {formatCurrency(Number(selected.commissionAmount))} · pendiente: {formatCurrency(Number(selected.outstandingAmount))}</p></div>
          {action === 'adjust' ? <>
            <label className="block text-sm font-semibold text-ink">Ajuste a la base (S/)<input type="number" step="0.01" inputMode="decimal" className={fieldClass} value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /><span className="mt-1 block text-xs font-normal text-ink-muted">Ingresa el ajuste total de este pedido. Puede ser positivo o negativo; reemplaza el valor anterior.</span></label>
            <label className="block text-sm font-semibold text-ink">Motivo del ajuste<input className={fieldClass} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. corrección por devolución" /></label>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-muted p-3 text-sm"><p>Comisión recalculada<br /><strong className="text-ink">{Number.isFinite(adjustedCommission) ? formatCurrency(adjustedCommission) : '—'}</strong></p><p>Saldo resultante<br /><strong className="text-ink">{Number.isFinite(adjustedOutstanding) ? formatCurrency(adjustedOutstanding) : '—'}</strong></p></div>
            {adjustedCommission < Number(selected.settledAmount) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Este ajuste dejaría un importe transferido en exceso de {formatCurrency(roundMoney(Number(selected.settledAmount) - adjustedCommission))}. Revísalo antes de guardar.</p>}
          </> : <>
            <label className="block text-sm font-semibold text-ink">Importe ya transferido (S/)<input type="number" min="0.01" max={Number(selected.outstandingAmount)} step="0.01" inputMode="decimal" className={fieldClass} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label className="block text-sm font-semibold text-ink">Referencia bancaria o comprobante<input className={fieldClass} maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Número de operación" /></label>
            <label className="block text-sm font-semibold text-ink">Nota (opcional)<input className={fieldClass} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-muted p-3 text-sm"><p>Saldo actual<br /><strong className="text-ink">{formatCurrency(Number(selected.outstandingAmount))}</strong></p><p>Quedará pendiente<br /><strong className="text-ink">{Number.isFinite(settlementRemainder) ? formatCurrency(settlementRemainder) : '—'}</strong></p></div>
          </>}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </div>}
      </Modal>
    </section>
  );
};
