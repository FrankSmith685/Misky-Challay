import { useCallback, useEffect, useState } from 'react';
import { BookmarkCheck, Copy, Edit3, Salad, ShoppingBag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { addItem } from '@features/cart/cartSlice';
import { builderApi } from '@features/builder/services/builder.service';
import type { SavedBowl } from '@features/builder/types';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';

const SavedBowlsPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { branchId } = useAppState();
  const [bowls, setBowls] = useState<SavedBowl[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<SavedBowl | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try { setBowls(await builderApi.savedBowls()); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (id: number, action: () => Promise<void>, message: string) => {
    setBusy(id);
    try { await action(); toast.success(message); await load(); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setBusy(null); }
  };

  const addSavedToCart = async (bowl: SavedBowl) => {
    setBusy(bowl.id);
    try {
      const quote = await builderApi.quote({ productId: bowl.productId, variantId: bowl.variantId, quantity: 1, branchId, selections: bowl.selections });
      dispatch(addItem({
        id: crypto.randomUUID(), productId: bowl.productId, variantId: bowl.variantId,
        name: bowl.product?.name ?? bowl.name, variantName: quote.description,
        imageUrl: bowl.product?.imageUrl ?? null, quantity: 1, unitPrice: quote.basePrice,
        extrasTotal: quote.extrasTotal, lineTotal: quote.lineTotal,
        selections: quote.selections.map((line) => ({ groupId: line.groupId, groupName: line.groupName, optionId: line.optionId, optionName: line.optionName, quantity: line.quantity, priceDelta: line.priceDelta })),
        nutrition: quote.nutrition,
      }));
      toast.success('Bowl agregado al carrito');
      navigate(ROUTES.cart);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setBusy(null); }
  };

  if (loading) return <PageLoader />;

  return <div>
    <PageHeader eyebrow="Tus combinaciones" title="Bowls guardados" description="Vuelve a pedir, duplica, renombra o continúa personalizando tus recetas favoritas." icon={BookmarkCheck} />
    {bowls.length ? <div className="grid gap-4 lg:grid-cols-2">
      {bowls.map((bowl) => <article key={bowl.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="grid sm:grid-cols-[150px_1fr]">
          <div className="aspect-[4/3] bg-surface-muted sm:aspect-auto">{bowl.product?.imageUrl ? <img src={bowl.product.imageUrl} alt="" loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><Salad className="size-10 text-brand-300" /></div>}</div>
          <div className="p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-ink">{bowl.name}</h2><p className="text-xs text-ink-muted">{bowl.variant?.name ?? 'Bowl'} · {bowl.selections.length} ingredientes</p></div><span className="text-sm font-black text-brand-700">{bowl.variant ? `Desde ${formatCurrency(bowl.variant.basePrice)}` : ''}</span></div>
            <p className="mt-3 text-xs text-ink-muted">Actualizado {new Date(bowl.updatedAt).toLocaleDateString('es-PE')}</p>
            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" isLoading={busy === bowl.id} onClick={() => void addSavedToCart(bowl)}><ShoppingBag className="size-4" /> Agregar</Button><Button size="sm" variant="outline" onClick={() => navigate(ROUTES.builder, { state: { savedBowl: bowl } })}>Personalizar</Button><Button size="sm" variant="ghost" onClick={() => { setRenaming(bowl); setName(bowl.name); }}><Edit3 className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => void run(bowl.id, () => builderApi.saveBowl({ name: `${bowl.name} (copia)`, productId: bowl.productId, variantId: bowl.variantId, selections: bowl.selections }), 'Bowl duplicado')}><Copy className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => void run(bowl.id, () => builderApi.deleteSavedBowl(bowl.id), 'Bowl eliminado')}><Trash2 className="size-4" /></Button></div>
          </div>
        </div>
      </article>)}
    </div> : <div className="rounded-2xl border border-dashed border-line bg-surface-muted/30 p-12 text-center"><Salad className="mx-auto size-12 text-brand-300" /><h2 className="mt-4 text-xl font-black text-ink">Aún no guardaste bowls</h2><p className="mt-2 text-sm text-ink-muted">Crea una combinación y guárdala para volver a pedirla rápidamente.</p><Button className="mt-5" onClick={() => navigate(ROUTES.builder)}>Armar mi primer bowl</Button></div>}

    <Modal isOpen={renaming !== null} onClose={() => setRenaming(null)} title="Renombrar bowl" maxWidth="sm"><div className="space-y-4"><Input label="Nombre" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} /><Button className="w-full" disabled={!name.trim()} isLoading={busy === renaming?.id} onClick={() => renaming && void run(renaming.id, () => builderApi.updateSavedBowl(renaming.id, { name: name.trim() }).then(() => setRenaming(null)), 'Nombre actualizado')}>Guardar nombre</Button></div></Modal>
  </div>;
};

export default SavedBowlsPage;
