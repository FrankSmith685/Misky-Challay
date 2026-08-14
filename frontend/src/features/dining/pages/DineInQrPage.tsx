import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, CheckCircle2, Clock3, MapPin, Minus, Plus, ReceiptText, UtensilsCrossed } from 'lucide-react';
import { useParams } from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Input } from '@components/ui/Input';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { getApiErrorMessage } from '@services/api/client';
import type { DiningProduct } from '@features/admin/types';
import { diningApi, type PublicDiningTable } from '../services/dining.service';

interface CartLine extends DiningProduct { quantity: number }

const DineInQrPage = () => {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicDiningTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOrder, setSentOrder] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await diningApi.table(token)); }
    catch (loadError) { setError(getApiErrorMessage(loadError)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const change = (product: DiningProduct, delta: number) => setCart((current) => {
    const existing = current.find((row) => row.variantId === product.variantId);
    const quantity = (existing?.quantity ?? 0) + delta;
    if (quantity <= 0) return current.filter((row) => row !== existing);
    return existing ? current.map((row) => row === existing ? { ...row, quantity: Math.min(20, quantity) } : row) : [...current, { ...product, quantity: 1 }];
  });
  const total = useMemo(() => cart.reduce((sum, row) => sum + row.price * row.quantity, 0), [cart]);
  const units = useMemo(() => cart.reduce((sum, row) => sum + row.quantity, 0), [cart]);

  const submit = async () => {
    if (!cart.length) return;
    setSending(true);
    try {
      const order = await diningApi.order(token, { guestName: guestName.trim() || undefined, notes: notes.trim() || undefined, items: cart.map((row) => ({ productId: row.productId, variantId: row.variantId, offeringId: row.offering?.id, quantity: row.quantity })) });
      setSentOrder(order.orderNumber); setCart([]); await load(); toast.success('Pedido enviado a cocina');
    } catch (submitError) { toast.error(getApiErrorMessage(submitError)); }
    finally { setSending(false); }
  };

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <main className="container-shell py-12"><LoadError title="No pudimos abrir esta mesa" message={error} onRetry={() => void load()} /></main>;
  if (!data) return null;

  return <main className="bg-surface-muted/40 pb-28 pt-6 sm:pb-10 sm:pt-10">
    <div className="container-shell">
      <section className="overflow-hidden rounded-card border border-brand-100 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-6 text-white shadow-e3 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[.16em] text-brand-100">Pedido en el restaurante</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{data.table.code}</h1><p className="mt-2 flex items-center gap-2 text-sm text-brand-50"><MapPin className="size-4" /> {data.branch.name} · {data.table.area}</p></div><span className="grid size-14 place-items-center rounded-card bg-white/15 backdrop-blur"><UtensilsCrossed className="size-7" /></span></div>{data.command && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-white/20 bg-white/10 p-4"><div><p className="text-xs text-brand-50">Comanda abierta</p><b>{data.command.orderNumber}</b></div><div className="text-right"><Badge variant={data.command.status === 'READY' ? 'success' : 'warning'}>{data.command.status === 'READY' ? 'Lista para servir' : 'En cocina'}</Badge><p className="mt-1 font-black">{formatCurrency(data.command.total)}</p></div></div>}</section>

      {sentOrder && <Card className="mt-5 border-brand-200 bg-brand-50"><div className="flex gap-3"><CheckCircle2 className="size-6 shrink-0 text-brand-700" /><div><b className="text-brand-900">Tu pedido llegó a cocina</b><p className="mt-1 text-sm text-brand-800">Comanda {sentOrder}. Puedes llamar al personal si necesitas cambiar algo.</p></div></div></Card>}

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><section><div className="mb-4"><p className="text-xs font-black uppercase tracking-[.12em] text-brand-700">Carta disponible ahora</p><h2 className="mt-1 text-2xl font-black text-ink">¿Qué deseas pedir?</h2></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.catalog.map((product) => { const line = cart.find((row) => row.variantId === product.variantId); return <Card key={product.variantId} className={cn('overflow-hidden p-0 transition', line && 'border-brand-500 ring-1 ring-brand-500')}><div className="relative aspect-[16/9] bg-surface-muted">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="size-full object-cover" /> : <span className="grid size-full place-items-center"><ChefHat className="size-9 text-brand-500" /></span>}{product.offering && <Badge className="absolute left-2 top-2" variant="warning">Menú del día · {product.offering.remaining ?? '∞'}</Badge>}</div><div className="p-4"><b className="line-clamp-2">{product.name}</b><p className="mt-1 text-xs text-ink-muted">{product.variantName}</p><div className="mt-4 flex items-center justify-between"><b className="text-lg text-brand-800">{formatCurrency(product.price)}</b>{line ? <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => change(product, -1)}><Minus className="size-4" /></Button><b>{line.quantity}</b><Button size="sm" onClick={() => change(product, 1)}><Plus className="size-4" /></Button></div> : <Button size="sm" disabled={!product.isAvailable} onClick={() => change(product, 1)}>Agregar</Button>}</div></div></Card>; })}</div></section>
        <aside className="h-fit rounded-card border border-line bg-white p-5 shadow-e2 lg:sticky lg:top-24"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-brand-700">Tu pedido</p><h2 className="mt-1 text-xl font-black">{units} productos</h2></div><ReceiptText className="size-6 text-brand-600" /></div>{!data.command && <Input className="mt-4" label="Tu nombre (opcional)" value={guestName} onChange={(event) => setGuestName(event.target.value)} />}{cart.length ? <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">{cart.map((row) => <div key={row.variantId} className="flex justify-between gap-3 border-b border-line pb-3 text-sm"><span>{row.quantity}× {row.name}</span><b>{formatCurrency(row.price * row.quantity)}</b></div>)}</div> : <div className="mt-4 rounded-card border border-dashed p-6 text-center"><Clock3 className="mx-auto size-6 text-ink-muted" /><p className="mt-2 text-sm text-ink-muted">Agrega platos para comenzar.</p></div>}<Input className="mt-4" label="Indicación para cocina (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. sin ají" /><div className="mt-5 flex items-center justify-between border-t border-line pt-4"><span>Total</span><b className="text-2xl text-brand-800">{formatCurrency(total)}</b></div><Button className="mt-4 w-full" isLoading={sending} disabled={!cart.length} onClick={() => void submit()}>{data.command ? 'Agregar a mi mesa' : 'Enviar a cocina'}</Button><p className="mt-3 text-center text-xs leading-5 text-ink-muted">El pago se realiza con el personal al terminar.</p></aside>
      </div>
    </div>
  </main>;
};

export default DineInQrPage;
