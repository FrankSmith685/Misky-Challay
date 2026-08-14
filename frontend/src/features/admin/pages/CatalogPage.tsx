import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleDollarSign,
  Eye,
  EyeOff,
  ImageOff,
  Package,
  Plus,
  Salad,
  Search,
  SlidersHorizontal,
  Tags,
  TriangleAlert,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { FormActions, FormGrid, FormStack } from '@components/ui/FormSection';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { EmptyState } from '@components/common/EmptyState';
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
import {
  ProductEditor,
  PRODUCT_EDITOR_WRITE_PERMISSIONS,
  PRODUCT_STATUS_LABEL,
} from '../components/ProductEditor';
import { MediaPicker } from '../components/MediaPicker';
import { StatusBadge, type StatusMap } from '@components/ui/StatusBadge';

const PRODUCT_STATUS: StatusMap = {
  DRAFT: { label: PRODUCT_STATUS_LABEL.DRAFT, variant: 'neutral' },
  ACTIVE: { label: PRODUCT_STATUS_LABEL.ACTIVE, variant: 'brand' },
  INACTIVE: { label: PRODUCT_STATUS_LABEL.INACTIVE, variant: 'danger' },
};

const EMPTY_NEW = {
  name: '',
  categoryId: 0,
  description: '',
  imageUrl: '',
  imageAlt: '',
  variantName: 'Unico',
  basePrice: '',
};

type NewProductForm = typeof EMPTY_NEW;
type NewProductErrors = Partial<Record<keyof NewProductForm, string>>;

/**
 * Valida el alta ANTES de llamar al API.
 *
 * El backend tambien valida —es quien manda—, pero un 422 solo dice "revisa los
 * datos": aqui se señala el campo concreto y el motivo, sin perder lo escrito.
 */
const validateNewProduct = (form: NewProductForm): NewProductErrors => {
  const price = Number(form.basePrice);
  return {
    ...(form.name.trim().length < 3 ? { name: 'El nombre necesita al menos 3 caracteres.' } : {}),
    ...(!form.categoryId ? { categoryId: 'Elige la categoria donde aparecera.' } : {}),
    ...(form.variantName.trim().length < 2
      ? { variantName: 'Nombra la presentacion (Regular, Grande...).' }
      : {}),
    ...(!form.basePrice.trim() || Number.isNaN(price) || price <= 0
      ? { basePrice: 'Ingresa un precio mayor que cero.' }
      : {}),
  };
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'INACTIVE';

const nutritionOf = (product: AdminProduct) => product.variants[0]?.nutrition;

/** Sin calorias la ficha sale vacia y el constructor no puede sumar el bowl. */
const lacksNutrition = (product: AdminProduct) => {
  const nutrition = nutritionOf(product);
  return !nutrition || nutrition.calories === 0;
};

/**
 * ABM de catalogo.
 * El gestor de catalogo crea y pone precios; el nutricionista solo edita la
 * nutricion. Los dos entran a la misma pantalla y ven bloques distintos.
 */
const CatalogPage = () => {
  const { can, canAny } = usePermissions();
  const confirm = useConfirm();
  const canWrite = can(PERM.CATALOG_PRODUCT_WRITE);
  const canPublish = can(PERM.CATALOG_PRODUCT_PUBLISH);
  const canCreateCategory = can(PERM.CATALOG_CATEGORY_WRITE);
  /** Decide si el modal del producto trae algo editable o es una consulta. */
  const canEditSomething = canAny(...PRODUCT_EDITOR_WRITE_PERMISSIONS);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminProduct | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');

  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<NewProductForm>(EMPTY_NEW);
  const [formBaseline, setFormBaseline] = useState<NewProductForm>(EMPTY_NEW);
  const [formErrors, setFormErrors] = useState<NewProductErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');

  /**
   * Productos y catalogos auxiliares.
   *
   * `allSettled` y no `all`: iban juntos, asi que un fallo en cualquiera de los
   * dos dejaba la pantalla girando para siempre (el `catch` solo lanzaba un toast
   * que se iba en segundos). Ahora lo que llega se pinta y lo que falla se dice.
   */
  const load = useCallback(async () => {
    const [productsResult, metaResult] = await Promise.allSettled([
      catalogAdminApi.products(),
      catalogAdminApi.meta(),
    ]);

    if (productsResult.status === 'fulfilled') {
      const productRows = productsResult.value;
      setProducts(productRows);
      // El editor abierto se refresca con los datos nuevos.
      setEditing((current) =>
        current ? (productRows.find((row) => row.id === current.id) ?? null) : null,
      );
    }
    if (metaResult.status === 'fulfilled') setMeta(metaResult.value);

    const failed = [productsResult, metaResult].find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    setLoadError(failed ? getApiErrorMessage(failed.reason) : null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchForm = (partial: Partial<NewProductForm>) => {
    setForm((current) => ({ ...current, ...partial }));
    // El error se retira en cuanto el gestor toca el campo, no al reenviar.
    setFormErrors((current) => {
      const next = { ...current };
      (Object.keys(partial) as Array<keyof NewProductForm>).forEach((key) => delete next[key]);
      return next;
    });
  };

  const openCreate = (categories: CatalogMeta['categories']) => {
    const initial = { ...EMPTY_NEW, categoryId: categories[0]?.id ?? 0 };
    setForm(initial);
    setFormBaseline(initial);
    setFormErrors({});
    setIsCreating(true);
  };

  /* Item 33: el alta ya no se cierra con un clic fuera, y salir con el formulario
     empezado pregunta antes de tirarlo. */
  const closeCreate = async () => {
    if (isSaving) return;
    if (JSON.stringify(form) !== JSON.stringify(formBaseline)) {
      const { confirmed } = await confirm({
        title: 'Descartar el producto nuevo',
        message: 'Todavía no se ha creado nada. Si sales ahora, se pierde lo escrito.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir escribiendo',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setIsCreating(false);
    setForm(EMPTY_NEW);
    setFormBaseline(EMPTY_NEW);
    setFormErrors({});
  };

  const handleCreate = async () => {
    const errors = validateNewProduct(form);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      await catalogAdminApi.createProduct({
        name: form.name.trim(),
        categoryId: form.categoryId,
        type: 'FIXED',
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl || null,
        variantName: form.variantName.trim(),
        basePrice: Number(form.basePrice),
      });

      toast.success('Producto creado como borrador');
      setIsCreating(false);
      setForm(EMPTY_NEW);
      setFormBaseline(EMPTY_NEW);
      setFormErrors({});
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Alta de categoria.
   *
   * `catalog.category.write` estaba en el rol del gestor de catalogo y el cliente
   * HTTP escrito, pero no se invocaba desde ningun sitio: no habia forma de crear
   * una categoria teniendo el permiso para hacerlo.
   */
  const handleCreateCategory = async () => {
    const name = categoryName.trim();
    if (name.length < 3) {
      setCategoryError('El nombre necesita al menos 3 caracteres.');
      return;
    }

    setIsSaving(true);
    try {
      await catalogAdminApi.createCategory(name);
      toast.success(`Categoría "${name}" creada`);
      setIsCreatingCategory(false);
      setCategoryName('');
      setCategoryError('');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (product: AdminProduct) => {
    const next = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setTogglingId(product.id);
    try {
      await catalogAdminApi.changeStatus(product.id, next);
      toast.success(next === 'ACTIVE' ? 'Publicado en el menu' : 'Retirado del menu');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (statusFilter !== 'ALL' && product.status !== statusFilter) return false;
      if (categoryFilter !== '' && product.category?.id !== categoryFilter) return false;
      if (!needle) return true;
      return `${product.name} ${product.category?.name ?? ''}`.toLowerCase().includes(needle);
    });
  }, [products, query, statusFilter, categoryFilter]);

  const stats = useMemo(
    () => ({
      total: products.length,
      published: products.filter((product) => product.status === 'ACTIVE').length,
      withoutImage: products.filter((product) => !product.imageUrl).length,
      withoutNutrition: products.filter(lacksNutrition).length,
    }),
    [products],
  );

  if (isLoading) return <PageLoader />;

  /* Sin `meta` no hay categorias con las que filtrar ni crear: la pantalla no se
     puede montar y lo dice, con un boton para reintentar. Antes se quedaba
     girando indefinidamente. */
  if (!meta) {
    return (
      <div>
        <PageHeader
          eyebrow="Oferta comercial"
          title="Catálogo"
          description="Los productos nuevos nacen como borrador: no aparecen en el menú hasta publicarlos."
          icon={Package}
        />
        <LoadError
          title="No pudimos cargar el catálogo"
          message={loadError ?? 'El servidor no respondió con los datos del catálogo.'}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const hasFilters = Boolean(query.trim()) || statusFilter !== 'ALL' || categoryFilter !== '';

  return (
    <div>
      <PageHeader
        eyebrow="Oferta comercial"
        title="Catálogo"
        description="Los productos nuevos nacen como borrador: no aparecen en el menú hasta publicarlos."
        icon={Package}
        action={
          (canWrite || canCreateCategory) && (
          <>
            {canCreateCategory && (
              <Button
                variant="outline"
                leftIcon={<Tags className="size-4" />}
                onClick={() => {
                  setCategoryName('');
                  setCategoryError('');
                  setIsCreatingCategory(true);
                }}
              >
                Categoría
              </Button>
            )}
            {canWrite && (
              <Button
                leftIcon={<Plus className="size-4" />}
                onClick={() => openCreate(meta.categories)}
              >
                Nuevo producto
              </Button>
            )}
          </>
          )
        }
      />

      {/* Lo que hay que atender, antes de la rejilla: sin esto, un producto sin
          foto o sin nutricion solo se descubre entrando uno por uno. */}
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen del catálogo">
        <CatalogStat icon={Package} label="Productos" value={stats.total} />
        <CatalogStat icon={Eye} label="Publicados" value={stats.published} tone="brand" />
        <CatalogStat
          icon={ImageOff}
          label="Sin imagen"
          value={stats.withoutImage}
          tone={stats.withoutImage ? 'warning' : 'default'}
        />
        <CatalogStat
          icon={TriangleAlert}
          label="Sin nutrición"
          value={stats.withoutNutrition}
          tone={stats.withoutNutrition ? 'warning' : 'default'}
        />
      </section>

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_220px] lg:items-center">
          <div className="flex min-w-0 items-center gap-2 rounded-field border border-line bg-white px-3">
            <Search className="size-4 shrink-0 text-ink-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o categoría"
              aria-label="Buscar productos"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <Select
            id="catalog-status"
            label="Estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <SelectOption value="ALL">Todos</SelectOption>
            <SelectOption value="ACTIVE">Publicados</SelectOption>
            <SelectOption value="DRAFT">Borradores</SelectOption>
            <SelectOption value="INACTIVE">Retirados</SelectOption>
          </Select>
          <Select
            id="catalog-category"
            label="Categoría"
            value={categoryFilter === '' ? '' : String(categoryFilter)}
            onChange={(event) =>
              setCategoryFilter(event.target.value === '' ? '' : Number(event.target.value))
            }
          >
            <SelectOption value="">Todas</SelectOption>
            {meta.categories.map((category) => (
              <SelectOption key={category.id} value={String(category.id)}>
                {category.name}
              </SelectOption>
            ))}
          </Select>
        </div>
      </Card>

      {/* El fallo se ramifica ANTES de mirar la longitud de la lista: "Todavía no
          hay productos" era lo que se pintaba cuando el servidor no habia
          contestado nada. */}
      {loadError ? (
        <LoadError
          title="No pudimos cargar los productos"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={hasFilters ? SlidersHorizontal : Package}
          title={hasFilters ? 'Ningún producto coincide' : 'Todavía no hay productos'}
          description={
            hasFilters
              ? 'Ajusta la búsqueda, el estado o la categoría para volver a verlos.'
              : 'Crea el primer producto del catálogo. Nacerá como borrador y podrás publicarlo cuando esté listo.'
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('ALL');
                  setCategoryFilter('');
                }}
              >
                Quitar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const priceFrom = product.variants.length
              ? Math.min(...product.variants.map((variant) => variant.basePrice))
              : 0;
            const nutrition = nutritionOf(product);
            const missingNutrition = lacksNutrition(product);

            return (
              <Card key={product.id} className="flex flex-col overflow-hidden p-0">
                <div className="relative aspect-16/8 overflow-hidden bg-surface-muted">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1.5 text-xs font-semibold text-ink-muted">
                      <Salad className="size-9 text-brand-300" />
                      Sin imagen
                    </div>
                  )}
                  <StatusBadge
                    status={product.status}
                    map={PRODUCT_STATUS}
                    fallback={PRODUCT_STATUS.DRAFT}
                    className="absolute right-3 top-3 font-semibold shadow-e1"
                  />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{product.name}</p>
                    <p className="text-xs text-ink-muted">
                      {product.category?.name}
                      {product.type === 'CUSTOMIZABLE' && ' · constructor'}
                      {product.variants.length > 1 && ` · ${product.variants.length} presentaciones`}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1 font-bold text-brand-700">
                      <CircleDollarSign className="size-3.5" />
                      {formatCurrency(priceFrom)}
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs',
                        missingNutrition ? 'font-semibold text-accent-600' : 'text-ink-muted',
                      )}
                    >
                      <Salad className="size-3.5" />
                      {missingNutrition
                        ? 'Falta la nutrición'
                        : `${Math.round(nutrition!.calories)} kcal`}
                    </span>
                  </div>

                  {product.allergens.length > 0 && (
                    <p className="mt-2 line-clamp-2 text-xs text-ink-muted">
                      Contiene: {product.allergens.map((allergen) => allergen.name).join(', ')}
                    </p>
                  )}

                  <div className="mt-auto flex gap-2 pt-4">
                    {/* "Editar" prometia una edicion que el auditor y el admin de
                        sucursal no tienen: para ellos el modal es una consulta y
                        el boton lo dice desde fuera. */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      aria-label={`${canEditSomething ? 'Editar' : 'Ver ficha de'} ${product.name}`}
                      onClick={() => setEditing(product)}
                    >
                      {canEditSomething ? 'Editar' : 'Ver ficha'}
                    </Button>

                    {canPublish && (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={togglingId === product.id}
                        onClick={() => void handleToggleStatus(product)}
                        aria-label={
                          product.status === 'ACTIVE'
                            ? `Retirar ${product.name} del menú`
                            : `Publicar ${product.name} en el menú`
                        }
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
      )}

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
        onClose={() => void closeCreate()}
        title="Nuevo producto"
        description="Se crea como borrador con una presentación y su precio. Podrás publicarlo cuando esté listo."
        icon={Package}
        eyebrow="Alta de catálogo"
        maxWidth="lg"
        disableBackdropClose
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <FormStack>
            <Input
              label="Nombre"
              value={form.name}
              onChange={(event) => patchForm({ name: event.target.value })}
              placeholder="Bowl de atún picante"
              error={formErrors.name}
            />

            <Select
              id="newcat"
              label="Categoría"
              value={form.categoryId ? String(form.categoryId) : ''}
              onChange={(event) => patchForm({ categoryId: Number(event.target.value) })}
              error={formErrors.categoryId}
            >
              {meta.categories.map((category) => (
                <SelectOption key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectOption>
              ))}
            </Select>

            <Input
              label="Descripción (opcional)"
              value={form.description}
              onChange={(event) => patchForm({ description: event.target.value })}
              placeholder="Base de quinua, atún sellado y palta"
              hint="Aparece en la ficha del producto, bajo el nombre."
            />

            <FormGrid minColumnWidth={180}>
              <Input
                label="Presentación"
                value={form.variantName}
                onChange={(event) => patchForm({ variantName: event.target.value })}
                placeholder="Regular"
                error={formErrors.variantName}
              />
              <Input
                label="Precio"
                type="number"
                step="0.10"
                min="0"
                value={form.basePrice}
                onChange={(event) => patchForm({ basePrice: event.target.value })}
                placeholder="29.90"
                error={formErrors.basePrice}
                hint="Precio de venta con IGV incluido."
              />
            </FormGrid>
          </FormStack>

          <div className="grid h-fit gap-3 rounded-card border border-line bg-surface-muted/40 p-4">
            <MediaPicker
              label="Imagen del producto"
              value={form.imageUrl}
              altText={form.imageAlt}
              category="products"
              aspect={4 / 3}
              hint="Formato 4:3, bien iluminada y sin texto."
              onChange={(image) => patchForm({ imageUrl: image.url, imageAlt: image.altText })}
            />
            <p className="text-xs leading-5 text-ink-muted">
              Puedes crearlo sin imagen y añadirla después desde el editor, pero un producto sin foto
              rinde bastante menos en el menú.
            </p>
          </div>
        </div>

        <FormActions>
          <Button variant="outline" disabled={isSaving} onClick={() => void closeCreate()}>
            Cancelar
          </Button>
          <Button isLoading={isSaving} onClick={() => void handleCreate()}>
            Crear producto
          </Button>
        </FormActions>
      </Modal>

      <Modal
        isOpen={isCreatingCategory}
        onClose={() => !isSaving && setIsCreatingCategory(false)}
        title="Nueva categoría"
        description="Agrupa los productos en el menú y en los filtros de esta pantalla."
        icon={Tags}
        eyebrow="Alta de catálogo"
        maxWidth="xs"
        actions={
          <>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => setIsCreatingCategory(false)}
            >
              Cancelar
            </Button>
            <Button isLoading={isSaving} onClick={() => void handleCreateCategory()}>
              Crear categoría
            </Button>
          </>
        }
      >
        <Input
          label="Nombre"
          value={categoryName}
          onChange={(event) => {
            setCategoryName(event.target.value);
            setCategoryError('');
          }}
          placeholder="Bowls de temporada"
          error={categoryError}
          hint="Aparece en el menú público en cuanto tenga productos publicados."
        />
      </Modal>
    </div>
  );
};

const CatalogStat = ({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Package;
  label: string;
  value: number;
  tone?: 'default' | 'brand' | 'warning';
}) => (
  <div
    className={cn(
      'flex items-center gap-3 rounded-card border p-3.5',
      tone === 'brand' && 'border-brand-200 bg-brand-50/55',
      tone === 'warning' && 'border-amber-200 bg-amber-50/60',
      tone === 'default' && 'border-line bg-white',
    )}
  >
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-card',
        tone === 'brand' && 'bg-brand-700 text-white',
        tone === 'warning' && 'bg-amber-500 text-white',
        tone === 'default' && 'bg-surface-muted text-brand-700',
      )}
    >
      <Icon className="size-4" />
    </span>
    <div className="min-w-0">
      <p className="text-lg font-black leading-none text-ink">{value}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-ink-muted">{label}</p>
    </div>
  </div>
);

export default CatalogPage;
