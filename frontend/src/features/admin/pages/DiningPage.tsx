import axios from 'axios';
import { useAppSelector } from '@app/hooks';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Armchair, Banknote, CalendarDays, ChefHat, CirclePlus, Clock3, Copy, FileText,
  Minus, Plus, Printer, QrCode, ReceiptText, Search, Smartphone, Users, WalletCards,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { formatCurrency, formatRelative } from '@lib/format';
import { cn } from '@lib/cn';
import { getApiErrorMessage } from '@services/api/client';
import { useReceiptSettings } from '@services/businessInfo';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { BranchSelector } from '../components/BranchSelector';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { usePolling } from '../hooks/usePolling';
import { adminApi } from '../services/admin.service';
import type { DiningOffering, DiningPaymentMethod, DiningProduct, DiningTableRow } from '../types';
import { printDiningReceipt, printPrebill, printTableQrCard } from '../utils/diningPrint';

const STATUS_LABEL: Record<string, { label: string; variant: 'warning' | 'brand' | 'success' }> = {
  CONFIRMED: { label: 'En cola', variant: 'warning' },
  PREPARING: { label: 'En preparación', variant: 'brand' },
  READY: { label: 'Lista para servir y cobrar', variant: 'success' },
};
const PAYMENT_LABEL: Record<DiningPaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta / POS', yape: 'Yape', plin: 'Plin' };
const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
interface CartLine extends DiningProduct { quantity: number }
interface PaymentPart { method: DiningPaymentMethod; amount: string }

const DiningPage = () => {
  const userId = useAppSelector((state) => state.auth.user?.id);
  const confirm = useConfirm();
  const receiptSettings = useReceiptSettings();
  const fiscalEnabled = receiptSettings.mode !== 'INTERNAL_ONLY';
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } = useActiveBranch();
  const { can } = usePermissions();
  const canOperate = can(PERM.DINING_OPERATE);
  const fetcher = useCallback((signal: AbortSignal) => branchId ? adminApi.diningTables(branchId, signal) : Promise.resolve([]), [branchId]);
  const { data, error, isLoading, refresh } = usePolling<DiningTableRow[]>(fetcher, 10000);
  const [selectedTable, setSelectedTable] = useState<DiningTableRow | null>(null);
  const [catalog, setCatalog] = useState<DiningProduct[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingCommand, setPendingCommand] = useState(false);
  const commandAttempt = useRef<{ key: string; table: DiningTableRow; cart: CartLine[]; guestName: string; notes: string } | null>(null);
  const attemptStorage = `dulceflow:dining-attempt:${userId}:${branchId}`;
  const currentBranch = useRef(branchId); currentBranch.current = branchId;
  const changeBranch = async (next: number) => {
    if (saving || pendingCommand) { toast.error('Recupera primero la comanda pendiente.'); return; }
    if ((cart.length || closing) && !(await confirm({ title: 'Cambiar de sucursal', message: 'Se descartará el borrador de esta sucursal.', confirmLabel: 'Descartar y cambiar' })).confirmed) return;
    setBranchId(next);
  };
  const [tableModal, setTableModal] = useState(false);
  const [newTable, setNewTable] = useState({ code: '', area: 'Salón principal', capacity: '2' });
  const [closing, setClosing] = useState<DiningTableRow | null>(null);
  const [payments, setPayments] = useState<PaymentPart[]>([{ method: 'cash', amount: '' }]);
  const [documentType, setDocumentType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [billing, setBilling] = useState({ docType: 'DNI' as 'DNI' | 'RUC' | 'CE', number: '', name: '', address: '' });
  const [qrTable, setQrTable] = useState<DiningTableRow | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [offeringsModal, setOfferingsModal] = useState(false);
  const [offerings, setOfferings] = useState<DiningOffering[]>([]);
  const [offering, setOffering] = useState({ productKey: '', name: '', price: '', weekdays: [1, 2, 3, 4, 5], startsAt: '11:00', endsAt: '16:00', dailyLimit: '' });

  useEffect(() => {
    setSelectedTable(null); setCart([]); setClosing(null); setQrTable(null); setCatalog([]); setOfferings([]); setCatalogLoading(false);
    commandAttempt.current = null; setPendingCommand(false);
    try {
      const stored = sessionStorage.getItem(attemptStorage);
      if (stored) { const restored = JSON.parse(stored) as { key: string; table: DiningTableRow; cart: CartLine[]; guestName: string; notes: string };
        commandAttempt.current = restored; setPendingCommand(true); setSelectedTable(restored.table); setCart(restored.cart); setGuestName(restored.guestName); setNotes(restored.notes);
      }
    } catch { toast.error('No se pudo recuperar la comanda pendiente. Revisa las mesas antes de enviar otra.'); setPendingCommand(true); }
  }, [branchId, attemptStorage]);

  const activeBranch = branches.find((branch) => branch.id === branchId);
  const loadCatalog = async () => {
    if (!branchId || catalogLoading) return;
    setCatalogLoading(true);
    const source = branchId;
    try { const rows = await adminApi.diningCatalog(branchId); if (currentBranch.current === source) setCatalog(rows); }
    catch (loadError) { toast.error(getApiErrorMessage(loadError)); }
    finally { if (currentBranch.current === source) setCatalogLoading(false); }
  };

  const openOrderModal = (table: DiningTableRow) => {
    if (pendingCommand || saving) return;
    setSelectedTable(table); setCart([]); setGuestName(''); setNotes(''); setCatalogQuery('');
    void loadCatalog();
  };

  const changeQuantity = (product: DiningProduct, delta: number) => {
    if (pendingCommand || saving) return;
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.productId && line.variantId === product.variantId);
      const quantity = (existing?.quantity ?? 0) + delta;
      if (quantity <= 0) return current.filter((line) => line !== existing);
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: Math.min(20, quantity) } : line);
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const cartTotal = useMemo(() => cart.reduce((total, line) => total + line.price * line.quantity, 0), [cart]);
  const cartUnits = useMemo(() => cart.reduce((total, line) => total + line.quantity, 0), [cart]);
  const visibleCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLocaleLowerCase('es');
    return query ? catalog.filter((product) => `${product.name} ${product.variantName}`.toLocaleLowerCase('es').includes(query)) : catalog;
  }, [catalog, catalogQuery]);

  const submitCommand = async () => {
    if (!canOperate || saving || !branchId || !selectedTable || !cart.length || (pendingCommand && !commandAttempt.current)) return;
    const attempt = commandAttempt.current ?? { key: crypto.randomUUID(), table: selectedTable, cart, guestName, notes };
    commandAttempt.current = attempt;
    setSaving(true);
    const items = attempt.cart.map((line) => ({ productId: line.productId, variantId: line.variantId, offeringId: line.offering?.id, quantity: line.quantity }));
    try {
      sessionStorage.setItem(attemptStorage, JSON.stringify(attempt)); setPendingCommand(true);
      if (attempt.table.command) await adminApi.addDiningCommandItems(attempt.table.command.orderNumber, branchId, items, attempt.key);
      else await adminApi.openDiningCommand({ branchId, tableId: attempt.table.id, guestName: attempt.guestName.trim() || undefined, notes: attempt.notes.trim() || undefined, items, idempotencyKey: attempt.key });
      sessionStorage.removeItem(attemptStorage); commandAttempt.current = null; setPendingCommand(false);
      toast.success('Comanda registrada y enviada a cocina'); setSelectedTable(null); setCart([]); refresh();
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response && cause.response.status < 500) { sessionStorage.removeItem(attemptStorage); commandAttempt.current = null; setPendingCommand(false); }
      toast.error(getApiErrorMessage(cause));
    } finally { setSaving(false); }
  };

  const submitTable = async () => {
    if (!branchId) return;
    setSaving(true);
    try {
      await adminApi.createDiningTable({ branchId, code: newTable.code, area: newTable.area, capacity: Number(newTable.capacity) });
      toast.success('Mesa creada con enlace QR propio'); setTableModal(false); setNewTable({ code: '', area: 'Salón principal', capacity: '2' }); refresh();
    } catch (submitError) { toast.error(getApiErrorMessage(submitError)); }
    finally { setSaving(false); }
  };

  const openClose = (table: DiningTableRow) => {
    setClosing(table); setPayments([{ method: 'cash', amount: String(table.command?.total ?? '') }]);
    setDocumentType('BOLETA'); setBilling({ docType: 'DNI', number: '', name: '', address: '' });
  };

  const closeCommand = async () => {
    if (!branchId || !closing?.command) return;
    setSaving(true);
    try {
      const receipt = await adminApi.closeDiningCommand(closing.command.orderNumber, {
        branchId,
        payments: payments.map((part) => ({ method: part.method, amount: Number(part.amount) })),
        documentType: fiscalEnabled ? documentType : 'BOLETA',
        billingDocType: fiscalEnabled && billing.number ? (documentType === 'FACTURA' ? 'RUC' : billing.docType) : null,
        billingDocNumber: fiscalEnabled ? billing.number || null : null,
        billingName: fiscalEnabled ? billing.name || null : null,
        billingAddress: fiscalEnabled ? billing.address || null : null,
      });
      toast.success(`${closing.code} cobrada y disponible`); setClosing(null); refresh();
      printDiningReceipt(receipt, !fiscalEnabled);
    } catch (closeError) { toast.error(getApiErrorMessage(closeError)); }
    finally { setSaving(false); }
  };

  const openOfferings = async () => {
    if (!branchId) return;
    setOfferingsModal(true); void loadCatalog();
    try { setOfferings(await adminApi.diningOfferings(branchId)); }
    catch (loadError) { toast.error(getApiErrorMessage(loadError)); }
  };

  const submitOffering = async () => {
    if (!branchId) return;
    const [productId, variantId] = offering.productKey.split(':').map(Number);
    if (!productId || !variantId || !offering.name.trim() || !Number(offering.price)) return;
    setSaving(true);
    try {
      await adminApi.createDiningOffering({ branchId, productId, variantId, name: offering.name, price: Number(offering.price), weekdays: offering.weekdays, startsAt: offering.startsAt, endsAt: offering.endsAt, dailyLimit: offering.dailyLimit ? Number(offering.dailyLimit) : null });
      setOfferings(await adminApi.diningOfferings(branchId)); setCatalog(await adminApi.diningCatalog(branchId));
      setOffering({ productKey: '', name: '', price: '', weekdays: [1, 2, 3, 4, 5], startsAt: '11:00', endsAt: '16:00', dailyLimit: '' });
      toast.success('Menú publicado para el horario indicado');
    } catch (submitError) { toast.error(getApiErrorMessage(submitError)); }
    finally { setSaving(false); }
  };

  const toggleOffering = async (row: DiningOffering) => {
    if (!branchId) return;
    try { await adminApi.updateDiningOffering(row.id, { branchId, isActive: !row.isActive }); setOfferings(await adminApi.diningOfferings(branchId)); toast.success(row.isActive ? 'Menú pausado' : 'Menú activado'); }
    catch (updateError) { toast.error(getApiErrorMessage(updateError)); }
  };

  const qrUrl = qrTable ? `${window.location.origin}/mesa/${qrTable.qrToken}` : '';
  useEffect(() => {
    if (!qrUrl) { setQrImage(''); return; }
    void QRCode.toDataURL(qrUrl, { width: 420, margin: 2, color: { dark: '#0050a6', light: '#ffffff' } })
      .then(setQrImage)
      .catch(() => toast.error('No se pudo generar el QR'));
  }, [qrUrl]);
  const paidTotal = payments.reduce((sum, part) => sum + (Number(part.amount) || 0), 0);
  const payDifference = (closing?.command?.total ?? 0) - paidTotal;

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;
  const tables = data ?? [];
  const occupied = tables.filter((table) => table.status === 'OCCUPIED');
  const ready = occupied.filter((table) => table.command?.status === 'READY');
  const header = <PageHeader eyebrow="Atención en restaurante" title="Salón y comandas" description="Controla mesas, carta del día, cocina, precuenta y cobro por cada local." icon={Armchair} action={<><BranchSelector value={branchId} branches={branches} disabled={saving || pendingCommand} onChange={(next) => void changeBranch(next)} hasError={Boolean(branchesError)} />{canOperate && <Button variant="outline" leftIcon={<CalendarDays className="size-4" />} onClick={() => void openOfferings()}>Menús del día</Button>}{canOperate && <Button leftIcon={<CirclePlus className="size-4" />} onClick={() => setTableModal(true)}>Agregar mesa</Button>}</>} />;
  if (branchesError) return <div>{header}<LoadError message={branchesError} onRetry={() => void reloadBranches()} /></div>;
  if (error && !data) return <div>{header}<LoadError title="No pudimos cargar el salón" message={error} onRetry={refresh} /></div>;

  return <div>
    {header}
    <Card className="mt-5 overflow-hidden p-0"><div className="grid md:grid-cols-4">
      {[['1', 'Recibir y ubicar', 'El mozo elige la mesa y abre la comanda.'], ['2', 'Enviar a cocina', `Solo cocina de ${activeBranch?.name ?? 'este local'} la recibe.`], ['3', 'Servir y precuenta', 'Se revisa el consumo antes de cobrar.'], ['4', 'Cobrar y liberar', fiscalEnabled ? 'Comprobante y pago simple o mixto.' : 'Ticket interno y pago simple o mixto.']].map(([step, title, copy]) => <div key={step} className="flex gap-3 border-b border-line p-4 md:border-b-0 md:border-r last:border-0"><span className="grid size-9 shrink-0 place-items-center rounded-field bg-brand-50 font-black text-brand-700">{step}</span><div><b className="text-sm text-ink">{title}</b><p className="mt-1 text-xs text-ink-muted">{copy}</p></div></div>)}
    </div></Card>
    <OperationsMetricStrip className="mt-4" ariaLabel="Estado del salón" metrics={[{ label: 'Mesas', value: tables.length, icon: Armchair }, { label: 'Disponibles', value: tables.length - occupied.length, icon: CirclePlus, tone: 'brand' }, { label: 'Ocupadas', value: occupied.length, icon: Users, tone: occupied.length ? 'accent' : 'neutral' }, { label: 'Por cobrar', value: ready.length, icon: Banknote, tone: ready.length ? 'danger' : 'neutral' }]} />

    {tables.length === 0 ? <Card className="mt-5 border-dashed p-10 text-center"><Armchair className="mx-auto size-9 text-ink-muted" /><h2 className="mt-3 font-bold">Configura las mesas de este local</h2><p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">Cada sucursal tiene su propio salón, comandas y QR.</p>{canOperate && <Button className="mt-5" onClick={() => setTableModal(true)}>Crear primera mesa</Button>}</Card> : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{tables.map((table) => {
      const status = table.command ? STATUS_LABEL[table.command.status] ?? { label: table.command.status, variant: 'brand' as const } : null;
      return <Card key={table.id} className={cn('overflow-hidden p-0', table.status === 'AVAILABLE' ? 'border-brand-200' : table.command?.status === 'READY' ? 'border-brand-400 shadow-e3' : 'border-amber-200')}>
        <div className={cn('flex items-start justify-between gap-3 border-b p-4', table.status === 'AVAILABLE' ? 'border-brand-100 bg-brand-50/60' : table.command?.status === 'READY' ? 'border-brand-100 bg-brand-50' : 'border-amber-100 bg-amber-50/60')}><div><p className="text-lg font-black">{table.code}</p><p className="text-xs text-ink-muted">{table.area} · {table.capacity} personas</p></div>{table.status === 'AVAILABLE' ? <Badge variant="success">Disponible</Badge> : status && <Badge variant={status.variant}>{status.label}</Badge>}</div>
        <div className="p-4">{table.command ? <><div className="flex items-start justify-between gap-3"><div><b>{table.command.guestName}</b><p className="mt-1 text-xs text-ink-muted">{table.command.waiterName} · {formatRelative(new Date(table.command.openedAt))}</p></div><b className="text-lg text-brand-800">{formatCurrency(table.command.total)}</b></div><div className="mt-4 rounded-card bg-surface-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{table.command.orderNumber}</p><div className="mt-2 space-y-1">{table.command.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.quantity}× {item.name}</span><span className="font-semibold">{formatCurrency(item.total)}</span></div>)}</div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" variant="outline" leftIcon={<Printer className="size-4" />} onClick={() => printPrebill(table, activeBranch?.name ?? 'Misky Challay')}>Precuenta</Button>{table.command.status === 'READY' ? <Button size="sm" leftIcon={<Banknote className="size-4" />} onClick={() => openClose(table)}>Cobrar</Button> : table.command.canAddItems ? <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => openOrderModal(table)}>Agregar</Button> : <Button size="sm" variant="outline" disabled leftIcon={<Clock3 className="size-4" />}>En cocina</Button>}</div></> : <><p className="text-sm text-ink-muted">Lista para recibir comensales.</p>{canOperate && <Button className="mt-4 w-full" variant="outline" leftIcon={<ReceiptText className="size-4" />} onClick={() => openOrderModal(table)}>Abrir comanda</Button>}</>}
          <Button className="mt-2 w-full" size="sm" variant="ghost" leftIcon={<QrCode className="size-4" />} onClick={() => setQrTable(table)}>QR de esta mesa</Button>
        </div>
      </Card>;
    })}</div>}

    <Modal isOpen={selectedTable !== null} onClose={() => { if (!saving && !pendingCommand) setSelectedTable(null); }} title={`${selectedTable?.command ? 'Agregar a' : 'Nueva comanda'} · ${selectedTable?.code ?? ''}`} description={selectedTable?.command ? 'Los productos nuevos se sumarán al total y cocina los verá en la comanda.' : `Se enviará a la cocina de ${activeBranch?.name ?? 'este local'}.`} icon={ChefHat} eyebrow="Toma de pedido" maxWidth="xl" disableBackdropClose actions={<><Button disabled={saving || pendingCommand} variant="outline" onClick={() => setSelectedTable(null)}>Cancelar</Button><Button isLoading={saving} disabled={!cart.length} onClick={() => void submitCommand()}>{pendingCommand ? 'Recuperar comanda pendiente' : selectedTable?.command ? 'Agregar' : 'Enviar'} {cartUnits} · {formatCurrency(cartTotal)}</Button></>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><section><div className="mb-4 flex items-center gap-2 rounded-field border border-line bg-white px-3"><Search className="size-4 text-ink-muted" /><input className="h-11 min-w-0 flex-1 bg-transparent outline-none" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Buscar plato" /></div>
        {catalogLoading ? <div className="grid min-h-52 place-items-center text-ink-muted">Cargando carta…</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleCatalog.map((product) => { const line = cart.find((item) => item.productId === product.productId && item.variantId === product.variantId); return <button type="button" key={`${product.productId}-${product.variantId}`} disabled={!product.isAvailable} onClick={() => changeQuantity(product, 1)} className={cn('group overflow-hidden rounded-card border bg-white text-left transition hover:border-brand-300 hover:shadow-e3 disabled:opacity-50', line ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line')}><div className="relative aspect-[16/9] overflow-hidden bg-surface-muted">{product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover transition group-hover:scale-105" /> : <span className="grid size-full place-items-center"><ChefHat className="size-8 text-brand-500" /></span>}{product.offering && <Badge className="absolute left-2 top-2" variant="warning">Menú · {product.offering.remaining ?? '∞'} disp.</Badge>}{line && <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-brand-700 text-xs font-black text-white">{line.quantity}</span>}</div><div className="p-3"><b className="line-clamp-2 text-sm">{product.name}</b><p className="text-xs text-ink-muted">{product.variantName}</p><p className="mt-3 font-black text-brand-800">{formatCurrency(product.price)}</p></div></button>; })}</div>}
      </section><aside className="h-fit rounded-card border border-line bg-surface-muted/70 p-4 lg:sticky lg:top-0"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase text-brand-700">Resumen</p><h3 className="font-black">{selectedTable?.code}</h3></div><Badge variant={cartUnits ? 'solid' : 'neutral'}>{cartUnits}</Badge></div>{!selectedTable?.command && <div className="mt-4 grid gap-3"><Input label="Cliente (opcional)" disabled={saving || pendingCommand} value={guestName} onChange={(event) => setGuestName(event.target.value)} /><Input label="Nota para cocina" disabled={saving || pendingCommand} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>}<div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{cart.length ? cart.map((line) => <div key={`${line.productId}-${line.variantId}`} className="rounded-card border border-line bg-white p-3"><div className="flex justify-between gap-2"><b className="truncate text-sm">{line.name}</b><b className="text-sm">{formatCurrency(line.price * line.quantity)}</b></div><div className="mt-2 flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => changeQuantity(line, -1)}><Minus className="size-4" /></Button><b>{line.quantity}</b><Button size="sm" variant="outline" onClick={() => changeQuantity(line, 1)}><Plus className="size-4" /></Button></div></div>) : <p className="rounded-card border border-dashed p-6 text-center text-sm text-ink-muted">Toca un plato para agregarlo.</p>}</div><div className="mt-4 flex justify-between border-t border-line pt-4"><b>Total</b><b className="text-xl text-brand-800">{formatCurrency(cartTotal)}</b></div></aside></div>
    </Modal>

    <Modal isOpen={tableModal} onClose={() => setTableModal(false)} title="Agregar mesa" description={`Se creará únicamente en ${activeBranch?.name ?? 'este local'}.`} icon={Armchair} eyebrow="Configuración del salón" actions={<><Button variant="outline" onClick={() => setTableModal(false)}>Cancelar</Button><Button isLoading={saving} disabled={!newTable.code.trim()} onClick={() => void submitTable()}>Crear mesa</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Input label="Código" value={newTable.code} onChange={(event) => setNewTable((value) => ({ ...value, code: event.target.value }))} placeholder="Mesa 01" /><Input label="Zona" value={newTable.area} onChange={(event) => setNewTable((value) => ({ ...value, area: event.target.value }))} /><Input label="Capacidad" type="number" min="1" max="20" value={newTable.capacity} onChange={(event) => setNewTable((value) => ({ ...value, capacity: event.target.value }))} /></div></Modal>

    <Modal isOpen={closing !== null} onClose={() => setClosing(null)} title={`Cobrar ${closing?.code ?? ''}`} description={fiscalEnabled ? 'Registra el comprobante y uno o varios medios de pago.' : 'Registra el pago y genera un ticket interno sin valor tributario.'} icon={Banknote} eyebrow="Caja de salón" maxWidth="md" actions={<><Button variant="outline" onClick={() => setClosing(null)}>Volver</Button><Button isLoading={saving} disabled={Math.abs(payDifference) > .01} onClick={() => void closeCommand()}>Cobrar {formatCurrency(closing?.command?.total ?? 0)}</Button></>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          {fiscalEnabled ? <>
            <p className="mb-2 text-xs font-bold uppercase text-ink-muted">Comprobante</p>
            <div className="grid grid-cols-2 gap-2">{(['BOLETA', 'FACTURA'] as const).map((type) => <button key={type} type="button" onClick={() => { setDocumentType(type); setBilling((value) => ({ ...value, docType: type === 'FACTURA' ? 'RUC' : 'DNI' })); }} className={cn('rounded-card border p-3 font-bold', documentType === type ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line')}>{type === 'BOLETA' ? 'Boleta' : 'Factura'}</button>)}</div>
            <div className="mt-3 grid gap-3"><Input label={documentType === 'FACTURA' ? 'RUC' : 'DNI o CE (opcional)'} value={billing.number} onChange={(event) => setBilling((value) => ({ ...value, number: event.target.value }))} /><Input label={documentType === 'FACTURA' ? 'Razón social' : 'Nombre (opcional)'} value={billing.name} onChange={(event) => setBilling((value) => ({ ...value, name: event.target.value }))} />{documentType === 'FACTURA' && <Input label="Domicilio fiscal" value={billing.address} onChange={(event) => setBilling((value) => ({ ...value, address: event.target.value }))} />}</div>
          </> : <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
            <ReceiptText className="size-7 text-brand-700" />
            <h3 className="mt-3 font-black text-brand-900">Ticket interno</h3>
            <p className="mt-2 text-sm text-brand-800">Se imprimirá el resumen del pedido con su número. No requiere serie ni correlativo y no es un comprobante de pago.</p>
          </div>}
        </section>
        <section><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase text-ink-muted">Medios de pago</p>{payments.length < 3 && <Button size="sm" variant="ghost" onClick={() => setPayments((value) => [...value, { method: value.some((part) => part.method === 'yape') ? 'card' : 'yape', amount: '' }])}>Dividir cuenta</Button>}</div><div className="mt-2 space-y-3">{payments.map((part, index) => <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2"><select aria-label={`Medio de pago ${index + 1}`} value={part.method} onChange={(event) => setPayments((value) => value.map((row, rowIndex) => rowIndex === index ? { ...row, method: event.target.value as DiningPaymentMethod } : row))} className="rounded-field border border-line bg-white px-3">{Object.entries(PAYMENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input aria-label={`Monto ${index + 1}`} type="number" min="0.01" step="0.01" value={part.amount} onChange={(event) => setPayments((value) => value.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))} />{payments.length > 1 ? <Button size="sm" variant="ghost" aria-label="Quitar pago" onClick={() => setPayments((value) => value.filter((_, rowIndex) => rowIndex !== index))}><Minus className="size-4" /></Button> : <span />}</div>)}</div><div className={cn('mt-4 rounded-card p-4', Math.abs(payDifference) <= .01 ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900')}><div className="flex justify-between"><span>Total</span><b>{formatCurrency(closing?.command?.total ?? 0)}</b></div><div className="mt-1 flex justify-between"><span>Registrado</span><b>{formatCurrency(paidTotal)}</b></div>{Math.abs(payDifference) > .01 && <div className="mt-2 flex justify-between border-t border-current/20 pt-2"><span>{payDifference > 0 ? 'Falta' : 'Excede'}</span><b>{formatCurrency(Math.abs(payDifference))}</b></div>}</div></section>
      </div>
    </Modal>

    <Modal isOpen={offeringsModal} onClose={() => setOfferingsModal(false)} title="Menús del día" description="Programa por local, días, horario, precio y número de porciones." icon={CalendarDays} eyebrow="Carta de salón" maxWidth="lg" actions={<Button variant="outline" onClick={() => setOfferingsModal(false)}>Cerrar</Button>}><div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]"><section className="rounded-card border border-line bg-surface-muted/50 p-4"><h3 className="font-black">Nueva programación</h3><div className="mt-4 grid gap-3"><label className="text-sm font-bold">Producto<select className="mt-1 h-12 w-full rounded-field border border-line bg-white px-3 font-normal" value={offering.productKey} onChange={(event) => { const product = catalog.find((row) => `${row.productId}:${row.variantId}` === event.target.value); setOffering((value) => ({ ...value, productKey: event.target.value, name: product?.name ?? '', price: product ? String(product.price) : '' })); }}><option value="">Selecciona un plato</option>{catalog.map((product) => <option key={`${product.productId}:${product.variantId}`} value={`${product.productId}:${product.variantId}`}>{product.name} · {formatCurrency(product.price)}</option>)}</select></label><Input label="Nombre visible" value={offering.name} onChange={(event) => setOffering((value) => ({ ...value, name: event.target.value }))} /><div className="grid grid-cols-2 gap-3"><Input label="Precio salón" type="number" step=".10" value={offering.price} onChange={(event) => setOffering((value) => ({ ...value, price: event.target.value }))} /><Input label="Porciones (vacío = sin límite)" type="number" value={offering.dailyLimit} onChange={(event) => setOffering((value) => ({ ...value, dailyLimit: event.target.value }))} /><Input label="Desde" type="time" value={offering.startsAt} onChange={(event) => setOffering((value) => ({ ...value, startsAt: event.target.value }))} /><Input label="Hasta" type="time" value={offering.endsAt} onChange={(event) => setOffering((value) => ({ ...value, endsAt: event.target.value }))} /></div><div><p className="mb-2 text-xs font-bold uppercase text-ink-muted">Días</p><div className="flex gap-2">{WEEKDAYS.map((day, index) => <button key={index} type="button" onClick={() => setOffering((value) => ({ ...value, weekdays: value.weekdays.includes(index) ? value.weekdays.filter((valueIndex) => valueIndex !== index) : [...value.weekdays, index] }))} className={cn('grid size-9 place-items-center rounded-full border font-bold', offering.weekdays.includes(index) ? 'border-brand-600 bg-brand-700 text-white' : 'border-line bg-white')}>{day}</button>)}</div></div><Button isLoading={saving} disabled={!offering.productKey || !offering.name || !offering.price || !offering.weekdays.length} onClick={() => void submitOffering()}>Programar menú</Button></div></section><section><h3 className="font-black">Programaciones del local</h3><div className="mt-4 space-y-3">{offerings.length ? offerings.map((row) => <div key={row.id} className="rounded-card border border-line p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><Badge variant={row.activeNow ? 'success' : row.isActive ? 'warning' : 'neutral'}>{row.activeNow ? 'Disponible ahora' : row.isActive ? 'Fuera de horario' : 'Pausado'}</Badge>{row.remaining !== null && <Badge variant={row.remaining <= 3 ? 'danger' : 'neutral'}>{row.remaining} porciones</Badge>}</div><b className="mt-2 block">{row.name}</b><p className="text-xs text-ink-muted">{row.startsAt}–{row.endsAt} · {row.weekdays.map((day) => WEEKDAYS[day]).join(' ')} · {formatCurrency(row.price)}</p></div><Button size="sm" variant="outline" onClick={() => void toggleOffering(row)}>{row.isActive ? 'Pausar' : 'Activar'}</Button></div></div>) : <div className="rounded-card border border-dashed p-8 text-center text-sm text-ink-muted">Aún no hay menús programados en este local.</div>}</div></section></div></Modal>

    <Modal isOpen={qrTable !== null} onClose={() => setQrTable(null)} title={`QR · ${qrTable?.code ?? ''}`} description="El comensal abre la carta de este local y su pedido llega a la mesa correcta." icon={QrCode} eyebrow="Pedido autónomo en mesa" actions={<Button variant="outline" onClick={() => setQrTable(null)}>Cerrar</Button>}><div className="grid gap-4"><div className="rounded-card border border-brand-100 bg-brand-50 p-5 text-center">{qrImage ? <img src={qrImage} alt={`QR de ${qrTable?.code ?? 'mesa'}`} className="mx-auto size-56 rounded-card bg-white p-2 shadow-e2" /> : <Smartphone className="mx-auto size-9 text-brand-700" />}<b className="mt-3 block">Carta digital de {qrTable?.code}</b><p className="mt-2 break-all text-xs text-ink-muted">{qrUrl}</p></div><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" leftIcon={<Copy className="size-4" />} onClick={() => void navigator.clipboard.writeText(qrUrl).then(() => toast.success('Enlace copiado'))}>Copiar enlace</Button>{qrTable && <Button variant="outline" disabled={!qrImage} leftIcon={<Printer className="size-4" />} onClick={() => printTableQrCard(qrTable, activeBranch?.name ?? 'Misky Challay', qrUrl, qrImage)}>Imprimir cartel</Button>}</div><p className="flex gap-2 rounded-field bg-surface-muted p-3 text-xs text-ink-muted"><FileText className="size-4 shrink-0" /> Si renuevas el token, los carteles anteriores dejan de funcionar. Esto permite revocar un enlace compartido fuera del local.</p>{qrTable && branchId && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" leftIcon={<WalletCards className="size-4" />} onClick={() => void adminApi.updateDiningTableQr(qrTable.id, { branchId, enabled: !qrTable.qrEnabled }).then(() => { toast.success(qrTable.qrEnabled ? 'QR desactivado' : 'QR activado'); setQrTable(null); refresh(); })}>{qrTable.qrEnabled ? 'Desactivar QR' : 'Activar QR'}</Button><Button size="sm" variant="ghost" leftIcon={<QrCode className="size-4" />} onClick={() => void adminApi.updateDiningTableQr(qrTable.id, { branchId, regenerate: true }).then(() => { toast.success('Enlace renovado'); setQrTable(null); refresh(); })}>Renovar enlace</Button></div>}</div></Modal>
  </div>;
};

export default DiningPage;
