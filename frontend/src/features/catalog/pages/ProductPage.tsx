import { useLiveRefresh } from '@services/realtime';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock3,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { StickyActionBar } from '@components/ui/StickyActionBar';
import { QuantityStepper } from '@components/ui/QuantityStepper';
import { ProductMedia } from '@components/ui/ProductMedia';
import { ChoiceGroup } from '@components/ui/ChoiceGroup';
import { AnimatedNumber } from '@components/ui/AnimatedNumber';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { TagList } from '@components/ui/DietaryTag';
import { useAppDispatch } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem } from '@features/cart/cartSlice';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '../services/catalog.service';
import { ProductCard } from '../components/ProductCard';
import { AvailabilityAlertButton } from '../components/AvailabilityAlertButton';
import { FavoriteButton } from '@features/favorites/components/FavoriteButton';
import { ProductReviewsSection } from '@features/reviews/components/ProductReviewsSection';
import type { Product, ProductDetail } from '../types';

const BRAND = 'Misky Challay';

/** Cambia una meta ya declarada en index.html y devuelve cómo dejarla como estaba. */
const setMetaContent = (selector: string, value: string) => {
  const tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) return () => undefined;
  const previous = tag.content;
  tag.content = value;
  return () => {
    tag.content = previous;
  };
};

/** Las redes necesitan la URL absoluta de la imagen, no la ruta del servidor. */
const toAbsoluteUrl = (src: string | null) => {
  if (!src) return null;
  try {
    return new URL(src, window.location.origin).href;
  } catch {
    return null;
  }
};

/** Ficha de producto: precio, variantes y disponibilidad contextual. */
const ProductPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    branchId,
    address,
    pickupBranch,
    deliveryType,
    openLocationModal,
  } = useAppState();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const loadedSource = useRef('');
  const displayImage = product?.imageUrl ?? product?.categoryImageUrl ?? null;
  useLiveRefresh(['catalog', 'inventory', 'coverage'], () => setRetryNonce((value) => value + 1));

  useEffect(() => {
    if (!slug) return undefined;
    let active = true;

    const source = `${slug}:${branchId}`;
    const background = loadedSource.current === source;
    if (!background) setIsLoading(true);
    setLoadError(null);
    catalogApi
      .getProduct(slug, branchId)
      .then(async (detail) => {
        if (!active) return;
        setProduct(detail);
        const preferred =
          detail.variants.find((variant) => variant.isDefault) ??
          detail.variants[0];
        setVariantId((current) => background && detail.variants.some((variant) => variant.id === current) ? current : preferred?.id ?? null);
        if (!background) setQuantity(1);
        loadedSource.current = source;

        try {
          const related = await catalogApi.getProducts({
            categoryId: detail.categoryId,
            branchId,
          });
          if (active) {
            setRelatedProducts(
              related.filter((entry) => entry.id !== detail.id).slice(0, 3),
            );
          }
        } catch {
          if (active) setRelatedProducts([]);
        }
      })
      .catch((error) => {
        if (!active) return;
        if (!background) { setProduct(null); setRelatedProducts([]); }
        setLoadError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, branchId, retryNonce]);

  /**
   * En Perú el enlace del plato viaja por WhatsApp: sin esto se comparte la tarjeta
   * genérica del sitio. El título afina el que RouteEffects dedujo del slug, porque
   * este efecto corre después del suyo.
   */
  useEffect(() => {
    if (!product) return undefined;

    const title = `${product.name} | ${BRAND}`;
    const description =
      product.description?.trim() ||
      `Pide ${product.name} en ${BRAND}: ingredientes reales y entrega en tu zona.`;
    const image = toAbsoluteUrl(displayImage);

    document.title = title;
    const restore = [
      setMetaContent('meta[name="description"]', description),
      setMetaContent('meta[property="og:title"]', title),
      setMetaContent('meta[property="og:description"]', description),
      setMetaContent('meta[name="twitter:title"]', title),
      setMetaContent('meta[name="twitter:description"]', description),
      ...(image
        ? [
            setMetaContent('meta[property="og:image"]', image),
            setMetaContent('meta[property="og:image:alt"]', product.name),
            setMetaContent('meta[name="twitter:image"]', image),
          ]
        : []),
    ];

    return () => restore.forEach((undo) => undo());
  }, [displayImage, product]);

  if (isLoading) return <PageLoader />;

  if (!product) {
    return (
      <div className="bg-surface-muted px-4 py-20">
        <div className="mx-auto max-w-xl rounded-card border border-line bg-white p-8 text-center shadow-e2 sm:p-10">
          <span className="mx-auto grid size-12 place-items-center rounded-card bg-red-50 text-red-600">
            <AlertTriangle className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-black text-ink">
            No pudimos abrir este plato
          </h1>
          <p className="mt-2 leading-7 text-ink-muted">
            {loadError ?? 'El producto no existe o ya no está publicado.'}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {loadError && (
              <Button
                onClick={() => setRetryNonce((value) => value + 1)}
                leftIcon={<RefreshCw className="size-4" />}
              >
                Reintentar
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.menu)}
              leftIcon={<ArrowLeft className="size-4" />}
            >
              Volver al menú
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const variant =
    product.variants.find((entry) => entry.id === variantId) ??
    product.variants[0];
  const unitPrice = variant?.basePrice ?? 0;
  const total = unitPrice * quantity;
  const purchaseContext = branchId
    ? deliveryType === 'PICKUP'
      ? {
          icon: Store,
          title: `Recojo en ${pickupBranch?.name ?? 'taller seleccionado'}`,
          detail: pickupBranch?.addressLine ?? 'Disponibilidad validada para este local.',
        }
      : {
          icon: Truck,
          title: 'Entrega en tu dirección',
          detail: address?.line1 ?? 'Disponibilidad validada para tu zona.',
        }
    : null;

  const handleAdd = () => {
    if (!variant || !product.isAvailable) return;

    dispatch(
      addItem({
        id: crypto.randomUUID(),
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        variantName: variant.servingSize ? `${variant.name} · ${variant.servingSize} ${variant.servingUnit ?? 'porciones'}` : variant.name,
        imageUrl: displayImage,
        quantity,
        unitPrice: variant.basePrice,
        extrasTotal: 0,
        lineTotal: total,
        selections: [],
      }),
    );

    toast.success(`${quantity} × ${product.name} agregado al carrito`);
    setQuantity(1);
  };

  return (
    <>
      <div className="bg-surface-muted pb-36 sm:pb-28 lg:pb-16">
        <div className="mx-auto max-w-8xl px-4 pb-12 pt-7 sm:px-6 lg:px-8 lg:pt-9">
          <Breadcrumbs
            items={[
              { label: 'Inicio', to: '/' },
              { label: 'Menú', to: ROUTES.menu },
              { label: product.name },
            ]}
            className="mb-6"
          />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.06fr)_minmax(390px,.94fr)] lg:gap-12">
            <section className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
              <div className="relative overflow-hidden rounded-card border border-line bg-white p-2 shadow-e3">
                <ProductMedia
                  src={displayImage}
                  alt={product.name}
                  priority
                  ratio="4/3"
                  className="rounded-[3px]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                  <span
                    className={`absolute bottom-4 left-4 rounded-pill px-3 py-1.5 text-xs font-extrabold shadow-lg ${
                      product.isAvailable
                        ? 'bg-white text-brand-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {product.isAvailable ? 'Disponible para pedir' : 'Temporalmente no disponible'}
                  </span>
                </ProductMedia>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <ProductAssurance icon={Clock3} title="Pedido rápido" detail="Confirmación inmediata" />
                <ProductAssurance icon={ShieldCheck} title="Precio claro" detail="Sin cargos ocultos" />
                <ProductAssurance icon={Check} title="Datos reales" detail="Ingredientes seleccionados" />
              </div>
            </section>

            <section className="min-w-0 lg:py-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
                    Listo para pedir
                  </p>
                  <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-.035em] text-ink sm:text-4xl">
                    {product.name}
                  </h1>
                </div>
                <FavoriteButton
                  className="shrink-0 border border-line bg-white shadow-sm"
                  product={{
                    productId: product.id,
                    slug: product.slug,
                    name: product.name,
                    imageUrl: displayImage,
                    priceFrom: product.variants.length
                      ? Math.min(...product.variants.map((entry) => entry.basePrice))
                      : 0,
                    type: product.type,
                  }}
                />
              </div>

              {product.description && (
                <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">
                  {product.description}
                </p>
              )}

              {product.dietaryTags.length > 0 && (
                <TagList tags={product.dietaryTags} className="mt-4" />
              )}

              {purchaseContext && <div className="mt-6 flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50/70 p-4">
                <purchaseContext.icon className="mt-0.5 size-5 shrink-0 text-brand-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-ink">
                    {purchaseContext.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-ink-muted">
                    {purchaseContext.detail}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openLocationModal}
                  className="shrink-0 rounded-field px-2 py-1 text-xs font-extrabold text-brand-700 transition-colors hover:bg-white"
                >
                  Cambiar
                </button>
              </div>}

              {product.variants.length > 0 && (
                <section className="mt-7 border-t border-line pt-6" aria-labelledby="product-variant-heading">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[.14em] text-brand-700">
                        1. Presentación
                      </p>
                      <h2 id="product-variant-heading" className="mt-1 text-xl font-black text-ink">
                        Elige tu tamaño
                      </h2>
                    </div>
                    <span className="text-sm text-ink-muted">Precio por unidad</span>
                  </div>
                  <ChoiceGroup
                    variant="tile"
                    columns={product.variants.length >= 3 ? 3 : product.variants.length === 2 ? 2 : 1}
                    ariaLabel="Presentación"
                    className="mt-4"
                    value={variant?.id ?? -1}
                    onChange={setVariantId}
                    options={product.variants.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                      hint: (
                        <span className="mt-1 block">
                          {entry.servingSize && <span className="mr-2 text-ink-muted">{entry.servingSize} {entry.servingUnit ?? 'porciones'}</span>}
                          <strong className="text-brand-700">{formatCurrency(entry.basePrice)}</strong>
                        </span>
                      ),
                    }))}
                  />
                </section>
              )}

              {product.allergens.length > 0 && (
                <section className="mt-5 flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50/70 p-4">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
                  <div>
                    <h2 className="text-sm font-extrabold text-amber-950">
                      Contiene: {product.allergens.map((allergen) => allergen.name).join(', ')}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-amber-900">
                      Elaborado en una cocina donde se manipulan otros alérgenos. Si tienes una alergia severa, consulta antes de pedir.
                    </p>
                  </div>
                </section>
              )}

              <section className="mt-7 hidden rounded-card border border-line bg-white p-5 shadow-e2 lg:block">
                <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
                  <div>
                    <p className="text-xs font-semibold text-ink-muted">Total del pedido</p>
                    <p className="mt-1 text-3xl font-black tracking-tight text-brand-700">
                      <AnimatedNumber value={total} format={formatCurrency} />
                    </p>
                  </div>
                  <QuantityStepper
                    value={quantity}
                    onChange={setQuantity}
                    max={20}
                    size="touch"
                    ariaLabel={product.name}
                  />
                </div>
                <div className="grid gap-3 pt-4">
                  {product.isAvailable ? (
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleAdd}
                      disabled={!variant}
                      leftIcon={<ShoppingBag className="size-4" />}
                    >
                      Agregar al carrito
                    </Button>
                  ) : (
                    <AvailabilityAlertButton product={product} fullWidth />
                  )}
                  <p className="text-center text-xs text-ink-muted">
                    Puedes revisar cantidades y eliminar productos desde el carrito.
                  </p>
                </div>
              </section>
            </section>
          </div>
        </div>

        <ProductReviewsSection productId={product.id} />

        {relatedProducts.length > 0 && (
          <section className="border-t border-line bg-white py-12 sm:py-16" aria-labelledby="related-products-heading">
            <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
              <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
                También podría gustarte
              </p>
              <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 id="related-products-heading" className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                    Más opciones del menú
                  </h2>
                  <p className="mt-2 text-sm text-ink-muted">Platos disponibles de la misma categoría.</p>
                </div>
                <Button variant="outline" onClick={() => navigate(ROUTES.menu)}>
                  Ver todo el menú
                </Button>
              </div>
              <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {relatedProducts.map((entry) => (
                  <ProductCard key={entry.id} product={entry} />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <StickyActionBar hideFrom="lg">
        {/* Dos filas por debajo de 640px: en 360px no caben en una el resumen, la cantidad y el CTA. */}
        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center justify-between gap-3 sm:min-w-0 sm:flex-1">
            <div className="min-w-0">
              <p className="truncate text-[11px] leading-tight text-ink-muted">
                {quantity} × {product.name}
              </p>
              <p className="truncate text-lg font-black leading-tight text-brand-700">
                <AnimatedNumber value={total} format={formatCurrency} />
              </p>
            </div>
            {product.isAvailable && (
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={20}
                size="touch"
                ariaLabel={product.name}
                className="shrink-0 bg-white"
              />
            )}
          </div>
          {product.isAvailable ? (
            <Button size="lg" onClick={handleAdd} disabled={!variant}>Agregar</Button>
          ) : (
            <AvailabilityAlertButton product={product} compact />
          )}
        </div>
      </StickyActionBar>
    </>
  );
};

const ProductAssurance = ({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Clock3;
  title: string;
  detail: string;
}) => (
  <div className="rounded-card border border-line bg-white p-3 text-center shadow-sm">
    <Icon className="mx-auto size-4 text-brand-700" aria-hidden="true" />
    <p className="mt-2 text-[11px] font-extrabold text-ink sm:text-xs">{title}</p>
    <p className="mt-1 hidden text-[10px] leading-4 text-ink-muted sm:block">{detail}</p>
  </div>
);

export default ProductPage;
