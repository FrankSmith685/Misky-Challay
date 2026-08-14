import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Flame, ImageOff, Package, Plus, Store, Tag, TriangleAlert, Wallet } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Modal } from '@components/ui/Modal';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Switch } from '@components/ui/Switch';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { FormGrid, FormSection, FormStack } from '@components/ui/FormSection';
import { LoadError } from '@components/common/LoadError';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCalories, formatCurrency, formatMacro } from '@lib/format';
import { cn } from '@lib/cn';
import type { ApiSuccess } from '@/types/api';
import {
  catalogAdminApi,
  type AdminNutrition,
  type AdminProduct,
  type AdminVariant,
  type CatalogMeta,
} from '../services/catalogAdmin.service';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { MediaPicker } from './MediaPicker';

interface ProductEditorProps {
  product: AdminProduct;
  meta: CatalogMeta;
  onClose: () => void;
  onSaved: () => void;
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
  PERM.NUTRITION_WRITE,
  PERM.ALLERGEN_WRITE,
  PERM.DIETARY_TAG_WRITE,
  PERM.CATALOG_AVAILABILITY_WRITE,
];

/** Etiquetas del estado del producto. Las comparte la tarjeta del catalogo. */
// eslint-disable-next-line react-refresh/only-export-components
export const PRODUCT_STATUS_LABEL: Record<AdminProduct['status'], string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Publicado',
  INACTIVE: 'Retirado',
};

const NUTRITION_FIELDS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium'] as const;

const EMPTY_NUTRITION: AdminNutrition = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
};

/**
 * Campos del bloque de nutricion con su tope, el mismo que valida la ruta.
 *
 * Fibra y sodio llevaban desde el principio validados en el endpoint y
 * preservados por el servicio, pero no tenian donde escribirse: nacian en 0 y
 * ahi se quedaban. Duplicar el maximo aqui evita mandar un 422 a buscar.
 */
const NUTRITION_INPUTS: Array<[(typeof NUTRITION_FIELDS)[number], string, number]> = [
  ['calories', 'Calorías (kcal)', 5000],
  ['protein', 'Proteína (g)', 500],
  ['carbs', 'Carbohidratos (g)', 500],
  ['fat', 'Grasas (g)', 500],
  ['fiber', 'Fibra (g)', 200],
  ['sodium', 'Sodio (mg)', 10000],
];

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

const mergeNutrition = (
  base: AdminNutrition | null,
  mine: AdminNutrition | null,
  incoming: AdminNutrition | null,
): AdminNutrition | null => {
  if (!mine) return incoming;
  if (!base) return mine;

  const merged = { ...(incoming ?? mine) };
  NUTRITION_FIELDS.forEach((field) => {
    merged[field] = keepEdited(base[field], mine[field], incoming?.[field] ?? mine[field]);
  });
  return merged;
};

/**
 * F20: guardar UNA presentacion no puede borrar lo tecleado en las otras.
 *
 * `onSaved` recarga el catalogo entero y el producto vuelve con los valores del
 * servidor. Antes se volcaban tal cual sobre el estado local, asi que el
 * nutricionista rellenaba las tres presentaciones, guardaba la primera y veia
 * las otras dos volver a cero con un toast verde en pantalla. El arbitro del
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
      nutrition: mergeNutrition(previous.nutrition, local.nutrition, server.nutrition),
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
 * Cada bloque se muestra segun los permisos: el nutricionista solo ve "Nutricion",
 * "Alergenos" y "Etiquetas"; el gestor de catalogo ve los datos y los precios.
 * Aunque alguien forzara la UI, el backend rechaza lo que no le corresponde.
 *
 * Lo que el rol NO puede escribir se pinta igual, en solo lectura. El auditor y el
 * administrador de sucursal abrian este modal y encontraban el titulo, el slug y
 * NADA debajo: eso no parece un 403, parece la aplicacion rota.
 */
export const ProductEditor = ({ product, meta, onClose, onSaved }: ProductEditorProps) => {
  const { can } = usePermissions();
  const confirm = useConfirm();
  const canEditProduct = can(PERM.CATALOG_PRODUCT_WRITE);
  const canEditNutrition = can(PERM.NUTRITION_WRITE);
  const canEditTags = can(PERM.DIETARY_TAG_WRITE);
  const canEditAllergens = can(PERM.ALLERGEN_WRITE);
  const canEditAvailability = can(PERM.CATALOG_AVAILABILITY_WRITE);
  const canEditAnything =
    canEditProduct || canEditNutrition || canEditTags || canEditAllergens || canEditAvailability;

  /** Categoria que el servidor da por buena hoy. Sirve de origen del estado sucio. */
  const serverCategoryId = product.category?.id ?? meta.categories[0]?.id ?? 0;

  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? '');
  const [imageAlt, setImageAlt] = useState(product.name);
  const [categoryId, setCategoryId] = useState(serverCategoryId);
  const [nameError, setNameError] = useState('');

  const [variants, setVariants] = useState(product.variants);
  const [newVariant, setNewVariant] = useState({ name: '', basePrice: '' });

  const [allergenIds, setAllergenIds] = useState<number[]>(
    product.allergens.map((allergen) => allergen.id),
  );
  const [tagIds, setTagIds] = useState<number[]>(product.dietaryTags.map((tag) => tag.id));

  const [savingBlock, setSavingBlock] = useState<string | null>(null);

  /** Foto anterior del servidor: es el arbitro del merge, no lo que se pinta. */
  const serverVariantsRef = useRef(product.variants);

  useEffect(() => {
    const previous = serverVariantsRef.current;
    serverVariantsRef.current = product.variants;
    setVariants((current) => mergeVariants(previous, current, product.variants));
  }, [product.variants]);

  /** Hay algo escrito que el servidor todavia no tiene. */
  const isDirty = useMemo(() => {
    if (
      canEditProduct
      && (name !== product.name
        || description !== (product.description ?? '')
        || imageUrl !== (product.imageUrl ?? '')
        || categoryId !== serverCategoryId
        || newVariant.name.trim() !== ''
        || newVariant.basePrice.trim() !== '')
    ) {
      return true;
    }

    const variantEdited = product.variants.some((server) => {
      const local = variants.find((variant) => variant.id === server.id);
      if (!local) return false;
      if (canEditProduct && (local.name !== server.name || local.basePrice !== server.basePrice)) {
        return true;
      }
      return (
        canEditNutrition
        && NUTRITION_FIELDS.some(
          (field) => (local.nutrition?.[field] ?? 0) !== (server.nutrition?.[field] ?? 0),
        )
      );
    });
    if (variantEdited) return true;

    if (canEditAllergens && !sameIds(allergenIds, product.allergens.map((row) => row.id))) {
      return true;
    }
    return canEditTags && !sameIds(tagIds, product.dietaryTags.map((row) => row.id));
  }, [
    allergenIds,
    canEditAllergens,
    canEditNutrition,
    canEditProduct,
    canEditTags,
    categoryId,
    description,
    imageUrl,
    name,
    newVariant,
    product,
    serverCategoryId,
    tagIds,
    variants,
  ]);

  /**
   * Cerrar NUNCA guarda: cada bloque tiene su propio boton. Sin este aviso, un
   * toque fuera del dialogo se llevaba las tres presentaciones recien tecleadas
   * sin preguntar (por eso el Modal va con `disableBackdropClose`).
   */
  const handleClose = async () => {
    if (savingBlock) return;
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
      onSaved();
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

  const patchNutrition = (
    variantId: number,
    field: (typeof NUTRITION_FIELDS)[number],
    value: number,
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? { ...variant, nutrition: { ...EMPTY_NUTRITION, ...variant.nutrition, [field]: value } }
          : variant,
      ),
    );
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
          ? `/${product.slug} · cada bloque se guarda por separado`
          : `/${product.slug} · ficha de solo lectura`
      }
      icon={Package}
      eyebrow={canEditAnything ? 'Editor de producto' : 'Ficha de producto'}
      maxWidth="lg"
      disableBackdropClose
      headerAside={imageUrl ? (
        <div className="hidden items-center gap-3 rounded-card border border-white/70 bg-white/75 p-1.5 pr-3 shadow-e1 sm:flex">
          <img src={imageUrl} alt="" className="size-14 rounded-field object-cover" />
          <div className="max-w-32"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Vista en menú</p><p className="truncate text-xs font-bold text-ink">{name}</p></div>
        </div>
      ) : undefined}
    >
      <div className="grid gap-7">
        {!canEditProduct && availabilityBlock}

        {/* --- Datos comerciales (gestor de catalogo) --- */}
        {canEditProduct ? (
          <FormSection
            title="Datos del producto"
            description="Nombre, categoría y foto: es lo que el cliente ve en el menú."
            icon={Package}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <FormStack>
                <Input
                  label="Nombre"
                  value={name}
                  error={nameError}
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
                >
                  {meta.categories.map((category) => (
                    <SelectOption key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectOption>
                  ))}
                </Select>

                <Input
                  label="Descripción"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  hint="Una línea que explique la preparación."
                />
              </FormStack>

              <MediaPicker
                label="Imagen del producto"
                value={imageUrl}
                altText={imageAlt}
                category="products"
                aspect={4 / 3}
                hint="Formato 4:3, bien iluminada y sin texto."
                onChange={(image) => {
                  setImageUrl(image.url);
                  setImageAlt(image.altText);
                }}
              />
            </div>

            <div className="pt-5">
              <Button
                size="sm"
                isLoading={savingBlock === 'product'}
                onClick={() => {
                  if (name.trim().length < 3) {
                    setNameError('El nombre necesita al menos 3 caracteres.');
                    return;
                  }
                  void run(
                    'product',
                    () =>
                      catalogAdminApi.updateProduct(product.id, {
                        name: name.trim(),
                        description: description.trim() || null,
                        categoryId,
                        imageUrl: imageUrl || null,
                      }),
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
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
              <Facts
                items={[
                  { label: 'Categoría', value: product.category?.name ?? 'Sin categoría' },
                  { label: 'Estado', value: PRODUCT_STATUS_LABEL[product.status] },
                  {
                    label: 'Tipo',
                    value: product.type === 'CUSTOMIZABLE' ? 'Se arma en el constructor' : 'Plato fijo',
                  },
                  { label: 'Enlace público', value: `/${product.slug}` },
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

        {/* --- Precios (gestor de catalogo). El nutricionista NO ve este bloque. --- */}
        {canEditProduct ? (
          <FormSection
            title="Presentaciones y precios"
            description="Cada cambio de precio queda registrado con tu nombre en la bitácora."
            icon={Wallet}
          >
            <div className="grid gap-3">
              {variants.map((variant) => {
                const price = Number(variant.basePrice);
                const isValid = variant.name.trim().length >= 2 && price > 0;
                return (
                  <div
                    key={variant.id}
                    className="grid items-end gap-3 rounded-card border border-line p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
                  >
                    <Input
                      label="Nombre"
                      value={variant.name}
                      onChange={(e) => patchVariant(variant.id, { name: e.target.value })}
                      error={
                        variant.name.trim().length >= 2 ? undefined : 'Mínimo 2 caracteres.'
                      }
                    />
                    <Input
                      label="Precio"
                      type="number"
                      step="0.10"
                      min="0"
                      value={variant.basePrice}
                      onChange={(e) => patchVariant(variant.id, { basePrice: Number(e.target.value) })}
                      error={price > 0 ? undefined : 'Mayor que cero.'}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isValid}
                      isLoading={savingBlock === `variant-${variant.id}`}
                      onClick={() =>
                        run(
                          `variant-${variant.id}`,
                          () =>
                            catalogAdminApi.updateVariant(variant.id, {
                              name: variant.name.trim(),
                              basePrice: price,
                            }),
                          `Precio actualizado a ${formatCurrency(price)}`,
                        )
                      }
                    >
                      Guardar
                    </Button>
                  </div>
                );
              })}

              <div className="grid items-end gap-3 rounded-card border border-dashed border-line bg-surface-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                <Input
                  label="Nueva presentación"
                  placeholder="Grande"
                  value={newVariant.name}
                  onChange={(e) => setNewVariant((c) => ({ ...c, name: e.target.value }))}
                />
                <Input
                  label="Precio"
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder="32.90"
                  value={newVariant.basePrice}
                  onChange={(e) => setNewVariant((c) => ({ ...c, basePrice: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus className="size-4" />}
                  isLoading={savingBlock === 'new-variant'}
                  onClick={() => {
                    const price = Number(newVariant.basePrice);
                    if (newVariant.name.trim().length < 2 || !(price > 0)) {
                      toast.error('Completa el nombre y un precio mayor que cero');
                      return;
                    }
                    void run(
                      'new-variant',
                      async () => {
                        await catalogAdminApi.addVariant(product.id, {
                          name: newVariant.name.trim(),
                          basePrice: price,
                        });
                        setNewVariant({ name: '', basePrice: '' });
                      },
                      'Presentación agregada',
                    );
                  }}
                >
                  Agregar
                </Button>
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

        {canEditProduct && availabilityBlock}

        {/* --- Nutricion (el nutricionista) --- */}
        {canEditNutrition ? (
          <FormSection
            title="Información nutricional"
            description="Por presentación. Es lo que ve el cliente en la ficha y lo que suman los bowls."
            icon={Flame}
          >
            <div className="grid gap-3">
              {variants.map((variant) => {
                const nutrition = { ...EMPTY_NUTRITION, ...variant.nutrition };
                const outOfRange = NUTRITION_INPUTS.some(
                  ([field, , max]) => nutrition[field] < 0 || nutrition[field] > max,
                );

                return (
                  <div key={variant.id} className="rounded-card border border-line p-3.5">
                    <p className="mb-3 text-sm font-bold text-ink">{variant.name}</p>

                    <FormGrid minColumnWidth={140}>
                      {NUTRITION_INPUTS.map(([field, label, max]) => {
                        const value = nutrition[field];
                        return (
                          <Input
                            key={field}
                            label={label}
                            type="number"
                            step="0.1"
                            min="0"
                            max={max}
                            value={value}
                            error={
                              value < 0
                                ? 'No puede ser negativo.'
                                : value > max
                                  ? `El máximo es ${max}.`
                                  : undefined
                            }
                            onChange={(e) => patchNutrition(variant.id, field, Number(e.target.value))}
                          />
                        );
                      })}
                    </FormGrid>

                    <div className="pt-3">
                      <Button
                        size="sm"
                        disabled={outOfRange}
                        isLoading={savingBlock === `nutrition-${variant.id}`}
                        onClick={() =>
                          run(
                            `nutrition-${variant.id}`,
                            () => catalogAdminApi.updateNutrition(variant.id, nutrition),
                            'Nutrición actualizada',
                          )
                        }
                      >
                        Guardar nutrición
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </FormSection>
        ) : (
          <FormSection
            title="Información nutricional"
            description="Solo lectura: la mantiene el nutricionista. Es lo que el cliente ve en la ficha."
            icon={Flame}
          >
            <div className="grid gap-3">
              {product.variants.map((variant) => (
                <div key={variant.id} className="rounded-card border border-line p-3.5">
                  <p className="mb-3 text-sm font-bold text-ink">{variant.name}</p>
                  {variant.nutrition ? (
                    <Facts
                      items={[
                        { label: 'Calorías', value: formatCalories(variant.nutrition.calories) },
                        { label: 'Proteína', value: formatMacro(variant.nutrition.protein) },
                        { label: 'Carbohidratos', value: formatMacro(variant.nutrition.carbs) },
                        { label: 'Grasas', value: formatMacro(variant.nutrition.fat) },
                        { label: 'Fibra', value: formatMacro(variant.nutrition.fiber) },
                        { label: 'Sodio', value: `${Math.round(variant.nutrition.sodium)} mg` },
                      ]}
                      columns={3}
                    />
                  ) : (
                    <p className="text-xs text-ink-muted">Todavía sin datos nutricionales.</p>
                  )}
                </div>
              ))}
            </div>
          </FormSection>
        )}

        {/* --- Alergenos --- */}
        {canEditAllergens ? (
          <FormSection
            title="Alérgenos"
            description="Declararlos es obligatorio: el cliente los filtra y el constructor avisa antes de añadir."
            icon={TriangleAlert}
          >
            <ToggleChips
              options={meta.allergens}
              selected={allergenIds}
              tone="danger"
              onToggle={(id) =>
                setAllergenIds((current) =>
                  current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                )
              }
            />

            <div className="pt-4">
              <Button
                size="sm"
                isLoading={savingBlock === 'allergens'}
                onClick={() =>
                  run(
                    'allergens',
                    () => catalogAdminApi.setAllergens(product.id, allergenIds),
                    'Alérgenos actualizados',
                  )
                }
              >
                Guardar alérgenos
              </Button>
            </div>
          </FormSection>
        ) : (
          <FormSection
            title="Alérgenos declarados"
            description="Solo lectura: los declara el nutricionista y con ellos el cliente filtra el menú."
            icon={TriangleAlert}
          >
            <StaticChips
              items={product.allergens}
              tone="danger"
              empty="Sin alérgenos declarados."
            />
          </FormSection>
        )}

        {/* --- Etiquetas dietarias --- */}
        {canEditTags ? (
          <FormSection
            title="Etiquetas dietarias"
            description="Vegano, sin gluten, alto en proteína… son los filtros del menú."
            icon={Tag}
          >
            <ToggleChips
              options={meta.dietaryTags}
              selected={tagIds}
              tone="brand"
              onToggle={(id) =>
                setTagIds((current) =>
                  current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                )
              }
            />

            <div className="pt-4">
              <Button
                size="sm"
                isLoading={savingBlock === 'tags'}
                onClick={() =>
                  run(
                    'tags',
                    () => catalogAdminApi.setDietaryTags(product.id, tagIds),
                    'Etiquetas actualizadas',
                  )
                }
              >
                Guardar etiquetas
              </Button>
            </div>
          </FormSection>
        ) : (
          <FormSection
            title="Etiquetas dietarias"
            description="Solo lectura: son los filtros con los que el cliente encuentra este plato."
            icon={Tag}
          >
            <StaticChips
              items={product.dietaryTags}
              tone="brand"
              empty="Sin etiquetas dietarias."
            />
          </FormSection>
        )}
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
          'Deja de aparecer en el menú de esa cocina hasta que lo repongas. El resto de locales no se toca.',
        confirmLabel: 'Retirar del menú',
        tone: 'danger',
        reasonLabel: 'Motivo (queda en la bitácora)',
        reasonRequired: true,
      });
      if (!result.confirmed) return;
      // El mismo minimo que valida la ruta: mejor decirlo aqui que devolver el
      // mensaje crudo del validador.
      if (result.reason.length < 3) {
        toast.error('El motivo necesita al menos 3 caracteres');
        return;
      }
      reason = result.reason;
    }

    setIsSaving(true);
    try {
      await catalogAdminApi.setAvailability(product.id, branchId, next, reason || undefined);
      toast.success(
        next
          ? `Disponible otra vez en ${branchName}. Avisamos a quien pidió alerta de reposición.`
          : `Retirado del menú de ${branchName}`,
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
      description="Agotar un plato aquí no toca el catálogo: solo lo retira del menú de la cocina elegida."
      icon={Store}
    >
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
        <div className="grid gap-3">
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
                ? 'Se vende con normalidad en esa cocina.'
                : `Retirado${current?.unavailableReason ? `: ${current.unavailableReason}` : ''}`
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
  <dl className={cn('grid gap-2.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
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
