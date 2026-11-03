import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ImageOff, Package, Plus, Store, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Modal } from '@components/ui/Modal';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Switch } from '@components/ui/Switch';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { FormGrid, FormSection, FormStack } from '@components/ui/FormSection';
import { Textarea } from '@components/ui/Textarea';
import { LoadError } from '@components/common/LoadError';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type { ApiSuccess } from '@/types/api';
import {
  catalogAdminApi,
  type AdminProduct,
  type AdminVariant,
  type CatalogMeta,
} from '../services/catalogAdmin.service';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { MediaPicker } from './MediaPicker';
import { cakesApi, type CakeCustomServings, type CakeSizeGuide } from '@features/cakes/cakes.service';
import { PRODUCT_FAMILIES, PREPARATION_MODES, PRESENTATION_UNITS, type ProductFamily, type PreparationMode } from '@features/catalog/pastry';

interface ProductEditorProps {
  product: AdminProduct;
  meta: CatalogMeta;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onToggleStatus?: () => Promise<void>;
  onDeleteDraft?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  archiveChanging?: boolean;
  deleteChanging?: boolean;
  statusChanging?: boolean;
}

/**
 * Permisos que hacen EDITABLE alguno de los bloques de este editor.
 *
 * Vive aqui y no en la pantalla porque es la misma lista que decide si el modal
 * tiene algo que guardar: el boton del catalogo dice "Editar" o "Ver ficha"
 * segun esto, y asi no puede quedarse desfasado de los bloques reales.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const PRODUCT_EDITOR_WRITE_PERMISSIONS = [
  PERM.CATALOG_PRODUCT_WRITE,
  PERM.ALLERGEN_WRITE,
  PERM.CATALOG_AVAILABILITY_WRITE,
  PERM.DIETARY_TAG_WRITE,
];

/** Etiquetas del estado del producto. Las comparte la tarjeta del catalogo. */
// eslint-disable-next-line react-refresh/only-export-components
export const PRODUCT_STATUS_LABEL: Record<AdminProduct['status'], string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Publicado',
  INACTIVE: 'Retirado',
};

interface BranchAvailabilityRow {
  branchId: number;
  isAvailable: boolean;
  unavailableReason: string | null;
}

/* La LECTURA de la disponibilidad por sucursal no esta en `catalogAdmin.service`
   (que solo expone la escritura), y el interruptor necesita saber como esta hoy
   antes de ofrecer cambiarlo. */
const availabilityApi = {
  async list(productId: number): Promise<BranchAvailabilityRow[]> {
    const { data } = await api.get<ApiSuccess<BranchAvailabilityRow[]>>(
      `/admin/catalog/products/${productId}/availability`,
    );
    return data.data;
  },
};

/** Conserva lo tecleado (`mine`) salvo que siga siendo lo que trajo el servidor. */
const keepEdited = <T,>(base: T, mine: T, incoming: T): T => (mine === base ? incoming : mine);

/**
 * F20: guardar UNA presentacion no puede borrar lo tecleado en las otras.
 *
 * `onSaved` recarga el catalogo entero y el producto vuelve con los valores del
 * servidor. Antes se volcaban tal cual sobre el estado local y los cambios de
 * una presentacion podian borrar lo que se habia escrito en las otras. El arbitro del
 * merge es la foto ANTERIOR del servidor: campo que difiere de ella es del
 * usuario y se respeta; el resto se refresca.
 */
const mergeVariants = (
  base: AdminVariant[],
  mine: AdminVariant[],
  incoming: AdminVariant[],
): AdminVariant[] =>
  incoming.map((server) => {
    const local = mine.find((variant) => variant.id === server.id);
    const previous = base.find((variant) => variant.id === server.id);
    // Presentacion que este editor todavia no habia visto: se toma tal cual.
    if (!local || !previous) return server;

    return {
      ...server,
      name: keepEdited(previous.name, local.name, server.name),
      basePrice: keepEdited(previous.basePrice, local.basePrice, server.basePrice),
      servingSize: keepEdited(previous.servingSize, local.servingSize, server.servingSize),
      servingUnit: keepEdited(previous.servingUnit, local.servingUnit, server.servingUnit),
    };
  });

/** Compara dos listas de ids sin depender del orden en que llegaron. */
const sameIds = (left: number[], right: number[]): boolean => {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.every((id, index) => id === b[index]);
};

/**
 * Editor del producto.
 *
 * Cada bloque se muestra segun los permisos; el gestor de catalogo ve los datos
 * y los precios, y la ficha de torta conserva solo la revision de alergenos.
 * Aunque alguien forzara la UI, el backend rechaza lo que no le corresponde.
 *
 * Lo que el rol NO puede escribir se pinta igual, en solo lectura. El auditor y el
 * administrador de sucursal abrian este modal y encontraban el titulo, el slug y
 * NADA debajo: eso no parece un 403, parece la aplicacion rota.
 */
export const ProductEditor = ({ product, meta, onClose, onSaved, onToggleStatus, onDeleteDraft, onArchive, archiveChanging = false, deleteChanging = false, statusChanging = false }: ProductEditorProps) => {
  const { can } = usePermissions();
  const confirm = useConfirm();
  const canEditProduct = can(PERM.CATALOG_PRODUCT_WRITE);
  const canConfigureCake = can(PERM.CATALOG_PRODUCT_WRITE, PERM.CATALOG_CUSTOMIZATION_WRITE);
  const canEditAllergens = can(PERM.ALLERGEN_WRITE);
  const canEditTags = can(PERM.DIETARY_TAG_WRITE);
  const canEditAvailability = can(PERM.CATALOG_AVAILABILITY_WRITE);
  // El producto personalizable puede conservar un perfil de torta antiguo o
  // todavía no tenerlo cargado en el listado. El tipo CUSTOMIZABLE es la fuente
  // de verdad para decidir el flujo del Constructor y sus alérgenos.
  const isCustomCake = product.type === 'CUSTOMIZABLE'
    || product.cakeProfile?.saleMode === 'SEMI_CUSTOM'
    || product.cakeProfile?.saleMode === 'ADVANCED';
  const isCakeProduct = Boolean(product.cakeProfile);
  const canEditAnything =
    canEditProduct || canEditAllergens || canEditAvailability || canEditTags;

  /** Categoria que el servidor da por buena hoy. Sirve de origen del estado sucio. */
  const serverCategoryId = product.category?.id ?? meta.categories[0]?.id ?? 0;

  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? '');
  const [imageAlt, setImageAlt] = useState(product.name);
  const [categoryId, setCategoryId] = useState(serverCategoryId);
  const [family, setFamily] = useState(product.family ?? 'CAKE');
  const [preparationMode, setPreparationMode] = useState(product.preparationMode ?? 'MADE_TO_ORDER');
  const [tagIds, setTagIds] = useState(product.dietaryTags.map((tag) => tag.id));
  const [isFeatured, setIsFeatured] = useState(product.isFeatured);
  const [nameError, setNameError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');

  const [variants, setVariants] = useState(product.variants);
  const [allergensConfirmed, setAllergensConfirmed] = useState(false);
  const [newVariant, setNewVariant] = useState({ name: '', servingSize: '', servingUnit: product.family === 'CAKE' ? 'porciones' : 'unidades', basePrice: '' });
  const [newVariantAttempted, setNewVariantAttempted] = useState(false);
  const [customRule, setCustomRule] = useState<CakeCustomServings | null>(null);
  const activeCakeVariants = [...variants].filter((variant) => variant.isActive && variant.servingUnit === 'porciones' && variant.servingSize).sort((a, b) => Number(a.servingSize) - Number(b.servingSize));
  const editableSizeGuides: CakeSizeGuide[] = activeCakeVariants.map((variant, index) => {
    const saved = customRule?.sizeGuides?.find((guide) => guide.variantId === variant.id);
    return saved ?? {
      variantId: variant.id,
      diameterCm: [14, 18, 28][index] ?? 28 + (index - 2) * 4,
      minServings: [6, 12, 24][index] ?? Math.max(1, Number(activeCakeVariants[index - 1]?.servingSize ?? 0) + 1),
      maxServings: Number(variant.servingSize),
    };
  }).map((guide) => ({ ...guide, maxServings: Number(variants.find((variant) => variant.id === guide.variantId)?.servingSize ?? guide.maxServings) }));
  const sizeGuidesValid = editableSizeGuides.length === variants.filter((variant) => variant.isActive).length
    && editableSizeGuides.every((guide, index) => Number.isFinite(guide.diameterCm) && guide.diameterCm >= 8 && guide.diameterCm <= 80 && Number.isInteger(guide.diameterCm * 2) && Number.isInteger(guide.minServings) && Number.isInteger(guide.maxServings) && guide.minServings >= 1 && guide.minServings <= guide.maxServings && (!index || guide.diameterCm > editableSizeGuides[index - 1].diameterCm && guide.minServings > editableSizeGuides[index - 1].maxServings))
    && (!customRule?.enabled || (editableSizeGuides.length > 0 && customRule.baseVariantId === editableSizeGuides[editableSizeGuides.length - 1].variantId && customRule.minServings === editableSizeGuides[editableSizeGuides.length - 1].maxServings + 1 && customRule.maxServings >= customRule.minServings && customRule.pricePerExtraServing > 0));
  const editSizeGuide = (variantId: number, patch: Partial<CakeSizeGuide>) => setCustomRule((rule) => rule && ({
    ...rule,
    sizeGuides: editableSizeGuides.map((guide) => guide.variantId === variantId ? { ...guide, ...patch } : guide),
  }));

  const [allergenIds, setAllergenIds] = useState<number[]>(
    product.allergens.map((allergen) => allergen.id),
  );

  const [savingBlock, setSavingBlock] = useState<string | null>(null);

  /** Foto anterior del servidor: es el arbitro del merge, no lo que se pinta. */
  const serverVariantsRef = useRef(product.variants);
  const serverAllergenIdsRef = useRef(product.allergens.map((row) => row.id));
  const savedCustomRuleRef = useRef<CakeCustomServings | null>(null);

  useEffect(() => {
    if (product.cakeProfile?.saleMode !== 'SEMI_CUSTOM' || !canEditProduct) return;
    let active = true;
    cakesApi.getCustomServings(product.id).then((rule) => {
      if (!active) return;
      const largest = [...product.variants].filter((row) => row.isActive && row.servingSize).sort((a, b) => Number(b.servingSize) - Number(a.servingSize))[0];
      const normalized = { ...rule, baseVariantId: rule?.baseVariantId ?? largest?.id ?? null };
      savedCustomRuleRef.current = normalized;
      setCustomRule(normalized);
    }).catch((cause) => { if (active) toast.error(getApiErrorMessage(cause)); });
    return () => { active = false; };
  }, [canEditProduct, product.id, product.cakeProfile?.saleMode]);

  useEffect(() => {
    const previous = serverVariantsRef.current;
    serverVariantsRef.current = product.variants;
    setVariants((current) => mergeVariants(previous, current, product.variants));
  }, [product.variants]);

  useEffect(() => {
    const incoming = product.allergens.map((row) => row.id);
    const previous = serverAllergenIdsRef.current;
    serverAllergenIdsRef.current = incoming;
    setAllergenIds((current) => sameIds(current, previous) ? incoming : current);
  }, [product.allergens]);

  /** Hay algo escrito que el servidor todavia no tiene. */
  const isDirty = useMemo(() => {
    if (allergensConfirmed) return true;
    if (customRule && savedCustomRuleRef.current && JSON.stringify(customRule) !== JSON.stringify(savedCustomRuleRef.current)) return true;
    if (
      canEditProduct
      && (name !== product.name
        || description !== (product.description ?? '')
        || imageUrl !== (product.imageUrl ?? '')
        || categoryId !== serverCategoryId
        || family !== (product.family ?? 'CAKE')
        || preparationMode !== (product.preparationMode ?? 'MADE_TO_ORDER')
        || isFeatured !== product.isFeatured
        || newVariant.name.trim() !== ''
        || newVariant.servingSize.trim() !== ''
        || newVariant.basePrice.trim() !== '')
    ) {
      return true;
    }

    const variantEdited = product.variants.some((server) => {
      const local = variants.find((variant) => variant.id === server.id);
      if (!local) return false;
      if (canEditProduct && (local.name !== server.name || local.basePrice !== server.basePrice || local.servingSize !== server.servingSize || local.servingUnit !== server.servingUnit)) {
        return true;
      }
      return false;
    });
    if (variantEdited) return true;
    if (canEditTags && !sameIds(tagIds, product.dietaryTags.map((tag) => tag.id))) return true;

    if (canEditAllergens && !sameIds(allergenIds, product.allergens.map((row) => row.id))) {
      return true;
    }
    return false;
  }, [
    allergenIds,
    allergensConfirmed,
    canEditAllergens,
    canEditProduct,
    canEditTags,
    customRule,
    family,
    preparationMode,
    tagIds,
    categoryId,
    description,
    imageUrl,
    isFeatured,
    name,
    newVariant,
    product,
    serverCategoryId,
    variants,
  ]);

  /**
   * Cerrar NUNCA guarda: cada bloque tiene su propio boton. Sin este aviso, un
   * toque fuera del dialogo se llevaba las tres presentaciones recien tecleadas
   * sin preguntar (por eso el Modal va con `disableBackdropClose`).
   */
  const handleClose = async () => {
    if (savingBlock || statusChanging) return;
    if (!isDirty) return onClose();

    const { confirmed } = await confirm({
      title: 'Salir sin guardar',
      message:
        'Hay cambios escritos que todavía no se han guardado. Cada bloque se guarda con su propio botón: si sales ahora, se pierden.',
      confirmLabel: 'Salir y descartar',
      cancelLabel: 'Seguir editando',
      tone: 'danger',
    });
    if (confirmed) onClose();
  };

  const run = async (block: string, action: () => Promise<void>, message: string) => {
    setSavingBlock(block);
    try {
      await action();
      toast.success(message);
      await onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingBlock(null);
    }
  };

  const patchVariant = (variantId: number, patch: Partial<(typeof variants)[number]>) => {
    setVariants((current) =>
      current.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant)),
    );
  };

  const toggleVariant = async (variant: AdminVariant, next: boolean) => {
    if (!next && product.status === 'ACTIVE' && variants.filter((row) => row.isActive).length <= 1) {
      toast.error('Activa otra presentación o retira el producto antes de desactivar la última.');
      return;
    }
    const { confirmed } = await confirm({
      title: `${next ? 'Activar' : 'Desactivar'} ${variant.name}`,
      message: next
        ? 'Esta presentación podrá elegirse en los canales donde el producto se vende. Si es una torta, completa su receta y datos antes de ofrecerla.'
        : 'Esta presentación dejará de ofrecerse para pedidos nuevos. Las demás presentaciones seguirán disponibles y los pedidos ya registrados no cambian.',
      confirmLabel: next ? 'Activar presentación' : 'Desactivar presentación',
      cancelLabel: 'Volver a la ficha',
      tone: next ? 'default' : 'danger',
    });
    if (!confirmed) return;
    await run(`availability-${variant.id}`, () => catalogAdminApi.updateVariant(variant.id, { isActive: next }), next ? 'Presentación activada' : 'Presentación desactivada');
  };

  const saveVariant = async (variant: AdminVariant, price: number) => {
    const previous = product.variants.find((row) => row.id === variant.id);
    const servingSize = variant.servingSize === null || variant.servingSize === undefined ? null : Number(variant.servingSize);
    if (isCakeProduct && product.status === 'ACTIVE' && variant.isActive && previous && (servingSize !== previous.servingSize || variant.servingUnit !== previous.servingUnit)) {
      toast.error('Desactiva esta presentación antes de cambiar sus porciones. Después actualiza su receta e insumos.');
      return;
    }
    if (product.status === 'ACTIVE' && previous && Number(previous.basePrice) !== price) {
      const { confirmed } = await confirm({
        title: `Cambiar precio de ${variant.name}`,
        message: `El nuevo precio ${formatCurrency(price)} se aplicará a los pedidos nuevos cuando esta presentación esté disponible. Los pedidos existentes conservan su precio. El cambio quedará en la bitácora.`,
        confirmLabel: 'Guardar nuevo precio',
        cancelLabel: 'Revisar precio',
      });
      if (!confirmed) return;
    }
    await run(`variant-${variant.id}`, async () => {
      const normalizedName = variant.name.trim();
      await catalogAdminApi.updateVariant(variant.id, { name: normalizedName, basePrice: price, servingSize, servingUnit: variant.servingUnit ?? 'unidades' });
      patchVariant(variant.id, { name: normalizedName, servingSize });
    }, 'Presentación actualizada');
  };

  /* El admin de sucursal entra aqui a una sola cosa: agotar un plato en SU cocina.
     Si no puede editar la ficha, su interruptor va primero y no detras de dos
     bloques que solo puede mirar. */
  const availabilityBlock = canEditAvailability ? (
    <BranchAvailabilitySection product={product} />
  ) : null;

  return (
    <Modal
      isOpen
      onClose={() => void handleClose()}
      title={product.name}
      description={
        canEditAnything
          ? `Identificador: ${product.slug} · cada bloque se guarda por separado`
          : `Identificador: ${product.slug} · ficha de solo lectura`
      }
      icon={Package}
      eyebrow={canEditAnything ? 'Editor de producto' : 'Ficha de producto'}
      maxWidth="lg"
      disableBackdropClose
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-ink-muted">{isDirty ? 'Hay cambios sin guardar. Guarda cada bloque antes de salir o activar.' : 'Cada bloque se guarda por separado.'}</span>
          <div className="flex flex-wrap gap-2">
            {onToggleStatus && (
              <Button
                variant={product.status === 'ACTIVE' ? 'outline' : 'secondary'}
                disabled={isDirty || savingBlock !== null}
                isLoading={statusChanging}
                onClick={() => void onToggleStatus()}
              >
                {product.status === 'ACTIVE' ? 'Retirar de la venta' : 'Activar producto'}
              </Button>
            )}
            {onDeleteDraft && product.status === 'DRAFT' && (
              <Button
                variant="danger"
                disabled={isDirty || savingBlock !== null || statusChanging}
                isLoading={deleteChanging}
                leftIcon={<Trash2 className="size-4" />}
                onClick={() => void onDeleteDraft()}
              >
                Eliminar borrador
              </Button>
            )}
            {onArchive && product.status === 'INACTIVE' && (
              <Button variant="outline" disabled={isDirty || savingBlock !== null || statusChanging} isLoading={archiveChanging} leftIcon={<Archive className="size-4" />} onClick={() => void onArchive()}>
                Archivar producto
              </Button>
            )}
            <Button variant="outline" disabled={savingBlock !== null || statusChanging} onClick={() => void handleClose()}>Cerrar ficha</Button>
          </div>
        </div>
      }
      headerAside={imageUrl ? (
        <div className="hidden items-center gap-3 rounded-card border border-white/70 bg-white/75 p-1.5 pr-3 shadow-e1 sm:flex">
          <img src={imageUrl} alt="" className="size-14 rounded-field object-cover" />
          <div className="max-w-32"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Imagen seleccionada</p><p className="truncate text-xs font-bold text-ink">{name}</p></div>
        </div>
      ) : undefined}
    >
      <div className="grid min-w-0 gap-7">
        <p className="rounded-card border border-brand-200 bg-brand-50 p-3 text-sm leading-6 text-brand-800">
          {canEditAnything ? 'Edita solo el bloque que necesites y pulsa su botón Guardar. Cerrar la ficha no guarda los cambios. ' : 'Esta ficha es de consulta según tus permisos. '}
          {product.cakeProfile?.isActive ? 'Este producto tiene un reglas de preparación activas; para venderse en la web también debe estar publicado y disponible en la cocina del cliente.' : product.cakeProfile ? 'Las reglas de preparación están inactivas. Actívalo y completa tiempos y receta en Producción antes de publicar esta torta.' : 'Completa las reglas de preparación y la receta para ofrecer este producto en el catálogo.'}
        </p>
        <div className="grid min-w-0 gap-2 rounded-card border border-line bg-surface-muted/40 p-4 text-xs leading-5 text-ink-muted sm:grid-cols-2">
          <p><strong className="block text-sm text-ink">Estado actual: {PRODUCT_STATUS_LABEL[product.status]}</strong>{product.status === 'ACTIVE' ? 'Está habilitado para los canales configurados; la disponibilidad se decide por cocina.' : product.status === 'DRAFT' ? 'Todavía no se ofrece en pedidos nuevos. Completa la ficha y luego actívalo.' : 'Ya no se ofrece en pedidos nuevos; puedes volver a activarlo.'}</p>
          <p><strong className="block text-sm text-ink">Antes de ofrecerlo</strong>Revisa foto, precio y presentaciones. Configura su preparación, tiempos y receta; los alérgenos se calculan desde Inventario y Constructor.</p>
        </div>
        {!product.cakeProfile && product.status === 'DRAFT' && product.variants.length === 1 && canConfigureCake && <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">¿Quieres vender este producto como torta en la web?</p>
          <p className="mt-1">Completa su perfil de producción, receta y tiempos. El asistente conserva este mismo producto y su imagen; después volverás a Catálogo para publicarlo.</p>
          {isDirty ? <p className="mt-2 font-semibold">Guarda los cambios de esta ficha antes de continuar.</p>
            : <Button size="sm" variant="outline" className="mt-3" component={Link} to={`${ROUTES.adminCakes}?producto=${product.id}`}>Completar perfil y receta</Button>}
        </div>}
        {product.cakeProfile && !product.allergensReviewedAt && <div role="status" className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Los alérgenos se calculan desde los insumos de las recetas y las opciones activas. Clasifica los insumos pendientes en Inventario para poder publicar.</p>
          <Link className="mt-2 inline-flex font-bold underline underline-offset-2" to={`${ROUTES.adminInventory}?filter=cake-allergens`}>Ver insumos pendientes en Inventario →</Link>
        </div>}
        {onToggleStatus && isDirty && <p role="status" className="-mt-4 text-xs font-semibold text-accent-700">Para activar o retirar, guarda o descarta primero los cambios pendientes de esta ficha.</p>}
        {!canEditProduct && availabilityBlock}

        {/* --- Datos comerciales (gestor de catalogo) --- */}
        {canEditProduct ? (
          <FormSection
            title="Datos del producto"
            description="Cambia el nombre, la categoría, el texto y la foto de la ficha. Pulsa «Guardar datos» para aplicar este bloque."
            icon={Package}
          >
            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <FormStack className="min-w-0">
                <FormGrid minColumnWidth={180}>
                  <Select label="Familia del producto" value={family} disabled={product.status === 'ACTIVE'} hint={product.status === 'ACTIVE' ? 'Retira el producto antes de cambiar su familia.' : undefined} onChange={(event) => setFamily(event.target.value as ProductFamily)}>{Object.entries(PRODUCT_FAMILIES).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>
                  <Select label="Forma de preparación" value={preparationMode} disabled={product.status === 'ACTIVE'} onChange={(event) => setPreparationMode(event.target.value as PreparationMode)}>{Object.entries(PREPARATION_MODES).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>
                </FormGrid>
                <FormGrid minColumnWidth={240}>
                  <Input
                    label="Nombre"
                    value={name}
                    error={nameError}
                    hint="Entre 3 y 120 caracteres."
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameError('');
                    }}
                  />

                  <Select
                    id="cat"
                    label="Categoría"
                    value={categoryId ? String(categoryId) : ''}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                    hint="Grupo donde se organiza el producto."
                  >
                    {meta.categories.map((category) => (
                      <SelectOption key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectOption>
                    ))}
                  </Select>
                </FormGrid>

                <Textarea
                  label="Descripción para el cliente"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setDescriptionError(''); }}
                  error={descriptionError}
                  hint="Explica qué incluye y qué recibirá el cliente. Hasta 2000 caracteres."
                  rows={2}
                  maxLength={2000}
                />
                <Switch
                  id={`featured-${product.id}`}
                  checked={isFeatured}
                  onChange={setIsFeatured}
                  label="Destacar en el menú"
                  description="Los productos destacados se ordenan antes en el catálogo web de tortas cuando ya son visibles allí."
                />
              </FormStack>

              <div className="min-w-0">
                <MediaPicker
                  label="Imagen del producto"
                  layout="stacked"
                  value={imageUrl}
                  altText={imageAlt}
                  category="products"
                  imagePurpose={product.cakeProfile ? 'cake' : 'product'}
                  subjectName={name}
                  subjectDescription={description}
                  aspect={4 / 3}
                  hint="Formato 4:3, bien iluminada y sin texto."
                  onChange={(image) => {
                    setImageUrl(image.url);
                    setImageAlt(image.altText);
                  }}
                />
              </div>
            </div>
            <p className="pt-3 text-xs leading-5 text-ink-muted">Elegir o subir una imagen la selecciona en este formulario. Para asociarla a la ficha pulsa «Guardar datos»; si sales antes, el producto conserva su foto anterior.</p>

            <div className="pt-5">
              <Button
                size="sm"
                isLoading={savingBlock === 'product'}
                onClick={() => {
                  if (name.trim().length < 3 || name.trim().length > 120) {
                    setNameError('El nombre debe tener entre 3 y 120 caracteres.');
                    return;
                  }
                  if (description.trim().length > 2000) {
                    setDescriptionError('La descripción admite hasta 2000 caracteres.');
                    return;
                  }
                  void run(
                    'product',
                    async () => {
                      const normalizedName = name.trim();
                      const normalizedDescription = description.trim();
                      await catalogAdminApi.updateProduct(product.id, {
                        name: normalizedName,
                        description: normalizedDescription || null,
                        categoryId,
                        family,
                        preparationMode,
                        isFeatured,
                        imageUrl: imageUrl || null,
                      });
                      setName(normalizedName);
                      setDescription(normalizedDescription);
                    },
                    'Producto actualizado',
                  );
                }}
              >
                Guardar datos
              </Button>
            </div>
          </FormSection>
        ) : (
          <FormSection
            title="Ficha del producto"
            description="Solo lectura: el nombre, la categoría y la foto los mantiene el gestor de catálogo."
            icon={Package}
          >
            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
              <Facts
                items={[
                  { label: 'Categoría', value: product.category?.name ?? 'Sin categoría' },
                  { label: 'Estado', value: PRODUCT_STATUS_LABEL[product.status] },
                  { label: 'Destacado', value: product.isFeatured ? 'Sí' : 'No' },
                  {
                    label: 'Tipo',
                    value: product.type === 'CUSTOMIZABLE' ? 'Se arma en el constructor' : 'Sin personalización',
                  },
                  { label: 'Ficha en catálogo web', value: product.status === 'ACTIVE' && product.cakeProfile?.isActive && product.allergensReviewedAt ? <Link className="font-bold text-brand-700 underline" to={ROUTES.cake(product.slug)}>Ver ficha pública →</Link> : `Aún no disponible · ${ROUTES.cake(product.slug)}` },
                  {
                    label: 'Descripción',
                    value: product.description || 'Sin descripción',
                    wide: true,
                  },
                ]}
              />

              <figure className="m-0 overflow-hidden rounded-card border border-line bg-surface-muted">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="aspect-4/3 w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-4/3 flex-col items-center justify-center gap-1.5 text-xs font-semibold text-ink-muted">
                    <ImageOff className="size-7 text-brand-300" />
                    Sin imagen
                  </div>
                )}
              </figure>
            </div>
          </FormSection>
        )}

        {/* --- Precios (solo gestor de catalogo). --- */}
        {canEditProduct ? (
          <FormSection
            title="Presentaciones y precios"
            description={isCakeProduct ? 'Cada presentación define sus porciones, receta e insumos y tiene un precio propio. El cliente solo puede elegir presentaciones activas y publicadas.' : 'Cada tamaño o formato se elige y cobra por separado. Cambiar un precio afecta pedidos nuevos; los anteriores conservan el precio registrado.'}
            icon={Wallet}
          >
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-ink">Presentaciones registradas</h4>
                  <p className="mt-0.5 text-xs text-ink-muted">Cada una tiene su nombre, precio y disponibilidad.</p>
                </div>
                <Badge variant="neutral">{variants.length} {variants.length === 1 ? 'presentación' : 'presentaciones'}</Badge>
              </div>
              {variants.map((variant) => {
                const price = Number(variant.basePrice);
                const servings = variant.servingSize === null || variant.servingSize === undefined ? null : Number(variant.servingSize);
                const servingsValid = !isCakeProduct || (Number.isFinite(servings) && Number(servings) > 0 && Number(servings) <= 100000);
                const isValid = variant.name.trim().length >= 2 && variant.name.trim().length <= 80 && servingsValid && Number.isFinite(price) && price > 0;
                const original = product.variants.find((row) => row.id === variant.id);
                const hasChanges = Boolean(original && (variant.name !== original.name || price !== Number(original.basePrice) || variant.servingSize !== original.servingSize || variant.servingUnit !== original.servingUnit));
                return (
                  <article
                    key={variant.id}
                    className="rounded-card border border-line bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                      <div>
                        <h5 className="text-sm font-bold text-ink">{variant.name || 'Presentación sin nombre'}</h5>
                        <p className="break-all text-xs text-ink-muted">{variant.isDefault ? 'Presentación principal' : 'Presentación adicional'} · SKU {variant.sku}</p>
                      </div>
                      <Badge variant={variant.isActive ? 'brand' : 'neutral'}>{variant.isActive ? 'Activa' : 'Inactiva'}</Badge>
                    </div>

                    <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                      <Input
                        label="Nombre de la presentación"
                        value={variant.name}
                        onChange={(e) => patchVariant(variant.id, { name: e.target.value })}
                        error={
                          variant.name.trim().length < 2 || variant.name.trim().length > 80
                            ? 'Usa entre 2 y 80 caracteres.'
                            : undefined
                        }
                      />
                      {isCakeProduct && <Input
                        label="Contenido de la presentación"
                        type="number"
                        min="0.01"
                        max="100000"
                        step="any"
                        value={variant.servingSize ?? ''}
                        onChange={(e) => patchVariant(variant.id, { servingSize: e.target.value === '' ? null : Number(e.target.value) })}
                        error={!servingsValid ? 'Ingresa una cantidad mayor que cero.' : undefined}
                      />}
                      <Select label="Unidad de presentación" value={variant.servingUnit ?? 'unidades'} onChange={(event) => patchVariant(variant.id, { servingUnit: event.target.value })}>{Object.entries(PRESENTATION_UNITS).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>
                      <Input
                        label="Precio de venta"
                        type="number"
                        step="0.10"
                        min="0"
                        value={variant.basePrice}
                        onChange={(e) => patchVariant(variant.id, { basePrice: Number(e.target.value) })}
                        error={price > 0 && Number.isFinite(price) ? undefined : 'Ingresa un precio mayor que cero.'}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <p className={cn('text-xs', hasChanges ? 'font-semibold text-accent-700' : 'text-ink-muted')}>
                        {hasChanges ? 'Cambios pendientes en esta presentación.' : 'Presentación guardada.'}
                      </p>
                      {hasChanges && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isValid || savingBlock !== null}
                          isLoading={savingBlock === `variant-${variant.id}`}
                          onClick={() => void saveVariant(variant, price)}
                        >
                          Guardar cambios
                        </Button>
                      )}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-field">
                      <Switch
                        id={`variant-active-${variant.id}`}
                        checked={variant.isActive}
                        disabled={savingBlock !== null}
                        label="Ofrecer esta presentación"
                        description={variant.isActive ? 'Se puede elegir en pedidos nuevos cuando el producto esté activo y disponible en la cocina.' : 'No se puede elegir en pedidos nuevos. Actívala cuando esté lista.'}
                        onChange={(next) => void toggleVariant(variant, next)}
                      />
                    </div>
                  </article>
                );
              })}

              <div className="rounded-card border border-brand-200 bg-brand-50/45 p-4">
                <div className="flex items-start gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-field bg-white text-brand-700"><Plus className="size-4" /></span>
                  <div>
                    <h4 className="text-sm font-bold text-ink">Agregar presentación</h4>
                    <p className="mt-0.5 text-xs leading-5 text-ink-muted">Añade una presentación que el cliente podrá elegir. Indica su contenido y unidad: porciones, unidades, cajas o peso.</p>
                  </div>
                </div>
                <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 sm:items-start">
                  <Input
                    label="Nombre"
                    placeholder="Por ejemplo, Grande"
                    value={newVariant.name}
                    error={newVariantAttempted && (newVariant.name.trim().length < 2 || newVariant.name.trim().length > 80) ? 'Usa entre 2 y 80 caracteres.' : undefined}
                    onChange={(e) => setNewVariant((c) => ({ ...c, name: e.target.value }))}
                  />
                  {isCakeProduct && <Input
                    label="Contenido de la presentación"
                    type="number"
                    min="0.01"
                    max="100000"
                    step="any"
                    placeholder="30"
                    value={newVariant.servingSize}
                    error={newVariantAttempted && (!newVariant.servingSize.trim() || !Number.isFinite(Number(newVariant.servingSize)) || Number(newVariant.servingSize) <= 0 || Number(newVariant.servingSize) > 100000) ? 'Ingresa una cantidad mayor que cero.' : undefined}
                    onChange={(e) => setNewVariant((c) => ({ ...c, servingSize: e.target.value }))}
                  />}
                  <Select label="Unidad de presentación" value={newVariant.servingUnit} onChange={(event) => setNewVariant((current) => ({ ...current, servingUnit: event.target.value }))}>{Object.entries(PRESENTATION_UNITS).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>
                  <Input
                    label="Precio de venta"
                    type="number"
                    step="0.10"
                    min="0"
                    placeholder="32.90"
                    value={newVariant.basePrice}
                    error={newVariantAttempted && (!newVariant.basePrice.trim() || !Number.isFinite(Number(newVariant.basePrice)) || Number(newVariant.basePrice) <= 0) ? 'Ingresa un precio mayor que cero.' : undefined}
                    onChange={(e) => setNewVariant((c) => ({ ...c, basePrice: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="sm:mt-2"
                    leftIcon={<Plus className="size-4" />}
                    disabled={savingBlock !== null}
                    isLoading={savingBlock === 'new-variant'}
                    onClick={() => {
                      setNewVariantAttempted(true);
                      const servingSize = Number(newVariant.servingSize);
                      const price = Number(newVariant.basePrice);
                      if (newVariant.name.trim().length < 2 || newVariant.name.trim().length > 80 || (isCakeProduct && (!newVariant.servingSize.trim() || !Number.isFinite(servingSize) || servingSize <= 0 || servingSize > 100000)) || !newVariant.basePrice.trim() || !Number.isFinite(price) || !(price > 0)) return;
                      void run(
                        'new-variant',
                        async () => {
                          await catalogAdminApi.addVariant(product.id, {
                            name: newVariant.name.trim(),
                            basePrice: price,
                            servingSize: isCakeProduct ? servingSize : null,
                            servingUnit: newVariant.servingUnit,
                          });
                          setNewVariant({ name: '', servingSize: '', servingUnit: product.family === 'CAKE' ? 'porciones' : 'unidades', basePrice: '' });
                          setNewVariantAttempted(false);
                        },
                        product.status === 'ACTIVE' && product.cakeProfile?.isActive
                          ? 'Presentación agregada como inactiva. Completa su receta en Producción > Recetas e insumos antes de activarla.'
                          : 'Presentación agregada',
                      );
                    }}
                  >
                    Agregar presentación
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-ink-muted">{isCakeProduct ? 'El precio se fija por presentación. Después de agregarla, configura su receta e insumos antes de ofrecerla.' : 'La nueva presentación quedará disponible para configurar su precio.'}</p>
              </div>
            </div>
          </FormSection>
        ) : (
          <FormSection
            title="Presentaciones y precios"
            description="Solo lectura: el precio de venta lo fija el gestor de catálogo."
            icon={Wallet}
          >
            {product.variants.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Este producto todavía no tiene ninguna presentación, así que no se puede vender.
              </p>
            ) : (
              <ul className="grid gap-2">
                {product.variants.map((variant) => (
                  <li
                    key={variant.id}
                    className="flex items-center justify-between gap-3 rounded-card border border-line px-3.5 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">
                      {variant.name}
                      {isCakeProduct && variant.servingSize && <span className="ml-2 text-xs font-normal text-ink-muted">· {variant.servingSize} {variant.servingUnit ?? 'porciones'}</span>}
                      {!variant.isActive && (
                        <Badge variant="neutral" className="ml-2">
                          Inactiva
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-brand-700">
                      {formatCurrency(variant.basePrice)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        )}

        {product.cakeProfile?.saleMode === 'SEMI_CUSTOM' && customRule && <FormSection title="Tamaños y porciones" description="Define el diámetro y el rendimiento de cada presentación. El cliente verá estos rangos al crear su torta." icon={Wallet}>
          <div className="grid gap-3">
            {editableSizeGuides.map((guide) => {
              const variant = activeCakeVariants.find((row) => row.id === guide.variantId)!;
              return <div key={guide.variantId} className="grid gap-3 rounded-card border border-line bg-surface-muted p-4 sm:grid-cols-[minmax(0,1fr)_130px_150px] sm:items-center">
                <div className="min-w-0"><p className="text-sm font-semibold text-ink">{variant.name}</p><p className="mt-1 text-xs text-ink-muted">Rinde de {guide.minServings || '—'} a {variant.servingSize} porciones · desde {formatCurrency(variant.basePrice)}</p></div>
                <Input label="Diámetro (cm)" type="number" min="8" max="80" step="0.5" value={guide.diameterCm || ''} onChange={(event) => editSizeGuide(guide.variantId, { diameterCm: Number(event.target.value) })} disabled={!canEditProduct} />
                <Input label="Desde (porciones)" type="number" min="1" max={Number(variant.servingSize)} step="1" value={guide.minServings || ''} onChange={(event) => editSizeGuide(guide.variantId, { minServings: Number(event.target.value) })} disabled={!canEditProduct} />
              </div>;
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-muted">El máximo de cada rango sigue el rendimiento de su presentación. Revisa el precio y la receta de cada tamaño antes de publicarlo. Los rangos deben crecer sin superponerse.</p>
          {!sizeGuidesValid && <p role="alert" className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Revisa los rangos: cada mínimo debe caber en su presentación, los diámetros deben crecer y las porciones adicionales deben comenzar después de la mayor con una tarifa positiva.</p>}
          <div className="mt-5 border-t border-line pt-4"><h4 className="text-sm font-semibold text-ink">Porciones adicionales</h4><p className="mt-1 text-xs leading-5 text-ink-muted">Para más de {editableSizeGuides.at(-1)?.maxServings ?? 'la presentación mayor'} porciones, el cliente indica el número exacto. El precio, la receta y el consumo se escalan desde la presentación mayor.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Presentación base" value={String(customRule.baseVariantId ?? '')} onChange={(event) => setCustomRule((rule) => { if (!rule) return rule; const variant = variants.find((row) => row.id === Number(event.target.value)); const minServings = Math.max(rule.minServings, Number(variant?.servingSize ?? 0) + 1); return { ...rule, baseVariantId: Number(event.target.value), minServings, maxServings: Math.max(rule.maxServings, minServings) }; })} disabled={!canEditProduct}>
              {variants.filter((variant) => variant.isActive && variant.servingSize).map((variant) => <SelectOption key={variant.id} value={String(variant.id)}>{variant.name} · {variant.servingSize} porciones</SelectOption>)}
            </Select>
            <Input label="Precio por cada porción adicional (S/)" type="number" min="0.01" step="0.01" value={customRule.pricePerExtraServing} onChange={(event) => setCustomRule((rule) => rule && ({ ...rule, pricePerExtraServing: Number(event.target.value) }))} disabled={!canEditProduct} />
            <Input label="Desde (porciones)" type="number" min="2" max="500" value={customRule.minServings} onChange={(event) => setCustomRule((rule) => rule && ({ ...rule, minServings: Number(event.target.value) }))} disabled={!canEditProduct} />
            <Input label="Máximo de porciones" hint="No aparece en la tarjeta. Si el cliente supera este valor, verá un aviso y deberá corregir la cantidad." type="number" min="2" max="500" value={customRule.maxServings} onChange={(event) => setCustomRule((rule) => rule && ({ ...rule, maxServings: Number(event.target.value) }))} disabled={!canEditProduct} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={customRule.enabled} onChange={(event) => setCustomRule((rule) => rule && ({ ...rule, enabled: event.target.checked }))} disabled={!canEditProduct} />Ofrecer porciones personalizadas con precio automático</label>
          <p className="mt-2 text-xs text-ink-muted">Precio base + porciones adicionales × tarifa. La opción «Más porciones» no muestra el rango; el máximo configurado se comprueba al ingresar la cantidad.</p>
          {canEditProduct && <Button className="mt-4" disabled={!customRule.baseVariantId || !sizeGuidesValid || savingBlock === 'custom-servings'} isLoading={savingBlock === 'custom-servings'} onClick={async () => {
            if (!customRule.baseVariantId) return;
            setSavingBlock('custom-servings');
            try { const updated = await cakesApi.updateCustomServings(product.id, { ...customRule, baseVariantId: customRule.baseVariantId, sizeGuides: editableSizeGuides }); savedCustomRuleRef.current = updated.customServingsJson; setCustomRule(updated.customServingsJson); toast.success('Tamaños y porciones guardados'); await onSaved(); }
            catch (cause) { toast.error(getApiErrorMessage(cause)); }
            finally { setSavingBlock(null); }
          }}>Guardar tamaños y porciones</Button>}
        </FormSection>}

        {product.cakeProfile && <FormSection title="Receta, personalización y plazos" description="Configura las opciones que admite este producto, su anticipación y la receta de cada presentación." icon={Package}>
          <p className="text-sm text-ink-muted">{product.preparationMode === 'READY_STOCK' ? 'Conecta la receta con artículos clasificados como Producto terminado en Inventario. El pedido reserva y descuenta esas existencias.' : `Anticipación actual: ${product.cakeProfile.minLeadHours} horas. La fecha ofrecida también depende de la capacidad de producción.`}</p>
          {can(PERM.CATALOG_CUSTOMIZATION_WRITE) && <Button component={Link} to={`${ROUTES.adminCakes}?producto=${product.id}`} variant="outline" className="mt-4">Configurar receta y preparación</Button>}
          {isCustomCake && can(PERM.CATALOG_CUSTOMIZATION_WRITE) && <Button component={Link} to={`${ROUTES.adminBuilder}?productId=${product.id}`} variant="outline" className="ml-2 mt-4">Abrir Constructor</Button>}
        </FormSection>}

        <FormSection title="Características del producto" description="Se usan para filtrar el catálogo. Asigna «Sin azúcar» solamente cuando corresponda a la receta revisada." icon={Package}>
          {canEditTags ? <>
            <ToggleChips options={meta.dietaryTags} selected={tagIds} tone="brand" onToggle={(id) => setTagIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])} />
            {!product.allergensReviewedAt && <p className="mt-3 text-xs text-ink-muted">Completa la receta y clasifica sus insumos antes de asignar características.</p>}
            <Button className="mt-4" size="sm" disabled={savingBlock !== null || (!product.allergensReviewedAt && tagIds.length > 0)} isLoading={savingBlock === 'tags'} onClick={() => void run('tags', () => catalogAdminApi.setDietaryTags(product.id, tagIds), 'Características guardadas')}>Guardar características</Button>
          </> : <StaticChips items={product.dietaryTags} tone="brand" empty="Sin características asignadas." />}
        </FormSection>

        {canEditProduct && availabilityBlock}

        {/* --- Alergenos --- */}
        {!isCakeProduct && (canEditAllergens ? (
          <FormSection
            id="product-allergens"
            title={isCustomCake ? 'Revisión de alérgenos del constructor' : 'Alérgenos de esta torta'}
            description={isCustomCake ? 'El sistema consolida los alérgenos declarados en las opciones activas. Aquí revisas la receta base y confirmas el resultado antes de publicar.' : 'Declara los alérgenos que pueden aparecer en la receta antes de ofrecer la torta.'}
            icon={TriangleAlert}
          >
            {isCustomCake && <div className="mb-4 rounded-card border border-brand-200 bg-brand-50/55 p-3 text-sm leading-5 text-brand-900">
              <p className="font-bold">Cómo se construye la lista</p>
              <p className="mt-1">Las opciones activas del Constructor suman automáticamente sus alérgenos cuando guardes. Marca aquí los que corresponden a la receta base y considera siempre el contacto cruzado.</p>
              <Link className="mt-2 inline-flex font-bold text-brand-800 underline underline-offset-2" to={`${ROUTES.adminBuilder}?productId=${product.id}`}>Revisar opciones en Constructor →</Link>
            </div>}
            <p className="mb-3 text-xs leading-5 text-ink-muted">{isCustomCake ? 'Si cambias la receta o una opción, la revisión vuelve a quedar pendiente. Una selección vacía no significa ausencia de contacto cruzado.' : 'Incluye los alérgenos presentes en la receta. Una selección vacía no significa ausencia de contacto cruzado.'}</p>
            <p className="mb-3 text-xs font-semibold text-ink">{product.allergensReviewedAt ? 'Revisión confirmada' : isCustomCake ? 'Pendiente de confirmación' : 'Pendiente de revisión'}</p>
            {meta.allergens.length === 0 && <div role="status" className="mb-4 rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Faltan las opciones básicas de alérgenos.</p>
              <p className="mt-1">Cárgalas para poder revisar la receta. Esta acción no marca ningún alérgeno en el producto.</p>
              <Button size="sm" variant="outline" className="mt-3" isLoading={savingBlock === 'allergens-setup'} disabled={savingBlock !== null} onClick={() => void run('allergens-setup', async () => { await catalogAdminApi.initializeAllergens(); }, 'Opciones de alérgenos cargadas. Revisa la receta y guarda tu selección.')}>Cargar opciones básicas</Button>
            </div>}
            {meta.allergens.length > 0 && <>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{isCustomCake ? 'Alérgenos de la receta base · las opciones se agregan automáticamente' : 'Alérgenos declarados'}</p>
              <ToggleChips
                options={meta.allergens}
                selected={allergenIds}
                tone="danger"
                onToggle={(id) => {
                  setAllergensConfirmed(false);
                  setAllergenIds((current) =>
                    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                  );
                }}
              />
            </>}

            {meta.allergens.length > 0 && <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-muted">
              <input type="checkbox" checked={allergensConfirmed} onChange={(event) => setAllergensConfirmed(event.target.checked)} className="mt-1 accent-brand-700" />
              {isCustomCake ? 'Confirmo que revisé la receta base y las opciones activas; la selección incluye los alérgenos posibles en cualquier configuración.' : 'Confirmo que revisé la receta y que la selección incluye los alérgenos presentes.'}
            </label>}
            {meta.allergens.length > 0 && <p className="mt-2 text-xs text-ink-muted">Si ninguno de la lista aplica, déjalos sin marcar, confirma y guarda. No declares ausencia de contacto cruzado.</p>}
            <div className="pt-4">
              <Button
                size="sm"
                disabled={meta.allergens.length === 0 || !allergensConfirmed}
                isLoading={savingBlock === 'allergens'}
                onClick={() =>
                  run(
                    'allergens',
                    async () => { await catalogAdminApi.setAllergens(product.id, allergenIds); setAllergensConfirmed(false); },
                    isCustomCake ? 'Alérgenos de receta y opciones consolidados' : 'Alérgenos revisados y guardados',
                  )
                }
              >
                {isCustomCake ? 'Confirmar revisión y guardar' : 'Guardar alérgenos'}
              </Button>
            </div>
          </FormSection>
        ) : (
          <FormSection
            id="product-allergens"
            title={isCustomCake ? 'Alérgenos consolidados de la torta' : 'Alérgenos declarados de esta torta'}
            description={isCustomCake ? 'Solo lectura: resultado consolidado de la receta y de las opciones activas del Constructor.' : 'Solo lectura: alérgenos declarados tras revisar la receta.'}
            icon={TriangleAlert}
          >
            {meta.allergens.length === 0 && !product.allergensReviewedAt && <p className="mb-3 rounded-card bg-amber-50 p-3 text-sm text-amber-900">Faltan las opciones de alérgenos. Pide a una persona con permiso para revisarlos que cargue las opciones básicas en esta ficha.</p>}
            <StaticChips
              items={product.allergens}
              tone="danger"
              empty={product.allergensReviewedAt ? 'Revisión confirmada sin alérgenos de esta lista.' : 'Pendiente de revisión.'}
            />
          </FormSection>
        ))}

      </div>
    </Modal>
  );
};

/**
 * DISPONIBILIDAD POR SUCURSAL (RN-005)
 * ---------------------------------------------------------------------------
 * `catalog.availability.write` existia en el backend con endpoint, notificacion
 * de reposicion y todo, y era el UNICO permiso de escritura de catalogo del
 * administrador de sucursal... sin una sola pantalla desde donde ejercerlo.
 *
 * Vive en su propio componente para que `useActiveBranch` (que pide las cocinas
 * al servidor) no se monte para quien no tiene el permiso.
 */
const BranchAvailabilitySection = ({ product }: { product: AdminProduct }) => {
  const confirm = useConfirm();
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } =
    useActiveBranch();

  const [rows, setRows] = useState<BranchAvailabilityRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await availabilityApi.list(product.id));
      setLoadError(null);
    } catch (error) {
      setRows(null);
      setLoadError(getApiErrorMessage(error));
    }
  }, [product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? 'esta cocina';
  const current = rows?.find((row) => row.branchId === branchId);
  // Sin fila, disponible: el estado por defecto es que el plato SI se vende.
  const isAvailable = current ? current.isAvailable : true;

  const toggle = async (next: boolean) => {
    if (!branchId) return;

    let reason = '';
    if (!next) {
      const result = await confirm({
        title: `Agotar ${product.name} en ${branchName}`,
        message:
          'En el menú de esa cocina seguirá visible como «Temporalmente no disponible» y no se podrá comprar hasta que lo repongas. El resto de locales no cambia.',
        confirmLabel: 'Marcar como agotado',
        tone: 'danger',
        reasonLabel: 'Motivo (queda en la bitácora)',
        reasonRequired: true,
        reasonMinLength: 3,
        reasonMaxLength: 255,
        reasonHint: 'Explica por qué esta cocina no puede ofrecerlo; será visible para el siguiente turno.',
      });
      if (!result.confirmed) return;
      reason = result.reason;
    }

    setIsSaving(true);
    try {
      await catalogAdminApi.setAvailability(product.id, branchId, next, reason || undefined);
      toast.success(
        next
          ? `Disponible otra vez en ${branchName}. Avisamos a quien pidió alerta de reposición.`
          : `Marcado como agotado en ${branchName}`,
      );
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormSection
      title="Disponibilidad por cocina"
      description="Usa este control cuando una cocina no puede vender el producto. El cambio se guarda en cuanto lo confirmas y solo afecta a esa cocina."
      icon={Store}
    >
      <p className="mb-3 text-xs leading-5 text-ink-muted">Marca «agotado» para bloquear pedidos nuevos allí; el cliente lo seguirá viendo como no disponible. Vuelve a activar el interruptor cuando puedas venderlo. Esto no modifica las cantidades de insumos en Inventario.</p>
      {branchesError ? (
        <LoadError
          title="No pudimos cargar las cocinas"
          message={branchesError}
          onRetry={() => void reloadBranches()}
        />
      ) : loadError ? (
        <LoadError
          title="No pudimos consultar la disponibilidad"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : isLoadingBranches || rows === null ? (
        <p className="py-4 text-center text-sm text-ink-muted">Consultando cocinas…</p>
      ) : branches.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">
          No tienes ninguna cocina asignada, así que no hay disponibilidad que ajustar.
        </p>
      ) : (
        <div className="grid min-w-0 gap-3">
          {/* Con una sola cocina asignada el desplegable sobra: ya se nombra en el
              interruptor. Con varias, es la unica forma de saber sobre cual se opera. */}
          {branches.length > 1 && (
            <Select
              id="availability-branch"
              label="Cocina"
              value={branchId ? String(branchId) : ''}
              onChange={(event) => setBranchId(Number(event.target.value))}
            >
              {branches.map((branch) => (
                <SelectOption key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectOption>
              ))}
            </Select>
          )}

          <Switch
            id="availability-switch"
            checked={isAvailable}
            disabled={isSaving || !branchId}
            label={`Disponible en ${branchName}`}
            description={
              isAvailable
                ? 'Podrá comprarse aquí cuando el producto esté publicado.'
                : `No se puede comprar en esta cocina${current?.unavailableReason ? `: ${current.unavailableReason}` : ''}`
            }
            onChange={(next) => void toggle(next)}
          />
        </div>
      )}
    </FormSection>
  );
};

/**
 * Multiseleccion por chips. Alergenos y etiquetas son la misma interaccion con
 * distinto color; tenerla dos veces significaba que un arreglo de accesibilidad
 * habia que hacerlo dos veces y solo se hacia en una.
 */
const ToggleChips = ({
  options,
  selected,
  tone,
  onToggle,
}: {
  options: Array<{ id: number; name: string }>;
  selected: number[];
  tone: 'danger' | 'brand';
  onToggle: (id: number) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.length === 0 && <p className="text-sm text-ink-muted">Todavía no hay opciones configuradas para seleccionar.</p>}
    {options.map((option) => {
      const active = selected.includes(option.id);
      return (
        <button
          key={option.id}
          type="button"
          aria-pressed={active}
          onClick={() => onToggle(option.id)}
          className={cn(
            'min-h-9 rounded-pill border px-3 text-xs font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2',
            active
              ? tone === 'danger'
                ? 'border-red-500 bg-red-500 text-white focus-visible:outline-red-600'
                : 'border-brand-600 bg-brand-600 text-white focus-visible:outline-brand-700'
              : tone === 'danger'
                ? 'border-line text-ink-muted hover:border-red-300 hover:text-red-700 focus-visible:outline-red-600'
                : 'border-line text-ink-muted hover:border-brand-300 hover:text-brand-700 focus-visible:outline-brand-700',
          )}
        >
          {option.name}
        </button>
      );
    })}
  </div>
);

/**
 * Lo mismo que `ToggleChips` pero sin interaccion: en solo lectura solo importa
 * lo que el producto TIENE, no la lista completa de opciones posibles.
 */
const StaticChips = ({
  items,
  tone,
  empty,
}: {
  items: Array<{ id: number; name: string }>;
  tone: 'danger' | 'brand';
  empty: string;
}) =>
  items.length === 0 ? (
    <p className="text-sm text-ink-muted">{empty}</p>
  ) : (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Badge variant={tone === 'danger' ? 'danger' : 'brand'} className="px-3 py-1">
            {item.name}
          </Badge>
        </li>
      ))}
    </ul>
  );

/** Pares etiqueta/valor de la ficha de solo lectura. */
const Facts = ({
  items,
  columns = 2,
}: {
  items: Array<{ label: string; value: ReactNode; wide?: boolean }>;
  columns?: 2 | 3;
}) => (
  <dl className={cn('grid min-w-0 gap-2.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
    {items.map((item) => (
      <div
        key={item.label}
        className={cn(
          'rounded-card border border-line bg-surface-muted/40 px-3.5 py-2.5',
          item.wide && (columns === 3 ? 'sm:col-span-3' : 'sm:col-span-2'),
        )}
      >
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {item.label}
        </dt>
        <dd className="mt-0.5 text-sm font-semibold text-ink">{item.value}</dd>
      </div>
    ))}
  </dl>
);
