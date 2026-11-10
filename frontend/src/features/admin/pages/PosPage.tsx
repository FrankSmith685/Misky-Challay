import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAppSelector } from '@app/hooks';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { Banknote, CreditCard, Minus, Plus, Receipt, Search, ShoppingCart, Smartphone, Store } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Input } from '@components/ui/Input';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { PageLoader } from '@components/common/PageLoader';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { adminApi } from '../services/admin.service';
import { BranchSelector } from '../components/BranchSelector';
import { useActiveBranch } from '../hooks/useActiveBranch';
import type { DiningPaymentMethod, PosProduct, PosSaleResult } from '../types';

interface CartLine { product: PosProduct; quantity: number }
interface PaymentRow { method: DiningPaymentMethod; amount: string; reference: string; operationCode: string; payerPhone: string }
type SaleAttempt = { key: string; cart: CartLine[]; payments: PaymentRow[]; cashReceived: string; customerName: string; notes: string; couponCode: string; documentType: 'BOLETA' | 'FACTURA'; billingDocType: 'DNI' | 'RUC' | 'CE'; billingDocNumber: string; billingName: string; billingAddress: string };

const PAYMENT_OPTIONS: Array<{ value: DiningPaymentMethod; label: string; icon: typeof Banknote }> = [
  { value: 'cash', label: 'Efectivo', icon: Banknote }, { value: 'card', label: 'Tarjeta / POS', icon: CreditCard },
  { value: 'yape', label: 'Yape', icon: Smartphone }, { value: 'plin', label: 'Plin', icon: Smartphone },
];
const emptyPayment = (method: DiningPaymentMethod = 'cash'): PaymentRow => ({ method, amount: '', reference: '', operationCode: '', payerPhone: '' });

const PosPage = () => {
  const userId = useAppSelector((state) => state.auth.user?.id);
  const confirm = useConfirm();
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } = useActiveBranch();
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPayment()]);
  const [cashReceived, setCashReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [quoteTotal, setQuoteTotal] = useState<number | null>(null);
  const [quoteDiscount, setQuoteDiscount] = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [documentType, setDocumentType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [billingDocType, setBillingDocType] = useState<'DNI' | 'RUC' | 'CE'>('DNI');
  const [billingDocNumber, setBillingDocNumber] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<PosSaleResult | null>(null);
  const [pendingSale, setPendingSale] = useState(false);
  const attempt = useRef<SaleAttempt | null>(null);
  const attemptStorage = `dulceflow:pos-attempt:${userId}:${branchId}`;

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
  const categories = useMemo(() => {
    const map = new Map<number, string>();
    catalog.forEach((product) => { if (product.categoryId !== null) map.set(product.categoryId, product.categoryName || `Categoría ${product.categoryId}`); });
    return [...map.entries()];
  }, [catalog]);
  const paidTotal = useMemo(() => payments.reduce((sum, part) => sum + (Number(part.amount) || 0), 0), [payments]);
  const chargeTotal = quoteTotal ?? total;
  const paymentDifference = chargeTotal - paidTotal;
  const cashPart = payments.find((part) => part.method === 'cash');
  const cashAmount = Number(cashPart?.amount) || (payments.length === 1 && cashPart ? chargeTotal : 0);
  const cashValue = Number(cashReceived) || cashAmount;
  const changePreview = cashPart && cashValue >= cashAmount ? cashValue - cashAmount : 0;

  const resetSaleDraft = () => {
    setCart([]); setPayments([emptyPayment()]); setCashReceived(''); setCustomerName(''); setNotes(''); setCouponCode(''); setQuoteTotal(null); setQuoteDiscount(0);
    setDocumentType('BOLETA'); setBillingDocType('DNI'); setBillingDocNumber(''); setBillingName(''); setBillingAddress('');
  };
  const changeBranch = async (next: number) => {
    if (saving || pendingSale) { toast.error('Primero recupera el resultado de la venta pendiente.'); return; }
    if (cart.length && !(await confirm({ title: 'Cambiar de sucursal', message: 'La venta actual tiene productos. Al cambiar de sucursal se descartará este borrador.', confirmLabel: 'Descartar y cambiar' })).confirmed) return;
    resetSaleDraft(); setLastSale(null); setBranchId(next);
  };

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController(); setCatalog([]); setLoading(true); setError(null);
    adminApi.posCatalog(branchId, controller.signal).then((rows) => { if (!controller.signal.aborted) setCatalog(rows); }).catch((cause) => { if (!controller.signal.aborted) setError(getApiErrorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [branchId]);
  useEffect(() => {
    attempt.current = null; resetSaleDraft(); setPendingSale(false);
    try {
      const stored = sessionStorage.getItem(attemptStorage);
      if (stored) {
        const restored = JSON.parse(stored) as SaleAttempt;
        if (typeof restored.key === 'string' && Array.isArray(restored.cart) && Array.isArray(restored.payments)) {
          attempt.current = restored; setPendingSale(true); setCart(restored.cart); setPayments(restored.payments); setCashReceived(restored.cashReceived); setCustomerName(restored.customerName); setNotes(restored.notes); setCouponCode(restored.couponCode); setDocumentType(restored.documentType); setBillingDocType(restored.billingDocType); setBillingDocNumber(restored.billingDocNumber); setBillingName(restored.billingName); setBillingAddress(restored.billingAddress);
        }
      }
    } catch { setError('No pudimos recuperar la venta pendiente. Revisa Pedidos antes de crear otra venta.'); setPendingSale(true); }
  }, [attemptStorage]);
  useEffect(() => {
    if (total <= 0 || payments.length !== 1 || payments[0].amount) return;
    setPayments((current) => current.length === 1 && !current[0].amount ? [{ ...current[0], amount: chargeTotal.toFixed(2) }] : current);
  }, [total, chargeTotal, payments]);
  useEffect(() => {
    if (!branchId || cart.length === 0 || !couponCode.trim()) { setQuoteTotal(null); setQuoteDiscount(0); setQuoteLoading(false); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      adminApi.posQuote({ branchId, couponCode: couponCode.trim(), items: cart.map((line) => ({ productId: line.product.productId, variantId: line.product.variantId, quantity: line.quantity })) }, controller.signal)
        .then((quote) => { if (!controller.signal.aborted) { setQuoteTotal(quote.total); setQuoteDiscount(quote.discountTotal); setPayments((current) => current.length === 1 ? [{ ...current[0], amount: quote.total.toFixed(2) }] : current); } })
        .catch((cause) => { if (!controller.signal.aborted) { setQuoteTotal(null); setQuoteDiscount(0); setError(getApiErrorMessage(cause)); } })
        .finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [branchId, cart, couponCode]);

  const visibleCatalog = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return catalog.filter((product) => (!normalized || `${product.name} ${product.variantName ?? ''}`.toLocaleLowerCase('es').includes(normalized)) && (category === 'all' || String(product.categoryId) === category));
  }, [catalog, query, category]);
  const add = (product: PosProduct) => {
    if (pendingSale || saving) return;
    setLastSale(null); setQuoteTotal(null); setQuoteDiscount(0); setCart((current) => { const found = current.find((line) => line.product.productId === product.productId && line.product.variantId === product.variantId); if (found) return current.map((line) => line === found ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line); return [...current, { product, quantity: 1 }]; });
  };
  const changeQuantity = (productId: number, variantId: number, delta: number) => {
    if (pendingSale || saving) return;
    setQuoteTotal(null); setQuoteDiscount(0); setCart((current) => current.flatMap((line) => { if (line.product.productId !== productId || line.product.variantId !== variantId) return [line]; const quantity = line.quantity + delta; return quantity > 0 ? [{ ...line, quantity: Math.min(20, quantity) }] : []; }));
  };
  const updatePayment = (index: number, patch: Partial<PaymentRow>) => setPayments((current) => current.map((part, rowIndex) => rowIndex === index ? { ...part, ...patch } : part));
  const choosePayment = (method: DiningPaymentMethod) => { if (method === 'yape' || method === 'plin') { setPayments([{ ...emptyPayment(method), amount: chargeTotal.toFixed(2) }]); return; } updatePayment(0, { method }); };
  const addPayment = () => { if (payments.length >= 4 || payments.some((part) => part.method === 'yape' || part.method === 'plin')) return; setPayments((current) => [...current, emptyPayment(current.some((part) => part.method === 'card') ? 'cash' : 'card')]); };

  const sell = async () => {
    if (!branchId || cart.length === 0 || saving || (pendingSale && !attempt.current)) return;
    if (Math.abs(paymentDifference) > 0.01 && !attempt.current) { toast.error(`Los pagos deben sumar ${formatCurrency(chargeTotal)}`); return; }
    setSaving(true); setError(null);
    try {
      const current = attempt.current ?? { key: crypto.randomUUID(), cart, payments: payments.map((part, index) => ({ ...part, amount: part.amount || (payments.length === 1 && index === 0 ? chargeTotal.toFixed(2) : '') })), cashReceived, customerName, notes, couponCode, documentType, billingDocType, billingDocNumber, billingName, billingAddress };
      attempt.current = current; sessionStorage.setItem(attemptStorage, JSON.stringify(current)); setPendingSale(true);
      const sale = await adminApi.createPosSale({ branchId, payments: current.payments.map((part) => ({ method: part.method, amount: Number(part.amount), reference: part.reference.trim() || undefined, operationCode: part.operationCode.trim() || undefined, payerPhone: part.payerPhone.trim() || undefined })), cashReceived: Number(current.cashReceived) || undefined, customerName: current.customerName.trim() || undefined, notes: current.notes.trim() || undefined, couponCode: current.couponCode.trim() || undefined, documentType: current.documentType, billingDocType: current.billingDocNumber.trim() ? current.billingDocType : undefined, billingDocNumber: current.billingDocNumber.trim() || undefined, billingName: current.billingName.trim() || undefined, billingAddress: current.billingAddress.trim() || undefined, idempotencyKey: current.key, items: current.cart.map((line) => ({ productId: line.product.productId, variantId: line.product.variantId, quantity: line.quantity })) });
      sessionStorage.removeItem(attemptStorage); attempt.current = null; setPendingSale(false); setLastSale(sale); resetSaleDraft(); toast.success(sale.paymentPending ? `Venta ${sale.orderNumber} creada; falta verificar el pago` : `Venta ${sale.orderNumber} registrada · ${formatCurrency(sale.total)}`);
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response && cause.response.status < 500) { sessionStorage.removeItem(attemptStorage); attempt.current = null; setPendingSale(false); }
      const message = getApiErrorMessage(cause); setError(message); toast.error(message);
    } finally { setSaving(false); }
  };

  if (isLoadingBranches) return <PageLoader />;
  return <div>
    <PageHeader eyebrow="Venta en mostrador" title="Punto de venta" description="Registra ventas por sucursal, controla el efectivo y deja los pagos Yape o Plin pendientes de verificación." icon={Store} action={<BranchSelector value={branchId} branches={branches} disabled={saving || pendingSale} onChange={(next) => void changeBranch(next)} hasError={Boolean(branchesError)} />} />
    {branchesError && <LoadError title="No pudimos cargar las sucursales" message={branchesError} onRetry={() => void reloadBranches()} className="mt-5" />}
    {error && <p role="alert" className="mt-5 rounded-card border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p>}
    {pendingSale && <p role="status" className="mt-4 text-sm text-ink-muted">El resultado de la venta está pendiente. Reintenta para recuperar la misma operación.</p>}
    {lastSale && <Card className={`mt-5 flex flex-wrap items-center justify-between gap-3 p-4 ${lastSale.paymentPending ? 'border-amber-200 bg-amber-50' : 'border-brand-200 bg-brand-50'}`}><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-brand-600 text-white"><Receipt className="size-5" /></span><div><p className="font-bold text-brand-900">{lastSale.paymentPending ? 'Venta pendiente de verificación' : 'Venta registrada'}</p><p className="text-sm text-brand-800">{lastSale.orderNumber} · {formatCurrency(lastSale.total)}{lastSale.change > 0 ? ` · Vuelto ${formatCurrency(lastSale.change)}` : ''}</p></div></div><div className="flex flex-wrap gap-2"><Link className="rounded-field border border-line bg-white px-3 py-2 text-sm font-bold text-brand-800" to={`${ROUTES.adminOrders}?pedido=${encodeURIComponent(lastSale.orderNumber)}`}>Ver pedido</Link>{lastSale.paymentPending && <Link className="rounded-field bg-brand-700 px-3 py-2 text-sm font-bold text-white" to={`${ROUTES.adminDirectPayments}?pedido=${encodeURIComponent(lastSale.orderNumber)}`}>Revisar pago</Link>}<Button size="sm" variant="outline" onClick={() => setLastSale(null)}>Nueva venta</Button></div></Card>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_410px]"><section>
      <div className="flex flex-col gap-3 sm:flex-row"><label className="flex min-h-12 flex-1 items-center gap-2 rounded-card border border-line bg-white px-4 shadow-e1"><Search className="size-4 text-ink-muted" /><span className="sr-only">Buscar producto</span><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar torta o producto" /></label><select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-12 rounded-card border border-line bg-white px-3 text-sm font-semibold"><option value="all">Todas las categorías</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      {loading ? <PageLoader /> : visibleCatalog.length === 0 ? <Card className="mt-5 p-8 text-center text-sm text-ink-muted">No hay productos disponibles para vender en esta sucursal.</Card> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleCatalog.map((product) => <Card key={`${product.productId}-${product.variantId}`} className="flex flex-col overflow-hidden p-0"><div className="aspect-[4/3] bg-brand-50">{product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-brand-300"><ShoppingCart className="size-10" /></div>}</div><div className="flex flex-1 flex-col p-4"><div className="flex-1"><p className="font-bold text-ink">{product.name}</p><p className="mt-1 text-xs text-ink-muted">{product.variantName ?? 'Presentación estándar'}</p>{product.cakeSaleMode === 'SEMI_CUSTOM' && <p className="mt-2 text-xs font-semibold text-brand-700">Base de torta lista para personalizar</p>}</div><div className="mt-4 flex items-center justify-between gap-2"><span className="font-black text-brand-800">{formatCurrency(product.price)}</span><Button size="sm" leftIcon={<Plus className="size-4" />} disabled={saving || pendingSale} onClick={() => add(product)}>Agregar</Button></div></div></Card>)}</div>}
    </section>
    <aside className="h-fit xl:sticky xl:top-5"><Card className="border-brand-100 p-5 shadow-e2"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-black"><ShoppingCart className="size-5 text-brand-700" /> Venta actual</h2><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{itemCount} producto{itemCount === 1 ? '' : 's'}</span></div>
      {cart.length === 0 ? <div className="mt-6 rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">Agrega productos para comenzar la venta.</div> : <div className="mt-5 space-y-3">{cart.map((line) => <div key={`${line.product.productId}:${line.product.variantId}`} className="flex items-center gap-3 rounded-field bg-surface-muted p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{line.product.name}</p><p className="text-xs text-ink-muted">{formatCurrency(line.product.price)} · {formatCurrency(line.product.price * line.quantity)}</p></div><div className="flex items-center gap-1 rounded-field border border-line bg-white"><button type="button" aria-label={`Quitar una unidad de ${line.product.name}`} className="grid size-8 place-items-center" onClick={() => changeQuantity(line.product.productId, line.product.variantId, -1)}><Minus className="size-3.5" /></button><span className="w-6 text-center text-sm font-bold">{line.quantity}</span><button type="button" aria-label={`Agregar una unidad de ${line.product.name}`} className="grid size-8 place-items-center" onClick={() => changeQuantity(line.product.productId, line.product.variantId, 1)}><Plus className="size-3.5" /></button></div></div>)}</div>}
      <div className="mt-5 border-t border-line pt-4"><div className="flex items-center justify-between text-lg font-black"><span>Total</span><span className="text-brand-800">{formatCurrency(chargeTotal)}</span></div>{quoteDiscount > 0 && <p className="mt-1 text-right text-xs font-semibold text-brand-700">Descuento aplicado: -{formatCurrency(quoteDiscount)}</p>}{quoteLoading && <p className="mt-1 text-right text-xs text-ink-muted">Validando cupón…</p>}
        <div className="mt-4 grid gap-3"><Input label="Cliente (opcional)" disabled={saving || pendingSale} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre para el ticket" /><Input label="Nota para Cocina (opcional)" disabled={saving || pendingSale} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Mensaje o indicación" /><Input label="Cupón autorizado (opcional)" disabled={saving || pendingSale} value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Código de campaña" /></div>
        <section className="mt-5 rounded-card border border-line p-3"><div className="flex items-center justify-between"><p className="text-sm font-bold">Comprobante</p><select disabled={saving || pendingSale} value={documentType} onChange={(event) => setDocumentType(event.target.value as 'BOLETA' | 'FACTURA')} className="rounded-field border border-line bg-white px-2 py-2 text-sm"><option value="BOLETA">Boleta</option><option value="FACTURA">Factura</option></select></div>{documentType === 'FACTURA' && <div className="mt-3 grid gap-3"><Input label="RUC" disabled={saving || pendingSale} value={billingDocNumber} onChange={(event) => { setBillingDocType('RUC'); setBillingDocNumber(event.target.value); }} placeholder="11 dígitos" /><Input label="Razón social" disabled={saving || pendingSale} value={billingName} onChange={(event) => setBillingName(event.target.value)} /><Input label="Domicilio fiscal" disabled={saving || pendingSale} value={billingAddress} onChange={(event) => setBillingAddress(event.target.value)} /></div>}{documentType === 'BOLETA' && <div className="mt-3 grid grid-cols-[100px_1fr] gap-2"><select aria-label="Tipo de documento" disabled={saving || pendingSale} value={billingDocType} onChange={(event) => setBillingDocType(event.target.value as 'DNI' | 'RUC' | 'CE')} className="rounded-field border border-line bg-white px-2 text-sm"><option value="DNI">DNI</option><option value="CE">CE</option><option value="RUC">RUC</option></select><Input label="Documento (opcional)" disabled={saving || pendingSale} value={billingDocNumber} onChange={(event) => setBillingDocNumber(event.target.value)} placeholder="Identificación" /></div>}</section>
        <fieldset disabled={saving || pendingSale} className="mt-5"><div className="flex items-center justify-between"><legend className="text-sm font-bold">Medios de pago</legend>{payments.length < 4 && !payments.some((part) => part.method === 'yape' || part.method === 'plin') && <Button type="button" size="sm" variant="ghost" onClick={addPayment}>Dividir pago</Button>}</div><div className="mt-2 grid grid-cols-2 gap-2">{PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => choosePayment(value)} className={`flex min-h-10 items-center justify-center gap-2 rounded-field border px-2 text-xs font-semibold ${payments[0]?.method === value && payments.length === 1 ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-muted'}`}><Icon className="size-4" />{label}</button>)}</div><div className="mt-3 space-y-2">{payments.map((part, index) => <div key={index} className="rounded-field border border-line bg-surface-muted p-2"><div className="flex items-center gap-2"><select aria-label={`Medio de pago ${index + 1}`} value={part.method} onChange={(event) => updatePayment(index, { method: event.target.value as DiningPaymentMethod })} className="min-w-0 flex-1 rounded-field border border-line bg-white px-2 py-2 text-sm"><option value="cash">Efectivo</option><option value="card">Tarjeta / POS</option>{payments.length === 1 && <><option value="yape">Yape</option><option value="plin">Plin</option></>}</select><input aria-label={`Monto ${index + 1}`} type="number" min="0.01" step="0.01" value={part.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} placeholder={payments.length === 1 ? chargeTotal.toFixed(2) : 'Importe'} className="w-28 rounded-field border border-line bg-white px-2 py-2 text-right text-sm" />{payments.length > 1 && <button type="button" aria-label="Quitar pago" onClick={() => setPayments((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Minus className="size-4" /></button>}</div>{part.method === 'cash' && <Input label="Efectivo recibido (opcional)" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder={part.amount || chargeTotal.toFixed(2)} />}{part.method === 'card' && <Input label="Referencia del voucher / POS" value={part.reference} onChange={(event) => updatePayment(index, { reference: event.target.value })} placeholder="Ej. últimos 4 dígitos" />}{(part.method === 'yape' || part.method === 'plin') && <div className="mt-2 grid gap-2"><Input label="Código de operación" value={part.operationCode} onChange={(event) => updatePayment(index, { operationCode: event.target.value })} /><Input label="Teléfono del pagador (opcional)" value={part.payerPhone} onChange={(event) => updatePayment(index, { payerPhone: event.target.value })} /></div>}</div>)}</div></fieldset>
        <div className={`mt-4 rounded-card p-3 text-sm ${Math.abs(paymentDifference) <= .01 ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900'}`}><div className="flex justify-between"><span>Pagos registrados</span><b>{formatCurrency(paidTotal)}</b></div>{Math.abs(paymentDifference) > .01 && <div className="mt-1 flex justify-between"><span>{paymentDifference > 0 ? 'Falta' : 'Excede'}</span><b>{formatCurrency(Math.abs(paymentDifference))}</b></div>}{changePreview > 0 && <div className="mt-1 flex justify-between"><span>Vuelto</span><b>{formatCurrency(changePreview)}</b></div>}</div>
        <Button className="mt-5 w-full" size="lg" disabled={cart.length === 0 || saving || quoteLoading || !branchId || Math.abs(paymentDifference) > .01} isLoading={saving} onClick={() => void sell()}>{pendingSale ? 'Recuperar venta pendiente' : `Cobrar ${formatCurrency(chargeTotal)}`}</Button><p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">Efectivo y tarjeta quedan cobrados. Yape y Plin se crean como pago pendiente hasta que Caja verifique el código.</p>
      </div>
    </Card></aside></div>
  </div>;
};

export default PosPage;
