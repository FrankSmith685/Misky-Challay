import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Package, Plus, Salad } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import {
  catalogAdminApi,
  type AdminProduct,
  type CatalogMeta,
} from '../services/catalogAdmin.service';
import { ProductEditor } from '../components/ProductEditor';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-surface-muted text-ink-muted' },
  ACTIVE: { label: 'Publicado', className: 'bg-brand-50 text-brand-700' },
  INACTIVE: { label: 'Retirado', className: 'bg-red-50 text-red-700' },
};

const EMPTY_NEW = { name: '', categoryId: 0, description: '', imageUrl: '', variantName: 'Unico', basePrice: '' };

/**
 * ABM de catalogo.
 * El gestor de catalogo crea y pone precios; el nutricionista solo edita la
 * nutricion. Los dos entran a la misma pantalla y ven bloques distintos.
 */
const CatalogPage = () => {
  const { can } = usePermissions();
  const canWrite = can(PERM.CATALOG_PRODUCT_WRITE);
  const canPublish = can(PERM.CATALOG_PRODUCT_PUBLISH);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProduct | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productRows, catalogMeta] = await Promise.all([
        catalogAdminApi.products(),
        catalogAdminApi.meta(),
      ]);
      setProducts(productRows);
      setMeta(catalogMeta);

      // El editor abierto se refresca con los datos nuevos.
      setEditing((current) =>
        current ? (productRows.find((row) => row.id === current.id) ?? null) : null,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.basePrice || !form.categoryId) {
      toast.error('Completa nombre, categoria y precio');
      return;
    }

    setIsSaving(true);
    try {
      await catalogAdminApi.createProduct({
        name: form.name,
        categoryId: form.categoryId,
        type: 'FIXED',
        description: form.description || undefined,
        imageUrl: form.imageUrl || null,
        variantName: form.variantName || 'Unico',
        basePrice: Number(form.basePrice),
      });

      toast.success('Producto creado como borrador');
      setIsCreating(false);
      setForm(EMPTY_NEW);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (product: AdminProduct) => {
    const next = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      await catalogAdminApi.changeStatus(product.id, next);
      toast.success(next === 'ACTIVE' ? 'Publicado en el menu' : 'Retirado del menu');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (isLoading || !meta) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Oferta comercial"
        title="Catálogo"
        description="Los productos nuevos nacen como borrador: no aparecen en el menú hasta publicarlos."
        icon={Package}
        action={canWrite && (
          <Button
            leftIcon={<Plus className="size-4" />}
            onClick={() => {
              setForm({ ...EMPTY_NEW, categoryId: meta.categories[0]?.id ?? 0 });
              setIsCreating(true);
            }}
          >
            Nuevo producto
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const status = STATUS_LABEL[product.status] ?? STATUS_LABEL.DRAFT;
          const priceFrom = product.variants.length
            ? Math.min(...product.variants.map((variant) => variant.basePrice))
            : 0;
          const nutrition = product.variants[0]?.nutrition;
          const missingNutrition = !nutrition || nutrition.calories === 0;

          return (
            <Card key={product.id} className="flex flex-col overflow-hidden p-0">
              <div className="relative aspect-[16/8] overflow-hidden bg-surface-muted">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="size-full object-cover transition-transform duration-300 hover:scale-105" />
                ) : (
                  <div className="flex size-full items-center justify-center"><Salad className="size-10 text-brand-300" /></div>
                )}
                <span className={cn('absolute right-3 top-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', status.className)}>{status.label}</span>
              </div>
              <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{product.name}</p>
                  <p className="text-xs text-ink-muted">
                    {product.category?.name}
                    {product.type === 'CUSTOMIZABLE' && ' · constructor'}
                  </p>
                </div>

              </div>

              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="font-bold text-brand-700">{formatCurrency(priceFrom)}</span>
                <span
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    missingNutrition ? 'font-medium text-accent-500' : 'text-ink-muted',
                  )}
                >
                  <Salad className="size-3.5" />
                  {missingNutrition
                    ? 'Falta la nutricion'
                    : `${Math.round(nutrition.calories)} kcal`}
                </span>
              </div>

              {product.allergens.length > 0 && (
                <p className="mt-2 text-xs text-ink-muted">
                  Contiene: {product.allergens.map((allergen) => allergen.name).join(', ')}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditing(product)}
                >
                  Editar
                </Button>

                {canPublish && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleStatus(product)}
                    aria-label={product.status === 'ACTIVE' ? 'Retirar' : 'Publicar'}
                  >
                    {product.status === 'ACTIVE' ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                )}
              </div>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <ProductEditor
          product={editing}
          meta={meta}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="Nuevo producto"
        description="Se crea como borrador. Publicalo cuando este listo."
      >
        <div className="space-y-3">
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            placeholder="Bowl de atun picante"
          />

            <Select
              id="newcat"
              label="Categoría"
              value={form.categoryId}
              onChange={(e) => setForm((c) => ({ ...c, categoryId: Number(e.target.value) }))}
            >
              {meta.categories.map((category) => (
                <SelectOption key={category.id} value={category.id}>
                  {category.name}
                </SelectOption>
              ))}
            </Select>

          <Input
            label="Descripcion"
            value={form.description}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
          />

          <Input
            label="Ruta o URL de imagen"
            value={form.imageUrl}
            onChange={(e) => setForm((c) => ({ ...c, imageUrl: e.target.value }))}
            placeholder="/images/products/mi-producto.jpg"
            hint="Archivo de public o URL https; puedes cambiarla después"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Presentacion"
              value={form.variantName}
              onChange={(e) => setForm((c) => ({ ...c, variantName: e.target.value }))}
              placeholder="Regular"
            />
            <Input
              label="Precio"
              type="number"
              step="0.10"
              value={form.basePrice}
              onChange={(e) => setForm((c) => ({ ...c, basePrice: e.target.value }))}
              placeholder="29.90"
            />
          </div>

          <Button className="w-full" isLoading={isSaving} onClick={handleCreate}>
            Crear producto
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CatalogPage;
