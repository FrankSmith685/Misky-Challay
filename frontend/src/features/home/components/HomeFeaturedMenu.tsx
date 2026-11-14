import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CakeSlice, Flame, Sparkles, Star } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { useAppState } from '@context/AppStateContext';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { ProductCardSkeleton } from '@features/catalog/components/ProductCardSkeleton';
import { getApiErrorMessage } from '@services/api/client';
import type { Product } from '@features/catalog/types';
import { formatCurrency } from '@lib/format';
import { productImage } from '@features/catalog/productImage';
import { preparationLabel, productHref, PRODUCT_FAMILIES } from '@features/catalog/pastry';

type HomeFeaturedMenuProps = {
  title?: string;
  description?: string;
  productIds?: number[];
};

/** Muestra ventas reales cuando existen y usa productos destacados como selección inicial. */
export const HomeFeaturedMenu = ({
  title = 'Lo más vendido',
  description = 'Descubre las tortas que más eligen nuestros clientes.',
  productIds = [],
}: HomeFeaturedMenuProps) => {
  const { branchId } = useAppState();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    void catalogApi
      .getProducts(productIds.length ? { branchId, productIds } : { branchId, sort: 'BEST_SELLERS' })
      .then((rows) => {
        if (active) setProducts(rows.filter((product) => product.isAvailable).slice(0, 3));
      })
      .catch((cause) => {
        if (active) {
          setProducts([]);
          setError(getApiErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [branchId, productIds, retryNonce]);

  const hasSalesHistory = !productIds.length && products.some((product) => (product.salesCount ?? 0) > 0);
  const eyebrow = hasSalesHistory ? 'Los más vendidos' : 'Selección para empezar';
  const isLegacyTitle = /favoritos|descubre/i.test(title);
  const displayTitle = hasSalesHistory && isLegacyTitle ? 'Lo más vendido' : hasSalesHistory ? title : 'Recomendados para empezar';
  const displayDescription = hasSalesHistory
    ? isLegacyTitle ? 'Descubre las tortas que más eligen nuestros clientes.' : description
    : 'Todavía no hay suficiente historial de ventas. Te mostramos productos publicados y disponibles para que puedas elegir sin esperar.';

  return (
    <MarketingSection tone="white" contentClassName="pt-6 pb-8 sm:pt-8 sm:pb-10 lg:pt-10 lg:pb-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <MarketingHeading eyebrow={eyebrow} title={displayTitle} description={displayDescription} className="max-w-3xl" />
        <Button component={Link} to={ROUTES.menu} variant="outline" className="w-full md:w-auto">
          Ver todo el catálogo <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-5 md:grid-cols-2 lg:mt-9 xl:grid-cols-3 xl:gap-6">
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => <ProductCardSkeleton key={index} />)
          : error
            ? <div className="sm:col-span-2 lg:col-span-3"><LoadError title="No pudimos cargar la selección" message={error} onRetry={() => setRetryNonce((value) => value + 1)} /></div>
            : products.length > 0
              ? products.map((product) => <FeaturedProductCard key={product.id} product={product} />)
              : <div className="sm:col-span-2 lg:col-span-3">
                <EmptyState
                  icon={CakeSlice}
                  title="Aún no hay tortas publicadas"
                  description="El catálogo se está preparando. Cuando haya recetas disponibles aparecerán aquí con su precio y disponibilidad real."
                  action={<Button component={Link} to={ROUTES.menu} variant="outline">Abrir catálogo <ArrowRight className="size-4" /></Button>}
                />
              </div>}
      </div>

      <div className={`mt-5 flex items-start gap-3 border-l-2 px-4 py-3 text-xs leading-5 sm:mt-6 sm:text-sm ${hasSalesHistory ? 'border-accent-500 bg-accent-50 text-accent-900' : 'border-brand-600 bg-brand-50 text-brand-900'}`}>
        {hasSalesHistory ? <Flame className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <p>
          <strong>{hasSalesHistory ? 'Elegidos por otros clientes.' : 'Una selección para comenzar.'}</strong>{' '}
          {hasSalesHistory
            ? 'Ordenados por unidades vendidas en pedidos confirmados.'
            : 'Cuando haya más ventas, esta sección se ordenará automáticamente por popularidad.'}
        </p>
      </div>

    </MarketingSection>
  );
};

const FeaturedProductCard = ({ product }: { product: Product }) => {
  const isBuilder = product.cakeSaleMode === 'SEMI_CUSTOM' || product.cakeSaleMode === 'ADVANCED';
  const image = productImage(product);
  const to = productHref(product);
  const price = isBuilder ? product.priceFrom : product.defaultVariantPrice || product.priceFrom;
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white shadow-e1 transition duration-200 hover:-translate-y-1 hover:shadow-e3">
      <Link to={to} state={isBuilder ? { customCakeEntry: true } : undefined} className="relative block aspect-[4/3] max-h-[18rem] overflow-hidden bg-surface-muted sm:max-h-[20rem] md:max-h-[21rem] xl:max-h-[22rem]">
        {image ? <img src={image} alt={product.name} loading="lazy" width="720" height="540" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <CakeSlice className="absolute inset-0 m-auto size-14 text-brand-300" aria-hidden="true" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/35 to-transparent" />
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
          {product.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-brand-800"><Star className="size-3.5 fill-current" aria-hidden="true" /> Recomendado</span>}
          {(product.salesCount ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-accent-400 px-2.5 py-1 text-[11px] font-extrabold text-ink"><Flame className="size-3.5" aria-hidden="true" /> Más vendido</span>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-3.5 sm:p-5 lg:p-6">
        <h3 className="text-base font-black leading-tight tracking-tight text-ink sm:text-lg">{product.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{product.description || 'Una opción dulce para compartir.'}</p>
        <p className="mt-3 text-xs font-semibold text-ink-muted">{product.family ? `${PRODUCT_FAMILIES[product.family]} · ` : ''}{preparationLabel(product)}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div><span className="block text-xs text-ink-muted">{isBuilder ? 'Desde' : 'Precio'}</span><span className="text-xl font-black tabular-nums text-ink">{formatCurrency(price)}</span></div>
          <Link to={to} state={isBuilder ? { customCakeEntry: true } : undefined} className="inline-flex min-h-10 items-center gap-1 rounded-field bg-brand-700 px-3 text-xs font-extrabold text-white transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Ver detalle <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
        </div>
      </div>
    </article>
  );
};
