import { useEffect, useState } from 'react';
import { Flame, ImageIcon, Plus, Tag, TriangleAlert, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
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

interface ProductEditorProps {
  product: AdminProduct;
  meta: CatalogMeta;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Editor del producto.
 *
 * Cada bloque se muestra segun los permisos: el nutricionista solo ve "Nutricion",
 * "Alergenos" y "Etiquetas"; el gestor de catalogo ve los datos y los precios.
 * Aunque alguien forzara la UI, el backend rechaza lo que no le corresponde.
 */
export const ProductEditor = ({ product, meta, onClose, onSaved }: ProductEditorProps) => {
  const { can } = usePermissions();
  const canEditProduct = can(PERM.CATALOG_PRODUCT_WRITE);
  const canEditNutrition = can(PERM.NUTRITION_WRITE);
  const canEditTags = can(PERM.DIETARY_TAG_WRITE);
  const canEditAllergens = can(PERM.ALLERGEN_WRITE);

  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? '');
  const [categoryId, setCategoryId] = useState(product.category?.id ?? meta.categories[0]?.id ?? 0);

  const [variants, setVariants] = useState(product.variants);
  const [newVariant, setNewVariant] = useState({ name: '', basePrice: '' });

  const [allergenIds, setAllergenIds] = useState<number[]>(
    product.allergens.map((allergen) => allergen.id),
  );
  const [tagIds, setTagIds] = useState<number[]>(product.dietaryTags.map((tag) => tag.id));

  const [savingBlock, setSavingBlock] = useState<string | null>(null);

  useEffect(() => {
    setVariants(product.variants);
  }, [product.variants]);

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

  const patchNutrition = (variantId: number, field: string, value: number) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              nutrition: {
                calories: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
                fiber: 0,
                sodium: 0,
                ...variant.nutrition,
                [field]: value,
              },
            }
          : variant,
      ),
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={product.name} description={product.slug} maxWidth="lg">
      <div className="space-y-7">
        {/* --- Datos comerciales (gestor de catalogo) --- */}
        {canEditProduct && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Datos del producto</h3>

            <div className="space-y-3">
              <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />

                <Select
                  id="cat"
                  label="Categoría"
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                >
                  {meta.categories.map((category) => (
                    <SelectOption key={category.id} value={category.id}>
                      {category.name}
                    </SelectOption>
                  ))}
                </Select>

              <Input
                label="Descripcion"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div className="grid gap-4 rounded-2xl border border-line bg-surface-muted/40 p-4 sm:grid-cols-[1fr_150px]">
                <div>
                  <Input
                    label="Ruta o URL de imagen"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="/images/products/mi-producto.jpg"
                    hint="Puedes usar un archivo de public o una URL https"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    Recomendado: imagen cuadrada, bien iluminada y sin texto. Se verá en el menú y el carrito.
                  </p>
                </div>
                <div className="aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-line">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Vista previa del producto" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-ink-muted">
                      <ImageIcon className="size-7 text-brand-300" /> Sin imagen
                    </div>
                  )}
                </div>
              </div>

              <Button
                size="sm"
                isLoading={savingBlock === 'product'}
                onClick={() =>
                  run(
                    'product',
                    () =>
                      catalogAdminApi.updateProduct(product.id, {
                        name,
                        description: description || null,
                        categoryId,
                        imageUrl: imageUrl || null,
                      }),
                    'Producto actualizado',
                  )
                }
              >
                Guardar datos
              </Button>
            </div>
          </section>
        )}

        {/* --- Precios (gestor de catalogo). El nutricionista NO ve este bloque. --- */}
        {canEditProduct && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Wallet className="size-4 text-brand-600" /> Presentaciones y precios
            </h3>
            <p className="mb-2 text-xs text-ink-muted">
              Cada cambio de precio queda registrado con tu nombre en la bitacora.
            </p>

            <div className="space-y-2">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-end gap-2 rounded-xl border border-line p-3"
                >
                  <Input
                    label="Nombre"
                    value={variant.name}
                    onChange={(e) => patchVariant(variant.id, { name: e.target.value })}
                  />
                  <Input
                    label="Precio"
                    type="number"
                    step="0.10"
                    value={variant.basePrice}
                    onChange={(e) =>
                      patchVariant(variant.id, { basePrice: Number(e.target.value) })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={savingBlock === `variant-${variant.id}`}
                    onClick={() =>
                      run(
                        `variant-${variant.id}`,
                        () =>
                          catalogAdminApi.updateVariant(variant.id, {
                            name: variant.name,
                            basePrice: Number(variant.basePrice),
                          }),
                        `Precio actualizado a ${formatCurrency(Number(variant.basePrice))}`,
                      )
                    }
                  >
                    Guardar
                  </Button>
                </div>
              ))}

              <div className="flex items-end gap-2 rounded-xl border border-dashed border-line p-3">
                <Input
                  label="Nueva presentacion"
                  placeholder="Grande"
                  value={newVariant.name}
                  onChange={(e) => setNewVariant((c) => ({ ...c, name: e.target.value }))}
                />
                <Input
                  label="Precio"
                  type="number"
                  step="0.10"
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
                    if (!newVariant.name || !newVariant.basePrice) {
                      toast.error('Completa el nombre y el precio');
                      return;
                    }
                    void run(
                      'new-variant',
                      async () => {
                        await catalogAdminApi.addVariant(product.id, {
                          name: newVariant.name,
                          basePrice: Number(newVariant.basePrice),
                        });
                        setNewVariant({ name: '', basePrice: '' });
                      },
                      'Presentacion agregada',
                    );
                  }}
                >
                  Agregar
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* --- Nutricion (el nutricionista) --- */}
        {canEditNutrition && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Flame className="size-4 text-accent-500" /> Informacion nutricional
            </h3>
            <p className="mb-2 text-xs text-ink-muted">
              Por presentacion. Es lo que ve el cliente en la ficha y lo que suman los bowls.
            </p>

            <div className="space-y-3">
              {variants.map((variant) => (
                <div key={variant.id} className="rounded-xl border border-line p-3">
                  <p className="mb-2 text-sm font-medium text-ink">{variant.name}</p>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ['calories', 'Calorias'],
                        ['protein', 'Proteina'],
                        ['carbs', 'Carbos'],
                        ['fat', 'Grasas'],
                      ] as const
                    ).map(([field, label]) => (
                      <Input
                        key={field}
                        label={label}
                        type="number"
                        step="0.1"
                        value={variant.nutrition?.[field] ?? 0}
                        onChange={(e) => patchNutrition(variant.id, field, Number(e.target.value))}
                      />
                    ))}
                  </div>

                  <Button
                    size="sm"
                    className="mt-2"
                    isLoading={savingBlock === `nutrition-${variant.id}`}
                    onClick={() =>
                      run(
                        `nutrition-${variant.id}`,
                        () =>
                          catalogAdminApi.updateNutrition(variant.id, {
                            calories: variant.nutrition?.calories ?? 0,
                            protein: variant.nutrition?.protein ?? 0,
                            carbs: variant.nutrition?.carbs ?? 0,
                            fat: variant.nutrition?.fat ?? 0,
                          }),
                        'Nutricion actualizada',
                      )
                    }
                  >
                    Guardar nutricion
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- Alergenos --- */}
        {canEditAllergens && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <TriangleAlert className="size-4 text-accent-500" /> Alergenos
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {meta.allergens.map((allergen) => {
                const active = allergenIds.includes(allergen.id);
                return (
                  <button
                    key={allergen.id}
                    type="button"
                    onClick={() =>
                      setAllergenIds((current) =>
                        active
                          ? current.filter((id) => id !== allergen.id)
                          : [...current, allergen.id],
                      )
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-red-500 bg-red-500 text-white'
                        : 'border-line text-ink-muted hover:border-red-300',
                    )}
                  >
                    {allergen.name}
                  </button>
                );
              })}
            </div>

            <Button
              size="sm"
              className="mt-3"
              isLoading={savingBlock === 'allergens'}
              onClick={() =>
                run(
                  'allergens',
                  () => catalogAdminApi.setAllergens(product.id, allergenIds),
                  'Alergenos actualizados',
                )
              }
            >
              Guardar alergenos
            </Button>
          </section>
        )}

        {/* --- Etiquetas dietarias --- */}
        {canEditTags && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Tag className="size-4 text-brand-600" /> Etiquetas dietarias
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {meta.dietaryTags.map((tag) => {
                const active = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setTagIds((current) =>
                        active ? current.filter((id) => id !== tag.id) : [...current, tag.id],
                      )
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-line text-ink-muted hover:border-brand-300',
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>

            <Button
              size="sm"
              className="mt-3"
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
          </section>
        )}
      </div>
    </Modal>
  );
};
