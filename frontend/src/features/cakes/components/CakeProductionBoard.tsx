import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Search } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Pagination } from '@components/ui/Pagination';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { cakesApi, type ProductionTask, type Station } from '../cakes.service';
import { MaterialUsageForm } from './MaterialUsageForm';
import { CakeThemeReference } from './CakeThemeBanner';
import { OrderCakeReference } from './OrderCakeReference';

const QA_KEYS = ['size', 'message', 'colors', 'allergens', 'packaging', 'reference'] as const;
const QA_LABELS: Record<(typeof QA_KEYS)[number], string> = { size: 'Tamaño', message: 'Mensaje', colors: 'Colores', allergens: 'Alérgenos', packaging: 'Empaque', reference: 'Referencia de diseño (si aplica)' };
const STATION_LABELS: Record<Station, string> = { DESIGN: 'Diseño', BAKING: 'Horneado', COOLING: 'Enfriado', FILLING: 'Relleno', DECORATING: 'Decoración', QA: 'Calidad', DISPATCH: 'Despacho' };
const STATUS_LABELS: Record<ProductionTask['status'], string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En proceso', BLOCKED: 'Bloqueada', DONE: 'Terminada' };
const PAGE_SIZE = 6;
const todayInLima = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const CakeProductionBoard = ({ tasks, branchId, initialOrderNumber = '', initialTaskId, onRefresh, onStatus }: {
  tasks: ProductionTask[];
  branchId: number | null;
  initialOrderNumber?: string;
  initialTaskId?: number;
  onRefresh: () => Promise<void>;
  onStatus: (task: ProductionTask, status: 'IN_PROGRESS' | 'BLOCKED' | 'DONE') => Promise<void>;
}) => {
  const appliedTask = useRef<number>();
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canOperate = can(PERM.KITCHEN_OPERATE);
  const [staff, setStaff] = useState<Array<{ id: number; firstName: string; lastName: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState(initialOrderNumber);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProductionTask['status']>('ALL');
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setStaff([]);
    if (branchId) void cakesApi.productionStaff(branchId).then((rows) => { if (active) setStaff(rows); }).catch((cause) => { if (active) setError(getApiErrorMessage(cause)); });
    return () => { active = false; };
  }, [branchId]);
  const assign = async (task: ProductionTask, assignedTo: number | null) => {
    if (!branchId || !canOperate || busy !== null) return;
    setBusy(task.id); setError('');
    try { await cakesApi.updateTask(task.id, { branchId, assignedTo }); await onRefresh(); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };
  const checklist = async (task: ProductionTask, key: string, checked: boolean) => {
    if (!branchId) return;
    setBusy(task.id); setError('');
    try { await cakesApi.updateTask(task.id, { branchId, checklistJson: { ...(task.checklistJson ?? {}), [key]: checked } }); await onRefresh(); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };
  const evidence = async (task: ProductionTask, file: File) => {
    if (!branchId) return;
    setBusy(task.id); setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer la foto'));
        reader.readAsDataURL(file);
      });
      await cakesApi.uploadEvidence(task.id, branchId, dataUrl);
      toast.success('Foto de calidad guardada');
      await onRefresh();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };
  const changeStatus = async (task: ProductionTask, status: 'IN_PROGRESS' | 'BLOCKED' | 'DONE') => {
    if (status !== 'IN_PROGRESS') {
      const { confirmed } = await confirm({
        title: status === 'DONE' ? 'Terminar etapa de producción' : 'Bloquear etapa de producción',
        message: status === 'DONE'
          ? 'Confirma que terminaste el trabajo, registraste los materiales reales y, si es control de calidad, completaste la revisión y la foto.'
          : 'Esta tarea quedará bloqueada hasta que resuelvas el problema y vuelvas a iniciarla.',
        confirmLabel: status === 'DONE' ? 'Terminar etapa' : 'Bloquear etapa',
      });
      if (!confirmed) return;
    }
    if (!canOperate || busy !== null) return;
    setBusy(task.id);
    try { await onStatus(task, status); } finally { setBusy(null); }
  };

  useEffect(() => { setQuery(initialOrderNumber); }, [initialOrderNumber]);
  const today = todayInLima();
  const openTasks = tasks.filter((task) => task.status !== 'DONE');
  const overdueCount = openTasks.filter((task) => task.workDate < today).length;
  const dueTodayCount = openTasks.filter((task) => task.workDate === today).length;
  const unassignedCount = openTasks.filter((task) => task.assignedTo == null).length;
  const blockedCount = openTasks.filter((task) => task.status === 'BLOCKED').length;
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const term = query.trim().toLocaleLowerCase('es');
    const searchable = `${task.orderId} ${task.order?.orderNumber ?? ''} ${task.workDate} ${STATION_LABELS[task.station]}`.toLocaleLowerCase('es');
    return (!term || searchable.includes(term)) && (statusFilter === 'ALL' || task.status === statusFilter);
  }).sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE') || a.workDate.localeCompare(b.workDate) || a.sequence - b.sequence), [query, statusFilter, tasks]);
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const pageTasks = filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  useEffect(() => {
    if (!initialTaskId || appliedTask.current === initialTaskId) return;
    const index = filteredTasks.findIndex((task) => task.id === initialTaskId);
    if (index < 0) return;
    appliedTask.current = initialTaskId;
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    const timer = window.setTimeout(() => document.getElementById(`task-${initialTaskId}`)?.scrollIntoView({ block: 'center' }), 100);
    return () => clearTimeout(timer);
  }, [initialTaskId, filteredTasks]);
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Estado de producción">
      {[
        { label: 'Atrasadas', value: overdueCount, detail: 'Fecha de trabajo vencida', tone: overdueCount ? 'border-red-300 bg-red-50' : 'border-line bg-white' },
        { label: 'Para hoy', value: dueTodayCount, detail: 'Etapas que deben avanzar hoy', tone: dueTodayCount ? 'border-amber-300 bg-amber-50' : 'border-line bg-white' },
        { label: 'Sin responsable', value: unassignedCount, detail: 'Asigna antes de iniciar', tone: unassignedCount ? 'border-amber-300 bg-amber-50' : 'border-line bg-white' },
        { label: 'Bloqueadas', value: blockedCount, detail: 'Requieren una solución', tone: blockedCount ? 'border-red-300 bg-red-50' : 'border-line bg-white' },
      ].map((metric) => <Card key={metric.label} className={`${metric.tone} p-4`}><p className="text-xs font-bold text-ink-muted">{metric.label}</p><p className="mt-1 text-2xl font-black text-ink">{metric.value}</p><p className="mt-1 text-xs text-ink-muted">{metric.detail}</p></Card>)}
    </div>
    {overdueCount > 0 && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">Hay {overdueCount} etapa{overdueCount === 1 ? '' : 's'} atrasada{overdueCount === 1 ? '' : 's'}. Revisa el pedido, asigna un responsable y resuelve los bloqueos antes de prometer la entrega.</p>}
    {dueTodayCount > 0 && <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Hoy hay {dueTodayCount} etapa{dueTodayCount === 1 ? '' : 's'} por trabajar. Las etapas futuras se pueden asignar ahora y se preparan según su fecha.</p>}
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/90 via-white to-white p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm"><ClipboardCheck className="size-5" /></span><div><p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Cómo funciona</p><h2 className="mt-1 text-base font-black text-ink">Convierte un pedido confirmado en una torta lista para entregar</h2><p className="mt-1 text-sm leading-5 text-ink-muted">Cada tarea representa una etapa de la receta y se completa en orden dentro de esta sucursal.</p></div></div>
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">{[
        ['1', 'Asignar e iniciar', 'Elige un responsable. Solo así se puede comenzar una etapa habilitada.'],
        ['2', 'Registrar el trabajo', 'Anota el consumo real y la merma de los insumos usados.'],
        ['3', 'Controlar calidad', 'En Calidad completa la lista y sube la foto final requerida.'],
        ['4', 'Terminar o bloquear', 'Termina si todo está correcto o bloquea para resolver un problema.'],
      ].map(([number, title, detail]) => <li key={number} className="flex items-start gap-2 rounded-xl border border-brand-100 bg-white/80 p-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-black text-brand-700">{number}</span><span><strong className="text-ink">{title}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span></span></li>)}</ol>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3"><div className="rounded-xl border border-line bg-white p-3"><strong className="text-ink">Pendiente</strong><p className="mt-1 leading-5 text-ink-muted">Aún no comienza. Puede asignarse.</p></div><div className="rounded-xl border border-line bg-white p-3"><strong className="text-ink">En proceso</strong><p className="mt-1 leading-5 text-ink-muted">Permite registrar materiales y avances.</p></div><div className="rounded-xl border border-line bg-white p-3"><strong className="text-ink">Bloqueada / terminada</strong><p className="mt-1 leading-5 text-ink-muted">Bloqueada requiere una solución; terminada queda cerrada.</p></div></div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-white p-3 text-xs leading-5 text-ink-muted"><ClipboardCheck className="mt-0.5 size-4 shrink-0 text-brand-700" /><p><strong className="text-ink">Efecto operativo:</strong> las etapas anteriores deben terminar antes de iniciar la siguiente. Al iniciar la primera etapa física se descuenta la reserva de insumos; el uso real corrige Inventario y costos. La comanda de cierre se abre antes de la entrega.</p></div>
    </Card>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!tasks.length && <Card className="border-dashed border-brand-200 bg-brand-50/30 p-6 sm:p-8"><div className="mx-auto max-w-2xl text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-white text-brand-700 shadow-sm"><CheckCircle2 className="size-6" /></span><p className="mt-4 text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Sin tareas pendientes</p><h3 className="mt-1 text-lg font-black text-ink">La sucursal no tiene tortas en producción</h3><p className="mt-2 text-sm leading-6 text-ink-muted">Las tareas aparecerán automáticamente cuando se confirme un pedido de torta que requiera producción para esta sucursal. No se crean manualmente desde aquí.</p><div className="mt-5 grid gap-2 text-left sm:grid-cols-3"><div className="rounded-xl border border-line bg-white p-3"><strong className="text-sm text-ink">Pedido confirmado</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Se genera la ruta de producción según la receta.</p></div><div className="rounded-xl border border-line bg-white p-3"><strong className="text-sm text-ink">Cocina trabaja</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Cada responsable avanza su etapa y registra materiales.</p></div><div className="rounded-xl border border-line bg-white p-3"><strong className="text-sm text-ink">Despacho entrega</strong><p className="mt-1 text-xs leading-5 text-ink-muted">La última etapa confirma que la torta está lista.</p></div></div></div></Card>}
    {tasks.length > 0 && <Card className="p-4"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end"><label className="text-xs font-bold text-ink-muted">Buscar tarea<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, fecha o estación" className="h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm font-normal text-ink" /></span></label><label className="text-xs font-bold text-ink-muted">Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink"><option value="ALL">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><p className="mt-3 text-xs text-ink-muted">Mostrando {filteredTasks.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredTasks.length)} de {filteredTasks.length} tareas</p><p className="mt-2 text-xs leading-5 text-ink-muted"><strong className="text-ink">Estados:</strong> pendiente espera asignación; en proceso permite registrar trabajo; bloqueada necesita resolución; terminada ya no se puede modificar.</p></Card>}
    {tasks.length > 0 && filteredTasks.length === 0 && <Card className="p-5 text-sm text-ink-muted">No hay tareas que coincidan con los filtros actuales.</Card>}
    <div className="grid gap-4 md:grid-cols-2">{pageTasks.map((task) => <Card id={`task-${task.id}`} key={task.id} className={`min-w-0 p-4 sm:p-5 ${task.status !== 'DONE' && (task.status === 'BLOCKED' || task.workDate < today) ? 'border-red-300' : task.status !== 'DONE' && task.workDate === today ? 'border-amber-300' : ''}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-ink-muted">{task.workDate} · {STATION_LABELS[task.station]} · etapa {task.sequence}</p><h3 className="mt-1 font-black">Pedido {task.order?.orderNumber ?? `#${task.orderId}`}</h3><p className="text-xs text-ink-muted">{task.plannedMinutes} minutos planificados · Entrega {task.order?.scheduledAt ? new Date(task.order.scheduledAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) : 'por confirmar'}</p></div><Badge variant={task.status === 'DONE' ? 'success' : task.status === 'BLOCKED' ? 'danger' : 'warning'}>{STATUS_LABELS[task.status]}</Badge></div>
      {task.status !== 'DONE' && (task.workDate <= today || !task.assignedTo) && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${task.workDate < today || task.status === 'BLOCKED' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{task.status === 'BLOCKED' ? 'Etapa bloqueada: requiere resolución' : task.workDate < today ? 'Etapa atrasada' : task.workDate === today ? 'Programada para hoy' : 'Pendiente de asignar'}{!task.assignedTo ? ' · Sin responsable' : ''}</p>}
      <div className="mt-3 rounded-xl bg-surface-muted p-3 text-xs text-ink-muted"><p><strong className="text-ink">Cliente:</strong> {task.order?.contactName || 'Sin nombre'} · <strong className="text-ink">Entrega:</strong> {task.order?.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo'}</p>{task.order?.notes && <p className="mt-2 whitespace-pre-wrap"><strong className="text-ink">Nota del pedido:</strong> {task.order.notes}</p>}</div>
      {Boolean(task.order?.items.length) && <details className="mt-4 rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Ficha de producción · {task.order?.items.length} producto{task.order?.items.length === 1 ? '' : 's'}{task.order?.items.some((item) => item.reference || item.designImages?.length) ? ' · imagen adjunta' : ''}</summary>{task.order!.items.map((item) => <div key={item.id} className="mt-3 border-t border-line pt-3 first:border-t-0 first:pt-0"><p className="text-sm font-bold text-ink">{item.quantity} × {item.productNameSnapshot}{item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ''}{item.requestedServings ? ` · ${item.requestedServings} porciones` : ''}</p>{item.themeSnapshotJson && <CakeThemeReference theme={item.themeSnapshotJson} />}{item.customizations.length > 0 && <ul className="mt-2 grid gap-1 text-sm text-ink">{item.customizations.map((choice) => <li key={choice.id}><strong>{choice.groupNameSnapshot}:</strong> {choice.optionNameSnapshot}{choice.quantity > 1 ? ` × ${choice.quantity}` : ''}</li>)}</ul>}{item.descriptionSnapshot && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-ink-muted">{item.descriptionSnapshot}</p>}{item.specialInstructions && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Indicaciones:</strong> {item.specialInstructions}</p>}{Boolean(item.allergenSnapshotJson?.length) && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-800">Alérgenos: {item.allergenSnapshotJson?.join(', ')}</p>}<OrderCakeReference orderNumber={task.order!.orderNumber} itemId={item.id} images={item.designImages} hasReference={Boolean(item.reference)} /></div>)}</details>}
      <label className="mt-4 block text-xs font-semibold">1. Responsable<select className="mt-1 w-full rounded-lg border border-line bg-white p-2" value={task.assignedTo ?? ''} disabled={!canOperate || task.status === 'DONE' || busy === task.id} onChange={(event) => void assign(task, event.target.value ? Number(event.target.value) : null)}><option value="">Selecciona personal</option>{staff.map((row) => <option key={row.id} value={row.id}>{`${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || `#${row.id}`}</option>)}</select></label>
      {!task.assignedTo && task.status !== 'DONE' && <p className="mt-1 text-xs text-amber-800">Asigna una persona para poder iniciar la etapa.</p>}
      {task.station === 'QA' && <div className="mt-4 rounded-card bg-surface-muted p-3"><p className="text-xs font-bold">2. Control de calidad</p><p className="mt-1 text-xs text-ink-muted">Comprueba cada punto contra el pedido. Cada cambio se guarda en el momento.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{QA_KEYS.map((key) => <label key={key} className="flex gap-2 text-xs"><input type="checkbox" checked={Boolean(task.checklistJson?.[key])} disabled={!canOperate || task.status === 'DONE' || busy === task.id} onChange={(event) => void checklist(task, key, event.target.checked)} />{QA_LABELS[key]}</label>)}</div><label className="mt-3 block text-xs font-semibold">Foto final<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block max-w-full text-xs" disabled={!canOperate || task.status === 'DONE' || busy === task.id} onChange={(event) => { const file = event.target.files?.[0]; if (file) void evidence(task, file); }} /></label>{task.evidenceMime && <p className="mt-1 text-xs text-green-700">Foto guardada</p>}</div>}
      {branchId && <div className="mt-4"><p className="mb-2 text-xs font-bold">3. Materiales usados</p><MaterialUsageForm task={task} branchId={branchId} canOperate={canOperate && task.status === 'IN_PROGRESS'} disabled={!canOperate || busy === task.id} onSaved={() => void onRefresh()} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">{task.status !== 'DONE' && <Button size="sm" disabled={!canOperate || !task.assignedTo || busy === task.id} onClick={() => void changeStatus(task, task.status === 'IN_PROGRESS' ? 'DONE' : 'IN_PROGRESS')}>{task.status === 'IN_PROGRESS' ? 'Terminar etapa' : task.status === 'BLOCKED' ? 'Reanudar etapa' : 'Iniciar etapa'}</Button>}{task.status !== 'DONE' && task.status !== 'BLOCKED' && <Button size="sm" variant="outline" disabled={!canOperate || busy === task.id} onClick={() => void changeStatus(task, 'BLOCKED')}>Bloquear etapa</Button>}</div>
    </Card>)}</div>
    {filteredTasks.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-ink-muted">Página {page} de {totalPages}</p><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
  </section>;
};
