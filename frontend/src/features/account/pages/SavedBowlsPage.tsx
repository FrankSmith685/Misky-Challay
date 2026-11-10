import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  CalendarDays,
  Cloud,
  Copy,
  Edit3,
  Layers3,
  Plus,
  Salad,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { useAppDispatch } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Select, SelectOption } from '@components/ui/Select';
import { Skeleton } from '@components/ui/Skeleton';
import { addItem } from '@features/cart/cartSlice';
import { builderApi } from '@features/builder/services/builder.service';
import type { BuilderConfig, SavedBowl } from '@features/builder/types';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { AccountLoadError } from '../components/AccountSectionCard';

type BowlSort = 'RECENT' | 'NAME' | 'PRICE';
type ResolvedSelection = SavedBowl['selections'][number] & {
  option?: BuilderConfig['groups'][number]['options'][number];
};
/** Una accion por boton: el indicador global hacia girar el CTA que nadie toco. */
type BowlAction = 'cart' | 'duplicate' | 'rename' | 'delete';
type BusyState = { id: number; action: BowlAction } | null;

const SavedBowlsPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { branchId } = useAppState();
  const [combinaciones, setBowls] = useState<SavedBowl[]>([]);
  const [configs, setConfigs] = useState<Record<number, BuilderConfig>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busy, setBusy] = useState<BusyState>(null);
  const [renaming, setRenaming] = useState<SavedBowl | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedBowl | null>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BowlSort>('RECENT');

  const load = useCallback(async () => {
    try {
      const rows = await builderApi.savedBowls();
      const productIds = [...new Set(rows.map((bowl) => bowl.productId))];
      const loadedConfigs: Record<number, BuilderConfig> = {};
      await Promise.all(productIds.map(async (productId) => {
        try {
          loadedConfigs[productId] = await builderApi.getConfig(productId, branchId);
        } catch {
          // La receta sigue siendo util aunque temporalmente no podamos resolver sus nombres.
        }
      }));
      setBowls(rows);
      setConfigs(loadedConfigs);
      setLoadError(null);
    } catch (error) {
      // Sin esta bandera la pagina decia "Aun no guardaste combinaciones" ante un timeout.
      setLoadError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void load(); }, [load, retryNonce]);

  const retryLoad = () => {
    setLoading(true);
    setRetryNonce((value) => value + 1);
  };

  const isBusy = (id: number, action: BowlAction) => busy?.id === id && busy.action === action;

  const run = async (id: number, action: BowlAction, task: () => Promise<void>, message: string): Promise<boolean> => {
    setBusy({ id, action });
    try {
      await task();
      toast.success(message);
      await load();
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const addSavedToCart = async (bowl: SavedBowl) => {
    setBusy({ id: bowl.id, action: 'cart' });
    try {
      const quote = await builderApi.quote({ productId: bowl.productId, variantId: bowl.variantId, quantity: 1, branchId, selections: bowl.selections });
      dispatch(addItem({
        id: crypto.randomUUID(), productId: bowl.productId, variantId: bowl.variantId,
        name: bowl.product?.name ?? bowl.name, variantName: quote.description,
        imageUrl: bowl.product?.imageUrl ?? null, quantity: 1, unitPrice: quote.basePrice,
        extrasTotal: quote.extrasTotal, lineTotal: quote.lineTotal,
        selections: quote.selections.map((line) => ({ groupId: line.groupId, groupName: line.groupName, optionId: line.optionId, optionName: line.optionName, quantity: line.quantity, priceDelta: line.priceDelta })),
        preparationMode: configs[bowl.productId]?.product.preparationMode,
        requiresScheduledDelivery: configs[bowl.productId]?.product.preparationMode !== 'READY_STOCK',
        requiresCarDelivery: configs[bowl.productId]?.product.family === 'CAKE',
        minLeadHours: configs[bowl.productId]?.product.preparationMode === 'READY_STOCK' ? 0 : configs[bowl.productId]?.product.minLeadHours,
      }));
      toast.success('Bowl agregado al carrito');
      navigate(ROUTES.cart);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const visibleBowls = useMemo<SavedBowl[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-PE');
    const filtered = combinaciones.filter((bowl) => {
      if (!normalizedQuery) return true;
      const config = configs[bowl.productId];
      const optionNames = resolveSelections(bowl, config).map((selection) => selection.option?.name ?? '');
      const searchableValues: string[] = [
        bowl.name,
        bowl.product?.name ?? '',
        bowl.variant?.name ?? '',
        ...optionNames,
      ];
      return searchableValues.some((value) => value.toLocaleLowerCase('es-PE').includes(normalizedQuery));
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'NAME') return a.name.localeCompare(b.name, 'es-PE');
      if (sort === 'PRICE') return (a.variant?.basePrice ?? 0) - (b.variant?.basePrice ?? 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [combinaciones, configs, query, sort]);

  const ingredientCount = combinaciones.reduce((total, bowl) => total + bowl.selections.reduce((sum, selection) => sum + selection.quantity, 0), 0);
  const baseCount = new Set(combinaciones.map((bowl) => bowl.productId)).size;

  return (
    <div>
      <PageHeader
        eyebrow="Tus combinaciones"
        title="Bowls guardados"
        description="Vuelve a pedir, duplica, renombra o continúa personalizando tus recetas."
        icon={BookmarkCheck}
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }, { label: 'Bowls guardados' }]}
        action={<Button leftIcon={<Plus className="size-4" />} onClick={() => navigate(ROUTES.builder)}>Armar nuevo bowl</Button>}
        className="mb-6"
      />

      {loading ? (
        <SavedBowlsSkeleton />
      ) : loadError ? (
        <AccountLoadError
          title="No pudimos cargar tus combinaciones guardados"
          message={loadError}
          onRetry={retryLoad}
          action={
            <Button variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => navigate(ROUTES.builder)}>
              Armar un bowl
            </Button>
          }
        />
      ) : combinaciones.length === 0 ? (
        <EmptyState
          icon={Salad}
          title="Aún no guardaste combinaciones"
          description="Crea una combinación y guárdala para volver a pedirla rápidamente."
          action={<Button leftIcon={<Plus className="size-4" />} onClick={() => navigate(ROUTES.builder)}>Armar mi primer bowl</Button>}
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-3 gap-2" aria-label="Resumen de combinaciones guardados">
            <BowlStat value={combinaciones.length} label="Recetas" icon={BookmarkCheck} highlighted />
            <BowlStat value={ingredientCount} label="Ingredientes" icon={Salad} />
            <BowlStat value={baseCount} label="Bases distintas" icon={Layers3} />
          </section>

          <section className="mb-4 grid gap-3 rounded-card border border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-4" aria-label="Buscar y ordenar combinaciones">
            <Input
              label="Buscar receta o ingrediente"
              placeholder="Ej. pollo, quinua..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              startAdornment={<Search className="size-4 text-ink-muted" />}
            />
            <Select id="saved-combinaciones-sort" label="Ordenar por" value={sort} onChange={(event) => setSort(event.target.value as BowlSort)}>
              <SelectOption value="RECENT">Actualizados recientemente</SelectOption>
              <SelectOption value="NAME">Nombre A–Z</SelectOption>
              <SelectOption value="PRICE">Menor precio base</SelectOption>
            </Select>
          </section>

          <div className="mb-5 flex items-start gap-2 rounded-card border border-brand-100 bg-brand-50/55 p-3 text-xs leading-5 text-brand-900">
            <Cloud className="mt-0.5 size-4 shrink-0" /> Estas recetas están sincronizadas con tu cuenta. Antes de agregarlas verificamos precio y disponibilidad actuales.
          </div>

          {visibleBowls.length === 0 ? (
            <EmptyState
              variant="inset"
              icon={Search}
              title="No encontramos esa receta"
              description="Busca por el nombre del bowl, la base o alguno de sus ingredientes."
              action={<Button variant="outline" onClick={() => setQuery('')}>Limpiar búsqueda</Button>}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleBowls.map((bowl) => {
                const config = configs[bowl.productId];
                const selectedOptions = resolveSelections(bowl, config);
                const unavailable = selectedOptions.some((selection) => selection.option && !selection.option.isAvailable);
                const totalSelections = bowl.selections.reduce((sum, selection) => sum + selection.quantity, 0);

                return (
                  <article key={bowl.id} className={cn('flex h-full flex-col overflow-hidden rounded-card border bg-white shadow-e2 transition hover:border-brand-200 hover:shadow-e3', unavailable ? 'border-amber-200' : 'border-line')}>
                    <div className="grid sm:grid-cols-[160px_1fr]">
                      <div className="relative aspect-[16/9] bg-brand-50 sm:aspect-auto sm:min-h-44">
                        {bowl.product?.imageUrl ? (
                          <img src={bowl.product.imageUrl} alt={bowl.product.name} loading="lazy" className="size-full object-cover" />
                        ) : (
                          <div className="grid size-full place-items-center bg-gradient-to-br from-brand-100 to-brand-50"><Salad className="size-11 text-brand-400" /></div>
                        )}
                        <span className="absolute bottom-3 left-3 rounded-pill border border-white/70 bg-white/95 px-2 py-1 text-[10px] font-extrabold text-ink shadow-sm">{bowl.variant?.name ?? 'Bowl personalizado'}</span>
                      </div>

                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-brand-700">{bowl.product?.name ?? 'Tu combinación'}</p>
                            <h2 className="mt-1 text-lg font-black leading-6 text-ink">{bowl.name}</h2>
                          </div>
                          {bowl.variant && (
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] text-ink-muted">Precio base</p>
                              <p className="font-black text-brand-800">{formatCurrency(bowl.variant.basePrice)}</p>
                            </div>
                          )}
                        </div>

                        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted"><CalendarDays className="size-3.5" /> Actualizado {formatDate(bowl.updatedAt)}</p>
                        <div className="mt-4">
                          <p className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-muted">{totalSelections} ingredientes seleccionados</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {selectedOptions.slice(0, 4).map((selection) => (
                              <span key={selection.optionId} className={cn('rounded-pill border px-2 py-1 text-[10px] font-semibold', selection.option && !selection.option.isAvailable ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-line bg-surface-muted text-ink-muted')}>
                                {selection.quantity > 1 && `${selection.quantity}× `}{selection.option?.name ?? `Ingrediente #${selection.optionId}`}
                              </span>
                            ))}
                            {selectedOptions.length > 4 && <span className="rounded-pill bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-800">+{selectedOptions.length - 4} más</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {unavailable && (
                      <p className="mx-4 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:mx-5">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Un ingrediente no está disponible en la cocina seleccionada. Personaliza la receta para reemplazarlo.
                      </p>
                    )}

                    <div className="mt-auto p-4 pt-3 sm:p-5 sm:pt-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button disabled={unavailable} isLoading={isBusy(bowl.id, 'cart')} leftIcon={<ShoppingBag className="size-4" />} onClick={() => void addSavedToCart(bowl)}>Agregar al carrito</Button>
                        <Button variant="outline" leftIcon={<Edit3 className="size-4" />} onClick={() => navigate(ROUTES.builder, { state: { savedBowl: bowl } })}>Personalizar</Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-3">
                        <Button size="sm" variant="ghost" leftIcon={<Edit3 className="size-3.5" />} onClick={() => { setRenaming(bowl); setName(bowl.name); }}>Renombrar</Button>
                        <Button size="sm" variant="ghost" leftIcon={<Copy className="size-3.5" />} isLoading={isBusy(bowl.id, 'duplicate')} onClick={() => void run(bowl.id, 'duplicate', () => builderApi.saveBowl({ name: `${bowl.name} (copia)`, productId: bowl.productId, variantId: bowl.variantId, selections: bowl.selections }), 'Bowl duplicado')}>Duplicar</Button>
                        <Button size="sm" variant="ghost" leftIcon={<Trash2 className="size-3.5" />} className="text-red-600 sm:ml-auto" onClick={() => setPendingDelete(bowl)}>Eliminar</Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={renaming !== null}
        onClose={() => busy === null && setRenaming(null)}
        title="Renombrar bowl"
        description="Usa un nombre que te ayude a reconocer esta combinación rápidamente."
        icon={Edit3}
        eyebrow="Editar receta"
        maxWidth="sm"
      >
        <Input label="Nombre de la receta" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} hint={`${name.trim().length}/80 caracteres`} />
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy !== null} onClick={() => setRenaming(null)}>Cancelar</Button>
          <Button disabled={!name.trim()} isLoading={renaming !== null && isBusy(renaming.id, 'rename')} onClick={() => renaming && void (async () => {
            if (await run(renaming.id, 'rename', () => builderApi.updateSavedBowl(renaming.id, { name: name.trim() }), 'Nombre actualizado')) setRenaming(null);
          })()}>Guardar nombre</Button>
        </div>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => busy === null && setPendingDelete(null)}
        title="Eliminar bowl guardado"
        description="La receta dejará de aparecer en tu cuenta, pero tus pedidos anteriores no cambiarán."
        icon={Trash2}
        eyebrow="Confirma la acción"
        maxWidth="xs"
      >
        <div className="rounded-card border border-line bg-surface-muted/55 p-4">
          <p className="text-xs font-bold uppercase tracking-[.08em] text-ink-muted">Receta seleccionada</p>
          <p className="mt-1 font-extrabold text-ink">{pendingDelete?.name}</p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy !== null} onClick={() => setPendingDelete(null)}>Conservar receta</Button>
          <Button variant="danger" isLoading={pendingDelete !== null && isBusy(pendingDelete.id, 'delete')} onClick={() => pendingDelete && void (async () => {
            if (await run(pendingDelete.id, 'delete', () => builderApi.deleteSavedBowl(pendingDelete.id), 'Bowl eliminado')) setPendingDelete(null);
          })()}>Sí, eliminar</Button>
        </div>
      </Modal>
    </div>
  );
};

/** Misma silueta que la tarjeta de receta (media 160px + contenido + dos filas de acciones). */
const SavedBowlsSkeleton = () => (
  <div>
    <div className="mb-5 grid grid-cols-3 gap-2">
      {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-19 rounded-card sm:h-17" />)}
    </div>
    <Skeleton className="mb-4 h-21.5 w-full rounded-card sm:h-23" />
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-card border border-line bg-white">
          <div className="grid sm:grid-cols-[160px_1fr]">
            <Skeleton className="aspect-[16/9] w-full rounded-none sm:aspect-auto sm:min-h-44" />
            <div className="p-4 sm:p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-5 w-2/3" />
              <Skeleton className="mt-3 h-3 w-40" />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Array.from({ length: 4 }).map((__, chip) => <Skeleton key={chip} className="h-6 w-20 rounded-pill" />)}
              </div>
            </div>
          </div>
          <div className="p-4 pt-3 sm:p-5 sm:pt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-11 rounded-field" />
              <Skeleton className="h-11 rounded-field" />
            </div>
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <Skeleton className="h-9 w-28 rounded-field" />
              <Skeleton className="h-9 w-24 rounded-field" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const BowlStat = ({ value, label, icon: Icon, highlighted = false }: {
  value: number;
  label: string;
  icon: typeof Salad;
  highlighted?: boolean;
}) => (
  <div className={cn('rounded-card border p-3 text-center sm:flex sm:items-center sm:gap-3 sm:text-left', highlighted ? 'border-brand-200 bg-brand-50' : 'border-line bg-white')}>
    <span className={cn('mx-auto grid size-8 place-items-center rounded-card sm:mx-0', highlighted ? 'bg-brand-700 text-white' : 'bg-surface-muted text-brand-700')}><Icon className="size-4" /></span>
    <div className="mt-2 min-w-0 sm:mt-0"><p className="text-lg font-black text-ink">{value}</p><p className="truncate text-[10px] font-semibold text-ink-muted sm:text-xs">{label}</p></div>
  </div>
);

const resolveSelections = (bowl: SavedBowl, config?: BuilderConfig): ResolvedSelection[] => {
  if (!config) return bowl.selections.map((selection) => ({ ...selection }));
  const options = config.groups.flatMap((group) => group.options);
  return bowl.selections.map((selection) => ({
    ...selection,
    option: options.find((option) => option.id === selection.optionId),
  }));
};

export default SavedBowlsPage;
