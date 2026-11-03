import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
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
import { adminApi } from '../services/admin.service';
import { BranchSelector } from '../components/BranchSelector';
import { useActiveBranch } from '../hooks/useActiveBranch';
import type { DiningPaymentMethod, PosProduct } from '../types';

interface CartLine {
  product: PosProduct;
  quantity: number;
}

type SaleAttempt = { key: string; cart: CartLine[]; paymentMethod: DiningPaymentMethod; customerName: string; notes: string };

const PAYMENT_OPTIONS: Array<{ value: DiningPaymentMethod; label: string; icon: typeof Banknote }> = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'yape', label: 'Yape', icon: Smartphone },
  { value: 'plin', label: 'Plin', icon: Smartphone },
];

const PosPage = () => {
  const userId = useAppSelector((state) => state.auth.user?.id);
  const confirm = useConfirm();
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } = useActiveBranch();
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<DiningPaymentMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{ orderNumber: string; total: number } | null>(null);
  const [pendingSale, setPendingSale] = useState(false);
  const attempt = useRef<SaleAttempt | null>(null);
  const attemptStorage = `dulceflow:pos-attempt:${userId}:${branchId}`;
  const changeBranch = async (next: number) => {
    if (saving || pendingSale) { toast.error('Primero recupera el resultado de la venta pendiente.'); return; }
    if (cart.length && !(await confirm({ title: 'Cambiar de sucursal', message: 'La venta actual tiene productos. Al cambiar de sucursal se descartará este borrador.', confirmLabel: 'Descartar y cambiar' })).confirmed) return;
    setCart([]); setLastSale(null); setCustomerName(''); setNotes(''); setBranchId(next);
  };

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    setCatalog([]);
    setLoading(true);
    setError(null);
    adminApi.posCatalog(branchId, controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setCatalog(rows); })
      .catch((cause) => { if (!controller.signal.aborted) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [branchId]);
  useEffect(() => {
    attempt.current = null;
    setCart([]); setCustomerName(''); setNotes('');
    setPendingSale(false);
    try {
      const stored = sessionStorage.getItem(attemptStorage);
      if (stored) {
        const restored = JSON.parse(stored) as SaleAttempt;
        if (typeof restored.key === 'string' && Array.isArray(restored.cart)) {
          attempt.current = restored; setPendingSale(true); setCart(restored.cart);
          setPaymentMethod(restored.paymentMethod); setCustomerName(restored.customerName); setNotes(restored.notes);
        }
      }
    } catch { setError('No pudimos recuperar la venta pendiente. Revisa Pedidos antes de crear otra venta.'); setPendingSale(true); }
  }, [attemptStorage]);

  const visibleCatalog = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return catalog.filter((product) => !normalized || product.name.toLocaleLowerCase('es').includes(normalized));
  }, [catalog, query]);

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const add = (product: PosProduct) => {
    if (pendingSale || saving) return;
    setLastSale(null);
    setCart((current) => {
      const found = current.find((line) => line.product.productId === product.productId && line.product.variantId === product.variantId);
      if (found) return current.map((line) => line === found ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line);
      return [...current, { product, quantity: 1 }];
    });
  };

  const changeQuantity = (productId: number, variantId: number, delta: number) => {
    if (pendingSale || saving) return;
    setCart((current) => current.flatMap((line) => {
      if (line.product.productId !== productId || line.product.variantId !== variantId) return [line];
      const quantity = line.quantity + delta;
      return quantity > 0 ? [{ ...line, quantity: Math.min(20, quantity) }] : [];
    }));
  };

  const sell = async () => {
    if (!branchId || cart.length === 0 || saving || (pendingSale && !attempt.current)) return;
    setSaving(true);
    setError(null);
    try {
      const current = attempt.current ?? { key: crypto.randomUUID(), cart, paymentMethod, customerName, notes };
      attempt.current = current;
      sessionStorage.setItem(attemptStorage, JSON.stringify(current));
      setPendingSale(true);
      const sale = await adminApi.createPosSale({
        branchId,
        paymentMethod: current.paymentMethod,
        customerName: current.customerName.trim() || undefined,
        notes: current.notes.trim() || undefined,
        idempotencyKey: current.key,
        items: current.cart.map((line) => ({
          productId: line.product.productId,
          variantId: line.product.variantId,
          quantity: line.quantity,
        })),
      });
      sessionStorage.removeItem(attemptStorage); attempt.current = null; setPendingSale(false);
      setLastSale({ orderNumber: sale.orderNumber, total: sale.total });
      setCart([]);
      setCustomerName('');
      setNotes('');
      toast.success(`Venta ${sale.orderNumber} registrada · ${formatCurrency(sale.total)}`);
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response && cause.response.status < 500) {
        sessionStorage.removeItem(attemptStorage); attempt.current = null; setPendingSale(false);
      }
      const message = getApiErrorMessage(cause);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoadingBranches) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Venta en mostrador"
        title="Punto de venta"
        description="Cobra, envía la comanda a Cocina y deja que el sistema reserve y descuente los insumos automáticamente."
        icon={Store}
        action={<BranchSelector value={branchId} branches={branches} disabled={saving || pendingSale} onChange={(next) => void changeBranch(next)} hasError={Boolean(branchesError)} />}
      />

      {branchesError && <LoadError title="No pudimos cargar las sucursales" message={branchesError} onRetry={() => void reloadBranches()} className="mt-5" />}
      {error && <p role="alert" className="mt-5 rounded-card border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p>}
      {pendingSale && <p role="status" className="mt-4 text-sm text-ink-muted">El resultado de la venta está pendiente. Reintenta para recuperar la misma operación.</p>}
      {lastSale && (
        <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-brand-600 text-white"><Receipt className="size-5" /></span><div><p className="font-bold text-brand-900">Venta registrada</p><p className="text-sm text-brand-800">{lastSale.orderNumber} · {formatCurrency(lastSale.total)} · enviada a Cocina</p></div></div>
          <Button size="sm" variant="outline" onClick={() => setLastSale(null)}>Nueva venta</Button>
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_390px]">
        <section>
          <label className="flex min-h-12 items-center gap-2 rounded-card border border-line bg-white px-4 shadow-e1"><Search className="size-4 text-ink-muted" /><span className="sr-only">Buscar producto</span><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar torta o producto" /></label>
          {loading ? <PageLoader /> : visibleCatalog.length === 0 ? <Card className="mt-5 p-8 text-center text-sm text-ink-muted">No hay productos disponibles para vender en esta sucursal.</Card> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleCatalog.map((product) => <Card key={`${product.productId}-${product.variantId}`} className="flex flex-col overflow-hidden p-0"><div className="aspect-[4/3] bg-brand-50">{product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-brand-300"><ShoppingCart className="size-10" /></div>}</div><div className="flex flex-1 flex-col p-4"><div className="flex-1"><p className="font-bold text-ink">{product.name}</p><p className="mt-1 text-xs text-ink-muted">{product.variantName ?? 'Presentación estándar'}</p>{product.cakeSaleMode === 'SEMI_CUSTOM' && <p className="mt-2 text-xs font-semibold text-brand-700">Base de torta lista para personalizar</p>}</div><div className="mt-4 flex items-center justify-between gap-2"><span className="font-black text-brand-800">{formatCurrency(product.price)}</span><Button size="sm" leftIcon={<Plus className="size-4" />} disabled={saving || pendingSale} onClick={() => add(product)}>Agregar</Button></div></div></Card>)}</div>}
        </section>

        <aside className="h-fit xl:sticky xl:top-5">
          <Card className="border-brand-100 p-5 shadow-e2"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-black"><ShoppingCart className="size-5 text-brand-700" /> Venta actual</h2><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{itemCount} producto{itemCount === 1 ? '' : 's'}</span></div>
            {cart.length === 0 ? <div className="mt-6 rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">Agrega productos para comenzar la venta.</div> : <div className="mt-5 space-y-3">{cart.map((line) => <div key={`${line.product.productId}:${line.product.variantId}`} className="flex items-center gap-3 rounded-field bg-surface-muted p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{line.product.name}</p><p className="text-xs text-ink-muted">{formatCurrency(line.product.price)} · {formatCurrency(line.product.price * line.quantity)}</p></div><div className="flex items-center gap-1 rounded-field border border-line bg-white"><button type="button" aria-label={`Quitar una unidad de ${line.product.name}`} className="grid size-8 place-items-center" onClick={() => changeQuantity(line.product.productId, line.product.variantId, -1)}><Minus className="size-3.5" /></button><span className="w-6 text-center text-sm font-bold">{line.quantity}</span><button type="button" aria-label={`Agregar una unidad de ${line.product.name}`} className="grid size-8 place-items-center" onClick={() => changeQuantity(line.product.productId, line.product.variantId, 1)}><Plus className="size-3.5" /></button></div></div>)}</div>}
            <div className="mt-5 border-t border-line pt-4"><div className="flex items-center justify-between text-lg font-black"><span>Total</span><span className="text-brand-800">{formatCurrency(total)}</span></div><div className="mt-4 grid gap-3"><Input label="Cliente (opcional)" disabled={saving || pendingSale} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre para el ticket" /><Input label="Nota para Cocina (opcional)" disabled={saving || pendingSale} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Mensaje o indicación" /></div><fieldset disabled={saving || pendingSale} className="mt-4"><legend className="mb-2 text-sm font-bold">Medio de pago</legend><div className="grid grid-cols-2 gap-2">{PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setPaymentMethod(value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-field border px-3 text-sm font-semibold transition ${paymentMethod === value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-muted hover:border-brand-300'}`}><Icon className="size-4" />{label}</button>)}</div></fieldset><Button className="mt-5 w-full" size="lg" disabled={cart.length === 0 || saving || !branchId} isLoading={saving} onClick={() => void sell()}>{pendingSale ? 'Recuperar venta pendiente' : `Cobrar ${formatCurrency(total)}`}</Button><p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">Al cobrar se registra el pago, se reserva el stock y se crea la comanda de Cocina.</p></div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default PosPage;
