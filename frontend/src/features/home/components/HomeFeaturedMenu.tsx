import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CakeSlice, Flame, Sparkles, Star } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal, RevealGroup } from '@components/ui/Reveal';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { useAppState } from '@context/AppStateContext';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { ProductCard } from '@features/catalog/components/ProductCard';
import { ProductCardSkeleton } from '@features/catalog/components/ProductCardSkeleton';
import { reviewsApi } from '@features/reviews/services/reviews.service';
import { getApiErrorMessage } from '@services/api/client';
import type { Product } from '@features/catalog/types';
import type { ProductReview } from '@features/reviews/types';

type HomeFeaturedMenuProps = {
  title?: string;
  description?: string;
  productIds?: number[];
};

type HomeReview = ProductReview & { productName: string };

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
  const [reviews, setReviews] = useState<HomeReview[]>([]);

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

  useEffect(() => {
    if (products.length === 0) {
      setReviews([]);
      return undefined;
    }

    let active = true;
    void Promise.allSettled(
      products.map(async (product) => {
        const result = await reviewsApi.product(product.id);
        return result.reviews.map((review) => ({ ...review, productName: product.name }));
      }),
    ).then((results) => {
      if (!active) return;
      const verified = results
        .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 3);
      setReviews(verified);
    });

    return () => {
      active = false;
    };
  }, [products]);

  const hasSalesHistory = !productIds.length && products.some((product) => (product.salesCount ?? 0) > 0);
  const eyebrow = hasSalesHistory ? 'Los más vendidos' : 'Selección para empezar';
  const isLegacyTitle = /favoritos|descubre/i.test(title);
  const displayTitle = hasSalesHistory && isLegacyTitle ? 'Lo más vendido' : hasSalesHistory ? title : 'Recomendados para empezar';
  const displayDescription = hasSalesHistory
    ? isLegacyTitle ? 'Descubre las tortas que más eligen nuestros clientes.' : description
    : 'Todavía no hay suficiente historial de ventas. Te mostramos productos publicados y disponibles para que puedas elegir sin esperar.';

  return (
    <MarketingSection tone="white" contentClassName="py-18 lg:py-24">
      <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <MarketingHeading eyebrow={eyebrow} title={displayTitle} description={displayDescription} />
        <Button component={Link} to={ROUTES.menu} variant="outline" className="w-full md:w-auto">
          Ver todo el catálogo <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={90}>
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => <ProductCardSkeleton key={index} />)
          : error
            ? <div className="sm:col-span-2 lg:col-span-3"><LoadError title="No pudimos cargar la selección" message={error} onRetry={() => setRetryNonce((value) => value + 1)} /></div>
            : products.length > 0
              ? products.map((product) => <ProductCard key={product.id} product={product} />)
              : <div className="sm:col-span-2 lg:col-span-3">
                <EmptyState
                  icon={CakeSlice}
                  title="Aún no hay tortas publicadas"
                  description="El catálogo se está preparando. Cuando haya recetas disponibles aparecerán aquí con su precio y disponibilidad real."
                  action={<Button component={Link} to={ROUTES.menu} variant="outline">Abrir catálogo <ArrowRight className="size-4" /></Button>}
                />
              </div>}
      </RevealGroup>

      <Reveal delay={180} className={`mt-7 flex items-start gap-3 border-l-2 px-4 py-3 text-sm ${hasSalesHistory ? 'border-accent-500 bg-accent-50 text-accent-900' : 'border-brand-600 bg-brand-50 text-brand-900'}`}>
        {hasSalesHistory ? <Flame className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <p>
          <strong>{hasSalesHistory ? 'Elegidos por otros clientes.' : 'Una selección para comenzar.'}</strong>{' '}
          {hasSalesHistory
            ? 'Ordenados por unidades vendidas en pedidos confirmados.'
            : 'Cuando haya más ventas, esta sección se ordenará automáticamente por popularidad.'}
        </p>
      </Reveal>

      {reviews.length > 0 && (
        <Reveal delay={240} className="mt-12 border-t border-line pt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Compras verificadas</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">Lo que dicen quienes ya lo probaron</h3>
            </div>
            <p className="text-sm text-ink-muted">Opiniones publicadas después de una entrega confirmada.</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-card border border-line bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-0.5" aria-label={`${review.rating} de 5 estrellas`}>
                    {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`size-4 ${star <= review.rating ? 'fill-amber-400 text-amber-500' : 'text-line'}`} aria-hidden="true" />)}
                  </div>
                  {review.verifiedPurchase && <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-700"><BadgeCheck className="size-4" aria-hidden="true" /> Compra verificada</span>}
                </div>
                <p className="mt-4 text-sm leading-6 text-ink">{review.comment || 'Calificó este producto sin comentario.'}</p>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-xs font-extrabold text-ink">{review.authorName}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{review.productName}</p>
                </div>
              </article>
            ))}
          </div>
        </Reveal>
      )}
    </MarketingSection>
  );
};
