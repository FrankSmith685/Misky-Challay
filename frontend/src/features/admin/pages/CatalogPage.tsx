import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CircleDollarSign,
  Archive,
  RotateCcw,
  Eye,
  EyeOff,
  ImageOff,
  Package,
  Pencil,
  Palette,
  Plus,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
import { ProductMedia } from '@components/ui/ProductMedia';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
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
import { ROUTES } from '@constants/routes';
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
import { PRODUCT_FAMILIES, PREPARATION_MODES, PRESENTATION_UNITS, type ProductFamily, type PreparationMode } from '@features/catalog/pastry';

const PRODUCT_STATUS: StatusMap = {
  DRAFT: { label: PRODUCT_STATUS_LABEL.DRAFT, variant: 'neutral' },
  ACTIVE: { label: PRODUCT_STATUS_LABEL.ACTIVE, variant: 'brand' },
  INACTIVE: { label: PRODUCT_STATUS_LABEL.INACTIVE, variant: 'danger' },
  ARCHIVED: { label: 'Archivado', variant: 'neutral' },
};

const EMPTY_NEW = {
  name: '',
  categoryId: 0,
  description: '',
  imageUrl: '',
  imageAlt: '',
  variantName: 'Única',
  basePrice: '',
  family: 'CAKE' as ProductFamily,
  preparationMode: 'MADE_TO_ORDER' as PreparationMode,
  minLeadHours: '24',
  servingSize: '8',
  servingUnit: 'porciones',
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
    ...(form.name.trim().length < 3 || form.name.trim().length > 120 ? { name: 'Usa entre 3 y 120 caracteres.' } : {}),
    ...(!form.categoryId ? { categoryId: 'Elige la categoría del producto.' } : {}),
    ...(!Number.isInteger(Number(form.minLeadHours)) || Number(form.minLeadHours) < 0 || Number(form.minLeadHours) > 720 ? { minLeadHours: 'Usa entre 0 y 720 horas.' } : {}),
    ...(!form.servingSize.trim() || !Number.isFinite(Number(form.servingSize)) || Number(form.servingSize) <= 0 || Number(form.servingSize) > 100000 ? { servingSize: 'Ingresa una cantidad mayor que cero.' } : {}),
    ...(form.description.trim().length > 2000 ? { description: 'La descripción admite hasta 2000 caracteres.' } : {}),
    ...(form.variantName.trim().length < 2 || form.variantName.trim().length > 80
      ? { variantName: 'Usa entre 2 y 80 caracteres para la presentación.' }
      : {}),
    ...(!form.basePrice.trim() || !Number.isFinite(price) || price <= 0
      ? { basePrice: 'Ingresa un precio mayor que cero.' }
      : {}),
  };
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED';

/** ABM de catalogo para productos, presentaciones, precios y disponibilidad. */
const CatalogPage = () => {
  const { can, canAny, isSuperAdmin } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedProductId = Number(searchParams.get('producto'));
  const confirm = useConfirm();
  const canWrite = can(PERM.CATALOG_PRODUCT_WRITE);
  const canPublish = can(PERM.CATALOG_PRODUCT_PUBLISH);
  const canCreateCategory = can(PERM.CATALOG_CATEGORY_WRITE);
  /** Decide si el modal del producto trae algo editable o es una consulta. */
  const canEditSomething = canAny(...PRODUCT_EDITOR_WRITE_PERMISSIONS);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [archivedProducts, setArchivedProducts] = useState<AdminProduct[]>([]);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminProduct | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');
  const [attentionFilter, setAttentionFilter] = useState<'ALL' | 'NO_IMAGE'>('ALL');

  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<NewProductForm>(EMPTY_NEW);
  const [formBaseline, setFormBaseline] = useState<NewProductForm>(EMPTY_NEW);
  const [formErrors, setFormErrors] = useState<NewProductErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showInlineCategory, setShowInlineCategory] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState('');
  const [inlineCategoryImageUrl, setInlineCategoryImageUrl] = useState('');
  const [inlineCategoryError, setInlineCategoryError] = useState('');
  const [isSavingInlineCategory, setIsSavingInlineCategory] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [changingArchiveId, setChangingArchiveId] = useState<number | null>(null);
  const [purgingProductId, setPurgingProductId] = useState<number | null>(null);

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryImageUrl, setCategoryImageUrl] = useState('');
  const [categorySortOrder, setCategorySortOrder] = useState('0');
  const [categoryIsActive, setCategoryIsActive] = useState(true);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

  /**
   * Productos y catalogos auxiliares.
   *
   * `allSettled` y no `all`: iban juntos, asi que un fallo en cualquiera de los
   * dos dejaba la pantalla girando para siempre (el `catch` solo lanzaba un toast
   * que se iba en segundos). Ahora lo que llega se pinta y lo que falla se dice.
   */
  const load = useCallback(async (focusProductId?: number) => {
    const [productsResult, archivedResult, metaResult] = await Promise.allSettled([
      catalogAdminApi.products(),
      catalogAdminApi.products({ archived: true }),
      catalogAdminApi.meta(),
    ]);

    if (productsResult.status === 'fulfilled') {
      const productRows = productsResult.value;
      setProducts(productRows);
      // El editor abierto se refresca con los datos nuevos.
      setEditing((current) => {
        const targetId = focusProductId ?? current?.id;
        return targetId ? (productRows.find((row) => row.id === targetId) ?? null) : null;
      });
    }
    if (archivedResult.status === 'fulfilled') setArchivedProducts(archivedResult.value);
    if (metaResult.status === 'fulfilled') setMeta(metaResult.value);

    const failed = [productsResult, archivedResult, metaResult].find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    setLoadError(failed ? getApiErrorMessage(failed.reason) : null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load(Number.isInteger(linkedProductId) && linkedProductId > 0 ? linkedProductId : undefined);
  }, [load, linkedProductId]);

  const closeEditor = () => {
    setEditing(null);
    if (searchParams.has('producto')) {
      const next = new URLSearchParams(searchParams);
      next.delete('producto');
      setSearchParams(next, { replace: true });
    }
  };

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
    const initial = { ...EMPTY_NEW, categoryId: categories.length === 1 ? categories[0].id : 0 };
    setForm(initial);
    setFormBaseline(initial);
    setFormErrors({});
    setShowInlineCategory(false);
    setInlineCategoryName('');
    setInlineCategoryImageUrl('');
    setInlineCategoryError('');
    setIsCreating(true);
  };

  /* Item 33: el alta ya no se cierra con un clic fuera, y salir con el formulario
     empezado pregunta antes de tirarlo. */
  const closeCreate = async () => {
    if (isSaving || isSavingInlineCategory) return false;
    if (JSON.stringify(form) !== JSON.stringify(formBaseline) || inlineCategoryName.trim() || inlineCategoryImageUrl) {
      const { confirmed } = await confirm({
        title: 'Descartar el producto nuevo',
        message: 'El producto aún no se ha creado. Si sales ahora, se perderán los datos escritos en este formulario.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir escribiendo',
        tone: 'danger',
      });
      if (!confirmed) return false;
    }
    setIsCreating(false);
    setForm(EMPTY_NEW);
    setFormBaseline(EMPTY_NEW);
    setFormErrors({});
    setShowInlineCategory(false);
    setInlineCategoryName('');
    setInlineCategoryImageUrl('');
    setInlineCategoryError('');
    return true;
  };

  const handleCreateInlineCategory = async () => {
    const name = inlineCategoryName.trim();
    if (name.length < 3 || name.length > 80) {
      setInlineCategoryError('Escribe un nombre de 3 a 80 caracteres.');
      return;
    }
    setIsSavingInlineCategory(true);
    setInlineCategoryError('');
    try {
      const category = await catalogAdminApi.createCategory({ name, imageUrl: inlineCategoryImageUrl || null });
      // La categoría ya existe aunque una recarga posterior falle: queda
      // seleccionable de inmediato y no se pide crearla otra vez.
      setMeta((current) => current ? {
        ...current,
        categories: [...current.categories, {
          id: category.id,
          name,
          slug: '',
          imageUrl: inlineCategoryImageUrl || null,
          productCount: 0,
          sortOrder: 0,
          isActive: true,
        }],
      } : current);
      patchForm({ categoryId: category.id });
      setShowInlineCategory(false);
      setInlineCategoryName('');
      setInlineCategoryImageUrl('');
      toast.success(`Categoría «${name}» creada y seleccionada`);
      void catalogAdminApi.meta().then(setMeta).catch(() => undefined);
    } catch (error) {
      setInlineCategoryError(getApiErrorMessage(error));
    } finally {
      setIsSavingInlineCategory(false);
    }
  };

  const handleCreate = async () => {
    const errors = validateNewProduct(form);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      const created = await catalogAdminApi.createProduct({
        name: form.name.trim(),
        categoryId: form.categoryId,
        type: 'FIXED',
        family: form.family,
        preparationMode: form.preparationMode,
        minLeadHours: Number(form.minLeadHours),
        servingSize: Number(form.servingSize),
        servingUnit: form.servingUnit,
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl || null,
        variantName: form.variantName.trim(),
        basePrice: Number(form.basePrice),
      });

      toast.success('Borrador creado. Completa ahora su ficha.');
      setIsCreating(false);
      setForm(EMPTY_NEW);
      setFormBaseline(EMPTY_NEW);
      setFormErrors({});
      setQuery('');
      setStatusFilter('ALL');
      setCategoryFilter('');
      setAttentionFilter('ALL');
      await load(created.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * CRUD de categoria.
   *
   * `catalog.category.write` estaba en el rol del gestor de catalogo y el cliente
   * HTTP escrito, pero no se invocaba desde ningun sitio: no habia forma de crear
   * una categoria teniendo el permiso para hacerlo.
   */
  const handleCreateCategory = async () => {
    const name = categoryName.trim();
    const sortOrder = Number(categorySortOrder);
    if (name.length < 3 || name.length > 80) {
      setCategoryError('Usa entre 3 y 80 caracteres.');
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
      setCategoryError('El orden debe ser un número entero entre 0 y 10000.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingCategoryId) {
        await catalogAdminApi.updateCategory(editingCategoryId, {
          name,
          imageUrl: categoryImageUrl || null,
          sortOrder,
          isActive: categoryIsActive,
        });
        toast.success('Categoría actualizada');
      } else {
        await catalogAdminApi.createCategory({
          name,
          imageUrl: categoryImageUrl || null,
          sortOrder,
          isActive: categoryIsActive,
        });
        toast.success(`Categoría "${name}" creada`);
      }
      setIsCreatingCategory(false);
      setCategoryName('');
      setCategoryImageUrl('');
      setCategorySortOrder('0');
      setCategoryIsActive(true);
      setEditingCategoryId(null);
      setCategoryError('');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const openNewCategory = () => {
    setIsManagingCategories(false);
    setCategoryName('');
    setCategoryImageUrl('');
    setCategorySortOrder('0');
    setCategoryIsActive(true);
    setEditingCategoryId(null);
    setCategoryError('');
    setIsCreatingCategory(true);
  };

  const openCategoryEditor = (categoryId: number) => {
    const category = meta?.categories.find((row) => row.id === categoryId);
    if (!category) return;
    setIsManagingCategories(false);
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryImageUrl(category.imageUrl ?? '');
    setCategorySortOrder(String(category.sortOrder));
    setCategoryIsActive(category.isActive);
    setCategoryError('');
    setIsCreatingCategory(true);
  };

  const handleDeleteCategory = async (category: CatalogMeta['categories'][number]) => {
    if (category.productCount > 0) {
      toast.error(`No se puede eliminar: ${category.name} tiene ${category.productCount} producto${category.productCount === 1 ? '' : 's'} asociado${category.productCount === 1 ? '' : 's'}.`);
      return;
    }

    const { confirmed } = await confirm({
      title: `Eliminar «${category.name}»`,
      message: 'Solo se eliminará esta categoría vacía. Los productos, pedidos y el historial no se verán afectados.',
      confirmLabel: 'Eliminar categoría',
      cancelLabel: 'Conservar',
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeletingCategoryId(category.id);
    try {
      await catalogAdminApi.deleteCategory(category.id);
      if (categoryFilter === category.id) setCategoryFilter('');
      toast.success(`Categoría «${category.name}» eliminada`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const closeCreateCategory = async () => {
    if (isSaving) return;
    const currentCategory = meta?.categories.find((category) => category.id === editingCategoryId);
    const categoryChanged = editingCategoryId !== null && (
      categoryName.trim() !== (currentCategory?.name ?? '')
      || categoryImageUrl !== (currentCategory?.imageUrl ?? '')
      || categorySortOrder !== String(currentCategory?.sortOrder ?? 0)
      || categoryIsActive !== (currentCategory?.isActive ?? true)
    );
    if (editingCategoryId ? categoryChanged : Boolean(categoryName.trim() || categoryImageUrl || categorySortOrder !== '0')) {
      const { confirmed } = await confirm({
        title: editingCategoryId ? 'Descartar cambios de categoría' : 'Descartar la categoría',
        message: editingCategoryId ? 'Los cambios de esta categoría aún no se guardaron.' : 'La categoría aún no se creó. Si sales, se perderán los datos escritos.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir escribiendo',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setIsCreatingCategory(false);
    setCategoryName('');
    setCategoryImageUrl('');
    setCategorySortOrder('0');
    setCategoryIsActive(true);
    setEditingCategoryId(null);
    setCategoryError('');
  };

  const handleToggleStatus = async (product: AdminProduct) => {
    const next = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const publishing = next === 'ACTIVE';
    if (publishing && product.cakeProfile && !product.cakeProfile.isActive) {
      toast.error('Activa primero las reglas de preparación de este producto en Producción.');
      return;
    }
    const { confirmed } = await confirm({
      title: `${publishing ? 'Activar' : 'Retirar'} ${product.name}`,
      message: publishing
        ? product.cakeProfile?.isActive
          ? 'El servidor comprobará que las reglas de preparación y la receta de cada presentación activa estén completos. Al publicarlo, podrá ofrecerse en el catálogo donde esté disponible. Cada cocina puede agotarlo por separado.'
          : 'Este producto aún no tiene perfil de torta ni receta. Si quieres venderlo en la web, cancela esta activación y pulsa «Completar perfil y receta» en su ficha; conservarás el mismo producto. Activarlo ahora solo lo habilita para otros canales.'
        : 'El producto dejará de ofrecerse en los canales de venta de todas las sucursales. Los pedidos ya registrados se conservan. Puedes volver a activarlo después.',
      confirmLabel: publishing ? 'Activar producto' : 'Retirar producto',
      cancelLabel: 'Volver al catálogo',
      tone: publishing ? 'default' : 'danger',
    });
    if (!confirmed) return;
    setTogglingId(product.id);
    try {
      await catalogAdminApi.changeStatus(product.id, next);
      toast.success(publishing
        ? product.cakeProfile?.isActive ? 'Producto publicado. Comprueba su disponibilidad por cocina.' : 'Producto activado. Sin reglas de preparación activas no aparece en el catálogo público.'
        : 'Producto retirado de la venta');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteDraftProduct = async (product: AdminProduct) => {
    if (product.status !== 'DRAFT') return;
    const { confirmed } = await confirm({
      title: `Eliminar borrador «${product.name}»`,
      message: 'Se eliminará este producto y su configuración incompleta. Esta acción no afecta pedidos porque el producto todavía no se ha publicado.',
      confirmLabel: 'Eliminar borrador',
      cancelLabel: 'Conservar borrador',
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeletingProductId(product.id);
    try {
      await catalogAdminApi.deleteDraftProduct(product.id);
      if (editing?.id === product.id) closeEditor();
      toast.success(`Borrador «${product.name}» eliminado`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleArchiveProduct = async (product: AdminProduct) => {
    if (product.status !== 'INACTIVE' || product.archivedAt) return;
    const { confirmed } = await confirm({
      title: `Archivar «${product.name}»`,
      message: 'Desaparecerá del catálogo habitual. Sus pedidos e historial se conservan y podrás restaurarlo desde el filtro «Archivados».',
      confirmLabel: 'Archivar producto',
      cancelLabel: 'Conservar producto',
      tone: 'danger',
    });
    if (!confirmed) return;
    setChangingArchiveId(product.id);
    try {
      await catalogAdminApi.archiveProduct(product.id);
      if (editing?.id === product.id) closeEditor();
      setQuery('');
      setCategoryFilter('');
      setAttentionFilter('ALL');
      setStatusFilter('ARCHIVED');
      toast.success(`«${product.name}» archivado`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setChangingArchiveId(null);
    }
  };

  const handleRestoreProduct = async (product: AdminProduct) => {
    if (!product.archivedAt) return;
    const { confirmed } = await confirm({
      title: `Restaurar «${product.name}»`,
      message: 'Volverá al catálogo administrativo con estado Retirado. No se publicará para clientes.',
      confirmLabel: 'Restaurar producto',
      cancelLabel: 'Conservar archivado',
    });
    if (!confirmed) return;
    setChangingArchiveId(product.id);
    try {
      await catalogAdminApi.restoreProduct(product.id);
      setQuery('');
      setCategoryFilter('');
      setAttentionFilter('ALL');
      setStatusFilter('INACTIVE');
      toast.success(`«${product.name}» restaurado como retirado`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setChangingArchiveId(null);
    }
  };

  const handlePurgeDemoProduct = async (product: AdminProduct) => {
    if (!import.meta.env.DEV || !isSuperAdmin || !product.archivedAt || purgingProductId !== null) return;
    setPurgingProductId(product.id);
    try {
      const plan = await catalogAdminApi.previewDemoProductPurge(product.id);
      if (plan.product.id !== product.id || plan.product.slug !== product.slug) {
        throw new Error('La ficha cambió. Actualiza el catálogo antes de borrarla.');
      }
      const historyCount = plan.productAuditLogs + plan.variantAuditLogs;
      const { confirmed } = await confirm({
        title: `Eliminar definitivamente «${product.name}»`,
        message: `Se borrarán esta ficha, ${plan.variants.length} presentaciones y ${historyCount} registros de su historial. Se creará un respaldo completo de la base local antes de borrar. Los pedidos, las imágenes y los insumos compartidos no se eliminarán. Esta acción no se puede deshacer desde el panel. Escribe ${product.slug} para confirmar.`,
        confirmLabel: 'Eliminar definitivamente',
        cancelLabel: 'Conservar archivado',
        requireTypedText: product.slug,
        tone: 'danger',
      });
      if (!confirmed) return;
      const result = await catalogAdminApi.purgeDemoProduct(product.id, product.slug);
      toast.success(`Ficha eliminada. Respaldo: ${result.backup}`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setPurgingProductId(null);
    }
  };

  const catalogSource = statusFilter === 'ARCHIVED' ? archivedProducts : products;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogSource.filter((product) => {
      if (statusFilter !== 'ALL' && statusFilter !== 'ARCHIVED' && product.status !== statusFilter) return false;
      if (categoryFilter !== '' && product.category?.id !== categoryFilter) return false;
      if (attentionFilter === 'NO_IMAGE' && product.imageUrl) return false;
      if (!needle) return true;
      return `${product.name} ${product.category?.name ?? ''} ${product.variants.map((variant) => variant.sku).join(' ')}`.toLowerCase().includes(needle);
    });
  }, [catalogSource, query, statusFilter, categoryFilter, attentionFilter]);

  const stats = useMemo(
    () => ({
      total: products.length,
      published: products.filter((product) => product.status === 'ACTIVE').length,
      withoutImage: products.filter((product) => !product.imageUrl).length,
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
          description="Los productos nuevos nacen como borrador: no aparecen en el catálogo hasta publicarlos."
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

  const hasFilters = Boolean(query.trim()) || statusFilter !== 'ALL' || categoryFilter !== '' || attentionFilter !== 'ALL';
  const clearFilters = () => {
    setQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('');
    setAttentionFilter('ALL');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Oferta comercial"
        title="Catálogo"
        description="Organiza productos, categorías, precios y datos que ve el cliente. Los productos nuevos nacen como borrador y la publicación requiere un permiso aparte."
        icon={Package}
        action={
          (
          <>
            {(
              <Button component={Link} to={ROUTES.adminCakeThemes} variant="outline" leftIcon={<Palette className="size-4" />}>Diseños para empresas</Button>
            )}
            {canCreateCategory && (
              <Button
                variant="outline"
                leftIcon={<Tags className="size-4" />}
                onClick={() => setIsManagingCategories(true)}
              >
                Gestionar categorías
              </Button>
            )}
            {canWrite && (
              <Button
                leftIcon={<Plus className="size-4" />}
                disabled={meta.categories.length === 0}
                onClick={() => openCreate(meta.categories)}
              >
                Nuevo producto
              </Button>
            )}
          </>
          )
        }
      />

      <Card className="mb-5 border-brand-200 bg-brand-50/40 p-4 sm:p-5" shadow="e1">
        <h2 className="text-base font-black text-ink">¿Para qué sirve este catálogo?</h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">Aquí preparas la información con la que se ofrece un producto: nombre, categoría, foto, tamaños y precios. Los alérgenos informan al cliente; la disponibilidad controla en qué cocina puede pedirlo. El stock de insumos se lleva en Inventario.</p>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          <li className="rounded-card border border-line bg-white p-3"><strong className="text-sm text-ink">1. Crea un borrador</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Elige categoría, nombre, primera presentación y precio. El borrador todavía no se vende.</p></li>
          <li className="rounded-card border border-line bg-white p-3"><strong className="text-sm text-ink">2. Completa la ficha</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Al crear el borrador se abrirá su ficha. Añade imagen, presentaciones, receta, características y disponibilidad. Guarda cada bloque que cambies.</p></li>
          <li className="rounded-card border border-line bg-white p-3"><strong className="text-sm text-ink">3. Activa cuando esté listo</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Publicar habilita el producto. Para aparecer en el catálogo web de tortas necesita además un perfil activo, tiempos y receta en Producción.</p></li>
        </ol>
        <p className="mt-3 rounded-field bg-white px-3 py-2 text-xs leading-5 text-ink-muted"><strong>Estados y efecto:</strong> Borrador aún no se vende; Publicado lo habilita en los canales donde esté configurado; Retirado deja de ofrecerse en todas las sucursales; Archivado se oculta de la lista habitual y se puede consultar o restaurar desde «Archivados». «Agotado» se configura dentro de la ficha y afecta solo a la cocina elegida. Crear o editar una ficha no la publica automáticamente.</p>
        <p className="mt-2 text-xs leading-5 text-ink-muted"><strong>Cómo se relaciona:</strong> Compras registra la adquisición de insumos; Inventario controla sus cantidades; este Catálogo define qué productos se ofrecen y a qué precio; Pedidos usa la oferta vigente y Cocina prepara los pedidos recibidos. Producción conecta las recetas y tiempos de preparación; los productos preparados se conectan con existencias de producto terminado.</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-brand-200 pt-3 text-xs font-bold">
          {canAny(PERM.KITCHEN_READ, PERM.KITCHEN_OPERATE, PERM.CATALOG_CUSTOMIZATION_WRITE) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminCakes}>Abrir Producción →</Link>}
          {can(PERM.PROCUREMENT_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminProcurement}>Ver Compras →</Link>}
          {can(PERM.INVENTORY_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminInventory}>Ver insumos →</Link>}
          {can(PERM.ORDER_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminOrders}>Ver Pedidos →</Link>}
          {can(PERM.KITCHEN_READ) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminKitchen}>Ver Cocina →</Link>}
          {can(PERM.CATALOG_CUSTOMIZATION_WRITE) && <Link className="text-brand-700 hover:underline" to={ROUTES.adminBuilder}>Configurar opciones del constructor →</Link>}
          <Link className="text-brand-700 hover:underline" to={ROUTES.menu}>Ver catálogo como cliente →</Link>
        </div>
      </Card>

      {meta.categories.length === 0 && (
        <div role="status" className="mb-5 rounded-card border border-accent-300 bg-accent-50 p-4 text-sm text-accent-800">
          Primero crea una categoría para poder registrar productos. {canCreateCategory ? 'Usa el botón Categoría de arriba.' : 'Solicita a alguien con permiso de categorías que la cree.'}
        </div>
      )}

      {/* Lo que hay que atender, antes de la rejilla. */}
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen del catálogo">
        <CatalogStat icon={Package} label="No archivados" value={stats.total} onClick={clearFilters} active={!hasFilters} />
        <CatalogStat icon={Eye} label="Publicados" value={stats.published} tone="brand" onClick={() => { clearFilters(); setStatusFilter('ACTIVE'); }} active={statusFilter === 'ACTIVE' && attentionFilter === 'ALL'} />
        <CatalogStat
          icon={ImageOff}
          label="Sin imagen"
          value={stats.withoutImage}
          tone={stats.withoutImage ? 'warning' : 'default'}
          onClick={() => { clearFilters(); setAttentionFilter('NO_IMAGE'); }}
          active={attentionFilter === 'NO_IMAGE'}
        />
        <CatalogStat
          icon={Archive}
          label="Archivados"
          value={archivedProducts.length}
          onClick={() => { clearFilters(); setStatusFilter('ARCHIVED'); }}
          active={statusFilter === 'ARCHIVED'}
        />
      </section>

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_220px] lg:items-center">
          <div className="flex min-w-0 items-center gap-2 rounded-field border border-line bg-white px-3">
            <Search className="size-4 shrink-0 text-ink-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, categoría o SKU"
              aria-label="Buscar productos por nombre, categoría o SKU"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <Select
            id="catalog-status"
            label="Estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <SelectOption value="ALL">No archivados</SelectOption>
            <SelectOption value="ACTIVE">Publicados</SelectOption>
            <SelectOption value="DRAFT">Borradores</SelectOption>
            <SelectOption value="INACTIVE">Retirados</SelectOption>
            <SelectOption value="ARCHIVED">Archivados ({archivedProducts.length})</SelectOption>
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
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          <span role="status">Mostrando {filtered.length} de {catalogSource.length} productos{statusFilter === 'ARCHIVED' ? ' archivados' : ''}.</span>
          {attentionFilter !== 'ALL' && <span className="font-semibold text-accent-700">Filtro: sin imagen</span>}
          {hasFilters && <Button size="sm" variant="ghost" onClick={clearFilters}>Quitar filtros</Button>}
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
                onClick={clearFilters}
              >
                Quitar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const activeVariants = product.variants.filter((variant) => variant.isActive);
            const priceFrom = activeVariants.length
              ? Math.min(...activeVariants.map((variant) => variant.basePrice))
              : 0;

            return (
              <Card key={product.id} className="flex flex-col overflow-hidden p-0">
                <div className="relative aspect-16/8 overflow-hidden bg-surface-muted">
                  <ProductMedia src={product.imageUrl} alt={product.name} ratio="16/9" compact className="size-full" />
                  <StatusBadge
                    status={product.archivedAt ? 'ARCHIVED' : product.status}
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
                      {product.type === 'CUSTOMIZABLE' && ' · personalizable'}
                      {product.variants.length > 1 && ` · ${product.variants.length} presentaciones`}
                    </p>
                    {product.archivedAt ? <p className="mt-1 text-xs text-ink-muted">Archivado · conserva pedidos e historial</p> : product.cakeProfile?.isActive ? <p className="mt-1 text-xs font-semibold text-brand-700">Reglas de preparación activas · requiere publicación y disponibilidad</p> : product.cakeProfile ? <p className="mt-1 text-xs font-semibold text-accent-700">Reglas de preparación inactivas · complétalo en Producción antes de activar</p> : <p className="mt-1 text-xs text-ink-muted">Sin reglas de preparación · requiere preparación y receta para ofrecerse en el catálogo</p>}
                    {product.cakeProfile && !product.allergensReviewedAt && <p className="mt-1 text-xs font-semibold text-accent-700">Alérgenos pendientes de cálculo · clasifica sus insumos en Inventario</p>}
                    {product.cakeProfile && <p className="mt-1 break-all text-xs text-ink-muted">Ficha propia: {ROUTES.cake(product.slug)}{(product.status !== 'ACTIVE' || !product.cakeProfile.isActive || !product.allergensReviewedAt) && ' · pendiente de completar y publicar'}</p>}
                    {product.isFeatured && product.cakeProfile?.isActive && <p className="mt-1 text-xs font-semibold text-accent-700">Destacado en la ordenación del catálogo</p>}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1 font-bold text-brand-700">
                      <CircleDollarSign className="size-3.5" />
                      {activeVariants.length ? `Desde ${formatCurrency(priceFrom)}` : 'Sin presentación activa'}
                    </span>
                  </div>

                  {product.status === 'ACTIVE' && product.cakeProfile?.isActive && product.allergensReviewedAt && (
                    <Link className="mt-2 text-xs font-bold text-brand-700 hover:underline" to={ROUTES.cake(product.slug)}>Ver ficha como cliente →</Link>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {/* "Editar" prometia una edicion que el auditor y el admin de
                        sucursal no tienen: para ellos el modal es una consulta y
                        el boton lo dice desde fuera. */}
                    {!product.archivedAt && <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      aria-label={`${canEditSomething ? 'Abrir ficha de' : 'Ver ficha de'} ${product.name}`}
                      onClick={() => setEditing(product)}
                    >
                      {canEditSomething ? 'Abrir ficha' : 'Ver ficha'}
                    </Button>}

                    {canWrite && product.status === 'DRAFT' && (
                      <Button
                        size="sm"
                        variant="danger"
                        isLoading={deletingProductId === product.id}
                        onClick={() => void handleDeleteDraftProduct(product)}
                        aria-label={`Eliminar borrador ${product.name}`}
                      >
                        <Trash2 className="size-4" />
                        Eliminar
                      </Button>
                    )}

                    {canWrite && product.status === 'INACTIVE' && !product.archivedAt && (
                      <Button size="sm" variant="outline" isLoading={changingArchiveId === product.id} onClick={() => void handleArchiveProduct(product)} aria-label={`Archivar ${product.name}`}>
                        <Archive className="size-4" /> Archivar
                      </Button>
                    )}

                    {canWrite && product.archivedAt && (
                      <Button size="sm" variant="outline" isLoading={changingArchiveId === product.id} onClick={() => void handleRestoreProduct(product)} aria-label={`Restaurar ${product.name}`}>
                        <RotateCcw className="size-4" /> Restaurar
                      </Button>
                    )}

                    {import.meta.env.DEV && isSuperAdmin && product.archivedAt && (
                      <Button size="sm" variant="danger" isLoading={purgingProductId === product.id} onClick={() => void handlePurgeDemoProduct(product)} aria-label={`Eliminar definitivamente ${product.name}`}>
                        <Trash2 className="size-4" /> Eliminar definitivamente
                      </Button>
                    )}

                    {canPublish && !product.archivedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={togglingId === product.id}
                        onClick={() => void handleToggleStatus(product)}
                        aria-label={
                          product.status === 'ACTIVE'
                            ? `Retirar ${product.name} del catálogo`
                            : `Publicar ${product.name} en el catálogo`
                        }
                      >
                        {product.status === 'ACTIVE' ? <><EyeOff className="size-4" /> Retirar</> : <><Eye className="size-4" /> Activar</>}
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
          onClose={closeEditor}
          onSaved={() => load()}
          onToggleStatus={canPublish ? () => handleToggleStatus(editing) : undefined}
          onDeleteDraft={canWrite && editing.status === 'DRAFT' ? () => handleDeleteDraftProduct(editing) : undefined}
          onArchive={canWrite && editing.status === 'INACTIVE' && !editing.archivedAt ? () => handleArchiveProduct(editing) : undefined}
          archiveChanging={changingArchiveId === editing.id}
          deleteChanging={deletingProductId === editing.id}
          statusChanging={togglingId === editing.id}
        />
      )}

      <Modal
        isOpen={isCreating}
        onClose={() => void closeCreate()}
        title="Nuevo producto"
        description="Registra los datos iniciales. Al crearla se abrirá la ficha para completar los demás pasos."
        icon={Package}
        eyebrow="Alta de catálogo"
        maxWidth="lg"
        disableBackdropClose
      >
        <div className="mb-5 rounded-card border border-brand-200 bg-brand-50 p-3 text-sm leading-6 text-brand-800">
          Registra tortas, postres, turrones o bocaditos. Las reglas de preparación se crean junto con el borrador. Después conecta su receta o el stock de producto terminado desde Producción antes de publicarlo.
        </div>
        <div className="mb-5 grid gap-3 rounded-card border border-line bg-surface-muted/40 p-3 text-xs leading-5 text-ink-muted sm:grid-cols-3">
          {[
            ['1', 'Ahora', 'Nombre, categoría, presentación y precio.'],
            ['2', 'Después', 'Completa foto, receta, características y disponibilidad.'],
            ['3', 'Resultado', 'Queda como borrador hasta publicarlo.'],
          ].map(([step, title, description]) => (
            <div key={step} className="flex gap-2.5 rounded-field border border-line/80 bg-white/65 p-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-[11px] font-black text-white">{step}</span>
              <p><strong className="block text-ink">{title}</strong>{description}</p>
            </div>
          ))}
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <FormStack className="min-w-0">
            <Input
              label="Nombre"
              value={form.name}
              onChange={(event) => patchForm({ name: event.target.value })}
              placeholder="Nombre del producto"
              error={formErrors.name}
              hint="Así aparecerá en las fichas y búsquedas."
            />

            <Select
              id="newcat"
              label="Categoría"
              value={form.categoryId ? String(form.categoryId) : ''}
              onChange={(event) => patchForm({ categoryId: Number(event.target.value) })}
              error={formErrors.categoryId}
              hint="Agrupa productos similares. Podrás cambiarla desde la ficha."
            >
              <SelectOption value="" disabled>Selecciona una categoría</SelectOption>
              {meta.categories.map((category) => (
                <SelectOption key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectOption>
              ))}
            </Select>

            <FormGrid minColumnWidth={180}>
              <Select label="Familia del producto" value={form.family} onChange={(event) => { const family = event.target.value as ProductFamily; patchForm({ family, servingSize: family === 'CAKE' ? '8' : '1', servingUnit: family === 'CAKE' ? 'porciones' : 'unidades' }); }}>
                {Object.entries(PRODUCT_FAMILIES).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}
              </Select>
              <Select label="Forma de preparación" value={form.preparationMode} onChange={(event) => patchForm({ preparationMode: event.target.value as PreparationMode })}>
                {Object.entries(PREPARATION_MODES).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}
              </Select>
            </FormGrid>
            <Input label="Anticipación mínima (horas)" type="number" min="0" max="720" step="1" value={form.minLeadHours} error={formErrors.minLeadHours} onChange={(event) => patchForm({ minLeadHours: event.target.value })} hint={form.preparationMode === 'READY_STOCK' ? 'Tiempo necesario para preparar el despacho. La venta depende de existencias de producto terminado.' : '24 significa pedir con un día de anticipación. La fecha también depende de la capacidad disponible.'} />

            {canCreateCategory && (
              <div className="rounded-field border border-line bg-surface-muted/40 p-3 text-sm">
                <button
                  type="button"
                  className="font-semibold text-brand-700 underline underline-offset-2"
                  onClick={() => setShowInlineCategory((current) => !current)}
                  disabled={isSaving || isSavingInlineCategory}
                  aria-expanded={showInlineCategory}
                >
                  {showInlineCategory ? 'Cerrar creación de categoría' : '¿No encuentras la categoría? Créala aquí'}
                </button>
                {showInlineCategory && (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs leading-5 text-ink-muted">Ponle un nombre al grupo. Al guardarlo, quedará seleccionado para este producto; el borrador aún no se creará.</p>
                    <Input
                      label="Nombre de la nueva categoría"
                      value={inlineCategoryName}
                      onChange={(event) => { setInlineCategoryName(event.target.value); setInlineCategoryError(''); }}
                      placeholder="Por ejemplo, Tortas de temporada"
                      error={inlineCategoryError}
                    />
                    <MediaPicker
                      label="Imagen de la categoría (opcional)"
                      value={inlineCategoryImageUrl}
                      altText={inlineCategoryName}
                      category="categories"
                      imagePurpose="category"
                      subjectName={inlineCategoryName}
                      aspect={4 / 3}
                      hint="Puedes subirla, elegirla de la biblioteca o generar una con IA. Solo se verá públicamente cuando haya productos publicados en esta categoría."
                      onChange={(image) => setInlineCategoryImageUrl(image.url)}
                    />
                    <Button size="sm" variant="outline" isLoading={isSavingInlineCategory} onClick={() => void handleCreateInlineCategory()}>
                      Crear y seleccionar categoría
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Textarea
              label="Descripción para el cliente (opcional)"
              value={form.description}
              onChange={(event) => patchForm({ description: event.target.value })}
              placeholder="Cuenta qué incluye, para qué ocasión es o qué la hace especial."
              hint="Aparecerá en la ficha del producto. Máximo 2000 caracteres."
              rows={2}
              maxLength={2000}
              error={formErrors.description}
            />

            <FormGrid minColumnWidth={180}>
              <Input label="Contenido de la presentación" type="number" min="0.01" max="100000" step="any" value={form.servingSize} error={formErrors.servingSize} onChange={(event) => patchForm({ servingSize: event.target.value })} hint="Ej.: 8 porciones, 1 unidad, 25 unidades o 500 g." />
              <Select label="Unidad de presentación" value={form.servingUnit} onChange={(event) => patchForm({ servingUnit: event.target.value })}>{Object.entries(PRESENTATION_UNITS).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>
              <Input
                label="Presentación"
                value={form.variantName}
                onChange={(event) => patchForm({ variantName: event.target.value })}
                placeholder="Regular"
                error={formErrors.variantName}
                hint="Tamaño o formato que el cliente elegirá."
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

          <div className="grid h-fit min-w-0 gap-3 rounded-card border border-line bg-surface-muted/40 p-4">
            <MediaPicker
              label="Imagen del producto"
              layout="stacked"
              value={form.imageUrl}
              altText={form.imageAlt}
              category="products"
              imagePurpose="product"
              subjectName={form.name}
              subjectDescription={form.description}
              aspect={4 / 3}
              hint="Formato 4:3, bien iluminada y sin texto."
              onChange={(image) => patchForm({ imageUrl: image.url, imageAlt: image.altText })}
            />
            <p className="text-xs leading-5 text-ink-muted">
              Puedes añadir la foto después. Si eliges una ahora, se asociará al producto al crear el borrador.
            </p>
          </div>
        </div>

        <FormActions>
          <Button variant="outline" disabled={isSaving || isSavingInlineCategory} onClick={() => void closeCreate()}>
            Cancelar
          </Button>
          <Button disabled={isSavingInlineCategory} isLoading={isSaving} onClick={() => void handleCreate()}>
            Crear borrador y continuar
          </Button>
        </FormActions>
      </Modal>

      <Modal
        isOpen={isManagingCategories}
        onClose={() => setIsManagingCategories(false)}
        title="Gestionar categorías"
        description="Crea grupos, cambia sus imágenes y elimina solo las categorías que todavía no tienen productos asociados."
        icon={Tags}
        eyebrow="Organización del catálogo"
        maxWidth="md"
        actions={
          <>
            <Button variant="outline" onClick={() => setIsManagingCategories(false)}>Cerrar</Button>
            <Button leftIcon={<Plus className="size-4" />} onClick={openNewCategory}>Nueva categoría</Button>
          </>
        }
      >
        <div className="mb-4 rounded-card border border-brand-200 bg-brand-50 p-3 text-sm leading-6 text-brand-800">
          Las categorías con productos se conservan para no romper el catálogo ni el historial. Para eliminarlas, reasigna primero sus productos desde cada ficha.
        </div>
        <div className="grid gap-3">
          {meta.categories.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="Todavía no hay categorías"
              description="Crea la primera categoría para organizar tus productos."
              action={<Button onClick={openNewCategory}>Crear categoría</Button>}
            />
          ) : meta.categories.map((category) => (
            <div key={category.id} className="flex flex-col gap-3 rounded-card border border-line bg-white p-3 sm:flex-row sm:items-center">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-field border border-line bg-surface-muted text-ink-muted">
                {category.imageUrl ? (
                  <img src={category.imageUrl} alt="" className="size-full object-cover" />
                ) : <ImageOff className="size-5" aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-ink">{category.name}</p>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-bold',
                    category.isActive ? 'bg-brand-50 text-brand-700' : 'bg-surface-muted text-ink-muted',
                  )}>
                    {category.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {category.productCount} producto{category.productCount === 1 ? '' : 's'} asociado{category.productCount === 1 ? '' : 's'}
                  {' · '}{category.imageUrl ? 'Con imagen' : 'Sin imagen'}
                </p>
                {category.productCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">Reasigna los productos para poder eliminarla.</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Pencil className="size-4" />}
                  onClick={() => openCategoryEditor(category.id)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  leftIcon={<Trash2 className="size-4" />}
                  disabled={category.productCount > 0 || deletingCategoryId === category.id}
                  isLoading={deletingCategoryId === category.id}
                  title={category.productCount > 0 ? 'Reasigna los productos antes de eliminar la categoría' : 'Eliminar categoría'}
                  onClick={() => void handleDeleteCategory(category)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={isCreatingCategory}
        onClose={() => void closeCreateCategory()}
        title={editingCategoryId ? 'Editar categoría' : 'Nueva categoría'}
        description="Administra el nombre, el orden, el estado y la imagen que identifican esta categoría."
        icon={Tags}
        eyebrow="Gestión de catálogo"
        maxWidth="md"
        disableBackdropClose
        actions={
          <>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => void closeCreateCategory()}
            >
              Cancelar
            </Button>
            <Button isLoading={isSaving} onClick={() => void handleCreateCategory()}>
              {editingCategoryId ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </>
        }
      >
        <div className="mb-4 rounded-card border border-brand-200 bg-brand-50 p-3 text-xs leading-5 text-brand-800">
          <strong>¿Para qué sirve?</strong> Agrupa productos en el catálogo. Su imagen ayuda a reconocer el grupo, pero la categoría solo aparece públicamente cuando contiene productos publicados.
        </div>
        <FormStack spacing={3}>
          {(meta?.categories.length ?? 0) > 0 && <Select
            id="category-image-target"
            label="Categoría"
            value={editingCategoryId ? String(editingCategoryId) : ''}
            onChange={(event) => {
              const id = Number(event.target.value) || null;
              const category = meta?.categories.find((row) => row.id === id);
              setEditingCategoryId(id);
              setCategoryName(category?.name ?? '');
              setCategoryImageUrl(category?.imageUrl ?? '');
              setCategorySortOrder(String(category?.sortOrder ?? 0));
              setCategoryIsActive(category?.isActive ?? true);
              setCategoryError('');
            }}
          >
            <SelectOption value="">Crear categoría nueva</SelectOption>
            {meta?.categories.map((category) => <SelectOption key={category.id} value={String(category.id)}>Editar {category.name}</SelectOption>)}
          </Select>}
          <Input
            label="Nombre"
            value={categoryName}
            onChange={(event) => {
              setCategoryName(event.target.value);
              setCategoryError('');
            }}
            placeholder="Tortas de temporada"
            error={categoryError}
            hint="Aparecerá en el catálogo web cuando contenga productos publicados y esté activa."
          />
        </FormStack>
        <FormGrid className="mt-4" minColumnWidth={180}>
          <Input
            label="Orden"
            type="number"
            min="0"
            max="10000"
            step="1"
            value={categorySortOrder}
            onChange={(event) => {
              setCategorySortOrder(event.target.value);
              setCategoryError('');
            }}
            hint="Las categorías con menor número aparecen primero."
          />
          <Select
            id="category-status"
            label="Estado"
            value={categoryIsActive ? 'ACTIVE' : 'INACTIVE'}
            onChange={(event) => setCategoryIsActive(event.target.value === 'ACTIVE')}
          >
            <SelectOption value="ACTIVE">Activa</SelectOption>
            <SelectOption value="INACTIVE">Inactiva</SelectOption>
          </Select>
        </FormGrid>
        <div className="mt-4">
          <MediaPicker
            label="Imagen de la categoría (opcional)"
            value={categoryImageUrl}
            altText={editingCategoryId ? meta?.categories.find((category) => category.id === editingCategoryId)?.name ?? '' : categoryName}
            category="categories"
            imagePurpose="category"
            subjectName={editingCategoryId ? meta?.categories.find((category) => category.id === editingCategoryId)?.name ?? '' : categoryName}
            aspect={4 / 3}
            hint="Puedes subir una foto, elegirla de la biblioteca o generar una propuesta con IA. Revisa que represente los productos de este grupo."
            onChange={(image) => setCategoryImageUrl(image.url)}
          />
        </div>
      </Modal>
    </div>
  );
};

const CatalogStat = ({
  icon: Icon,
  label,
  value,
  tone = 'default',
  onClick,
  active = false,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  tone?: 'default' | 'brand' | 'warning';
  onClick: () => void;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={`Mostrar ${label.toLowerCase()}: ${value}`}
    className={cn(
      'flex items-center gap-3 rounded-card border p-3.5 text-left transition hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
      tone === 'brand' && 'border-brand-200 bg-brand-50/55',
      tone === 'warning' && 'border-amber-200 bg-amber-50/60',
      tone === 'default' && 'border-line bg-white',
      active && 'ring-2 ring-brand-500',
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
  </button>
);

export default CatalogPage;
