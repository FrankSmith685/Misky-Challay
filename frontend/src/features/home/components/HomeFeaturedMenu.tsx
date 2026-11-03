import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CakeSlice } from 'lucide-react';
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
import { getApiErrorMessage } from '@services/api/client';
import type { Product } from '@features/catalog/types';

/** Muestra exclusivamente el catálogo real y comunica cuando todavía no hay oferta publicada. */
export const HomeFeaturedMenu = ({ title = 'Descubre los favoritos de la casa', description = 'Explora las recetas publicadas y sus presentaciones.' }: { title?: string; description?: string }) => {
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
      .getProducts({ branchId, featured: true })
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
  }, [branchId, retryNonce]);

  return (
    <MarketingSection tone="white" contentClassName="py-18 lg:py-24">
      <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <MarketingHeading
          eyebrow="Favoritos de la casa"
          title={title}
          description={description}
        />
        <Button component={Link} to={ROUTES.menu} variant="outline" className="w-full md:w-auto">
          Ver todo el catálogo <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={90}>
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => <ProductCardSkeleton key={index} />)
          : error
            ? <div className="sm:col-span-2 lg:col-span-3"><LoadError title="No pudimos cargar las tortas destacadas" message={error} onRetry={() => setRetryNonce((value) => value + 1)} /></div>
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

      <Reveal delay={180} className="mt-7 flex items-center gap-3 border-l-2 border-brand-600 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <CakeSlice className="size-4 shrink-0" aria-hidden="true" />
        <p><strong>¿Ya tienes una idea?</strong> Puedes comenzar desde una receta y ajustar cada detalle antes de agregarla al carrito.</p>
      </Reveal>
    </MarketingSection>
  );
};
