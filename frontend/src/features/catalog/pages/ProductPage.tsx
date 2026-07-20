import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Minus, Plus, Salad } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { useAppDispatch } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem } from '@features/cart/cartSlice';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '../services/catalog.service';
import { NutritionPanel } from '../components/NutritionPanel';
import { FavoriteButton } from '@features/favorites/components/FavoriteButton';
import type { ProductDetail } from '../types';

/** Ficha del producto fijo: variantes, nutricion, alergenos y agregar al carrito. */
const ProductPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { branchId } = useAppState();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    setIsLoading(true);
    catalogApi
      .getProduct(slug, branchId)
      .then((detail) => {
        setProduct(detail);
        const preferred =
          detail.variants.find((variant) => variant.isDefault) ?? detail.variants[0];
        setVariantId(preferred?.id ?? null);
      })
      .catch((error) => toast.error(getApiErrorMessage(error)))
      .finally(() => setIsLoading(false));
  }, [slug, branchId]);

  if (isLoading) return <PageLoader />;

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-ink-muted">No encontramos este plato.</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.menu)}>
          Volver al menu
        </Button>
      </div>
    );
  }

  const variant = product.variants.find((entry) => entry.id === variantId) ?? product.variants[0];

  const handleAdd = () => {
    if (!variant) return;

    dispatch(
      addItem({
        id: crypto.randomUUID(),
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        variantName: variant.name,
        imageUrl: product.imageUrl,
        quantity,
        unitPrice: variant.basePrice,
        extrasTotal: 0,
        lineTotal: variant.basePrice * quantity,
        selections: [],
        nutrition: variant.nutrition,
      }),
    );

    toast.success(`${product.name} agregado al carrito`);
    navigate(ROUTES.cart);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex h-72 items-center justify-center rounded-card bg-brand-50">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="size-full rounded-card object-cover"
            />
          ) : (
            <Salad className="size-16 text-brand-300" />
          )}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold text-ink">{product.name}</h1>
            <FavoriteButton
              className="shrink-0 border border-line"
              product={{
                productId: product.id,
                slug: product.slug,
                name: product.name,
                imageUrl: product.imageUrl,
                priceFrom: product.variants.length
                  ? Math.min(...product.variants.map((entry) => entry.basePrice))
                  : 0,
                type: product.type,
              }}
            />
          </div>
          {product.description && <p className="mt-2 text-ink-muted">{product.description}</p>}

          {product.dietaryTags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {product.dietaryTags.map((tag) => (
                <li
                  key={tag.code}
                  className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                >
                  {tag.name}
                </li>
              ))}
            </ul>
          )}

          {product.variants.length > 1 && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-ink">Presentacion</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setVariantId(entry.id)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm transition-colors',
                      entry.id === variant?.id
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-line text-ink-muted hover:border-brand-300',
                    )}
                  >
                    {entry.name} · {formatCurrency(entry.basePrice)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {variant?.nutrition && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-ink">Informacion nutricional</p>
              <NutritionPanel nutrition={variant.nutrition} />
            </div>
          )}

          {product.allergens.length > 0 && (
            <Card className="mt-6 border-accent-400/40 bg-accent-400/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent-500" />
                <div>
                  <CardTitle className="text-sm">
                    Contiene: {product.allergens.map((allergen) => allergen.name).join(', ')}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Elaborado en una cocina donde se manipulan otros alergenos.
                  </CardDescription>
                </div>
              </div>
            </Card>
          )}

          <div className="mt-8 flex items-center gap-4">
            <div className="flex items-center rounded-full border border-line">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                aria-label="Quitar uno"
                className="p-2.5 text-ink-muted hover:text-brand-700"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(20, value + 1))}
                aria-label="Agregar uno"
                className="p-2.5 text-ink-muted hover:text-brand-700"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <Button size="lg" className="flex-1" onClick={handleAdd} disabled={!product.isAvailable}>
              {product.isAvailable
                ? `Agregar · ${formatCurrency((variant?.basePrice ?? 0) * quantity)}`
                : 'No disponible'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
