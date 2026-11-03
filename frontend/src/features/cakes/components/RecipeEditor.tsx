import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@services/api/client';
import { Pagination } from '@components/ui/Pagination';
import { cakesApi, type RecipeInventoryItem, type RecipeVariant } from '../cakes.service';

interface DraftLine { inventoryItemId: number | ''; quantity: number; wastePercent: number }
interface Draft { yieldQuantity: number; items: DraftLine[] }

const blankLine = (): DraftLine => ({ inventoryItemId: '', quantity: 0, wastePercent: 0 });
const PAGE_SIZE = 1;

const RecipeEditor = ({ selectedProductId }: { selectedProductId: number }) => {
  const confirm = useConfirm();
  const [variants, setVariants] = useState<RecipeVariant[]>([]);
  const [inventoryItems, setInventoryItems] = useState<RecipeInventoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const selectedVariants = variants.filter((variant) => variant.productId === selectedProductId);
  const totalPages = Math.max(1, Math.ceil(selectedVariants.length / PAGE_SIZE));
  const pageVariants = selectedVariants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [selectedProductId]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const load = async (savedVariantId?: number) => {
    setLoading(true); setError('');
    try {
      const data = await cakesApi.recipes();
      setVariants(data.variants); setInventoryItems(data.inventoryItems);
      setDrafts((current) => Object.fromEntries(data.variants.map((variant) => [variant.id,
        variant.id !== savedVariantId && current[variant.id] ? current[variant.id] : {
          yieldQuantity: variant.recipe?.yieldQuantity ?? 1,
          items: variant.recipe?.items.map((item) => ({ inventoryItemId: item.inventoryItemId, quantity: item.quantity, wastePercent: item.wastePercent })) ?? [blankLine()],
        },
      ])));
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const update = (variantId: number, next: Partial<Draft>) => setDrafts((current) => ({ ...current, [variantId]: { ...current[variantId], ...next } }));
  const updateLine = (variantId: number, index: number, next: Partial<DraftLine>) => setDrafts((current) => ({ ...current, [variantId]: { ...current[variantId], items: current[variantId].items.map((line, lineIndex) => lineIndex === index ? { ...line, ...next } : line) } }));
  const save = async (variant: RecipeVariant) => {
    const draft = drafts[variant.id];
    if (!draft) return;
    if (!Number.isInteger(draft.yieldQuantity) || draft.yieldQuantity < 1 || draft.yieldQuantity > 1000) {
      setError(`Indica un rendimiento de 1 a 1000 unidades para ${variant.productName} · ${variant.name}`);
      return;
    }
    const incomplete = draft.items.some((line) =>
      (line.inventoryItemId !== '' || line.quantity > 0 || line.wastePercent > 0)
      && (line.inventoryItemId === '' || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.wastePercent) || line.wastePercent < 0 || line.wastePercent > 100));
    if (incomplete) { setError(`Completa el insumo, la cantidad y la merma de ${variant.productName} · ${variant.name}`); return; }
    const items = draft.items.filter((line): line is DraftLine & { inventoryItemId: number } => typeof line.inventoryItemId === 'number' && line.quantity > 0);
    if (!items.length) { setError(`Agrega al menos un insumo a ${variant.productName} · ${variant.name}`); return; }
    if (new Set(items.map((line) => line.inventoryItemId)).size !== items.length) { setError('Un insumo aparece más de una vez. Suma sus cantidades en una sola fila.'); return; }
    if (variant.recipe?.items.length) {
      const { confirmed } = await confirm({
        title: 'Guardar cambios en la receta',
        message: 'Al guardar, los alérgenos se recalculan desde los insumos. Si alguno está sin clasificar, el producto dejará de ofrecerse hasta completarlo en Inventario. Los pedidos anteriores conservan sus datos.',
        confirmLabel: 'Guardar receta',
      });
      if (!confirmed) return;
    }
    setBusy(variant.id); setError('');
    try { await cakesApi.updateRecipe(variant.id, { yieldQuantity: draft.yieldQuantity, items }); toast.success(`Receta de ${variant.productName} actualizada`); await load(variant.id); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };
  const removeRecipe = async (variant: RecipeVariant) => {
    if (!variant.recipe) return;
    const { confirmed } = await confirm({
      title: 'Retirar receta',
      message: 'La receta se retirará de esta presentación y el producto dejará de ofrecerse hasta que guardes una nueva. Los pedidos anteriores conservarán sus datos.',
      confirmLabel: 'Retirar receta',
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusy(variant.id); setError('');
    try { await cakesApi.deleteRecipe(variant.id); toast.success(`Receta de ${variant.productName} retirada`); await load(variant.id); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };

  if (loading) return <Card className="mt-10 p-5">Cargando recetas…</Card>;
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-ink">Recetas e inventario</h2>
          <p className="mt-1 text-sm text-ink-muted">Define los insumos que consume cada presentación. Las inactivas también aparecen aquí para que puedas completar su receta antes de activarlas en Catálogo.</p>
          <p className="mt-2 text-sm text-ink-muted">1. Indica cuántas presentaciones rinde la receta. 2. Registra cantidades en la unidad de cada insumo y la merma prevista. 3. Guarda esta presentación. Los alérgenos se calculan desde Inventario.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>Actualizar</Button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {selectedVariants.length === 0 && <Card className="mt-4 p-5 text-sm">No hay presentaciones disponibles para editar. Si el perfil está inactivo, actívalo y guarda las reglas más abajo. Si aún no tiene presentaciones, agrégalas en Catálogo.</Card>}
      {selectedVariants.length > 1 && <Card className="mt-4 p-3"><div className="flex flex-wrap items-center gap-2"><p className="mr-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Presentación</p>{selectedVariants.map((variant, index) => <Button key={variant.id} size="sm" variant={index === page - 1 ? 'primary' : 'outline'} onClick={() => setPage(index + 1)}>{variant.name}</Button>)}</div><p className="mt-2 text-xs text-ink-muted">Edita una presentación a la vez para mantener la receta enfocada.</p></Card>}
      <div className="mt-4 grid gap-4">
        {pageVariants.map((variant) => {
          const draft = drafts[variant.id];
          return (
            <Card key={variant.id} className="min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">{variant.productName} · {variant.name}{variant.servingSize ? ` · ${variant.servingSize} ${variant.servingUnit ?? 'porciones'}` : ''}</h3>
                  <p className="text-xs text-ink-muted">La receta determina los insumos reservados para el pedido y consumidos al empezar en Cocina. El precio de esta presentación ya se fija en Catálogo.</p>
                </div>
                <label className="text-sm font-semibold">
                  Rinde (unidades)
                  <input type="number" min="1" max="1000" value={draft?.yieldQuantity ?? 1} onChange={(event) => update(variant.id, { yieldQuantity: Number(event.target.value) })} className="ml-2 w-20 rounded-lg border border-line p-2" />
                </label>
              </div>
              {!variant.isActive && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  Presentación inactiva. {variant.recipe?.items.length ? 'La receta ya está guardada; puedes activarla desde Catálogo cuando termines aquí.' : 'Guarda una receta con insumos y después actívala desde Catálogo.'}
                </p>
              )}
              {variant.preparationMode === 'READY_STOCK' && <p className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">Conecta esta presentación con artículos de tipo Producto terminado en Inventario. Ejemplo: una caja de 25 consume 25 unidades preparadas; rendimiento 1 caja. Registra las entradas de producto preparado en Inventario.</p>}
              <div className="mt-4 space-y-2">
                {draft?.items.map((line, index) => (
                  <div key={variant.id + '-' + index} className="grid gap-2 sm:grid-cols-[1fr_130px_130px_auto]">
                    <select aria-label="Insumo de receta" value={line.inventoryItemId} onChange={(event) => updateLine(variant.id, index, { inventoryItemId: event.target.value ? Number(event.target.value) : '' })} className="rounded-lg border border-line p-2">
                      <option value="">Selecciona un insumo</option>
                      {inventoryItems.filter((item) => variant.preparationMode !== 'READY_STOCK' || item.itemType === 'FINISHED_PRODUCT').map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                    </select>
                    <input aria-label="Cantidad de receta" type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => updateLine(variant.id, index, { quantity: Number(event.target.value) })} className="rounded-lg border border-line p-2" placeholder="Cantidad" />
                    <input aria-label="Merma porcentual" type="number" min="0" max="100" step="0.1" value={line.wastePercent} onChange={(event) => updateLine(variant.id, index, { wastePercent: Number(event.target.value) })} className="rounded-lg border border-line p-2" placeholder="Merma %" />
                    <Button size="sm" variant="ghost" aria-label="Quitar insumo" onClick={() => update(variant.id, { items: draft.items.filter((_, lineIndex) => lineIndex !== index) })}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => update(variant.id, { items: [...(draft?.items ?? []), blankLine()] })}>Agregar insumo</Button>
                <Button size="sm" leftIcon={<Save className="size-4" />} disabled={busy === variant.id} isLoading={busy === variant.id} onClick={() => void save(variant)}>Guardar receta</Button>
                {variant.recipe && <Button size="sm" variant="danger" disabled={busy === variant.id} onClick={() => void removeRecipe(variant)}>Retirar receta</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      {selectedVariants.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, selectedVariants.length)} de {selectedVariants.length} presentaciones</p>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>}
    </section>
  );
};

export default RecipeEditor;
