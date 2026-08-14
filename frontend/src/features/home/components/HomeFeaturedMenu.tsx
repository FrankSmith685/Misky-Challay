import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChefHat } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal, RevealGroup } from '@components/ui/Reveal';
import { useAppState } from '@context/AppStateContext';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { ProductCard } from '@features/catalog/components/ProductCard';
import { ProductCardSkeleton } from '@features/catalog/components/ProductCardSkeleton';
import type { Product } from '@features/catalog/types';

/** Muestra productos administrados desde el catálogo; la portada nunca duplica precios ni disponibilidad. */
export const HomeFeaturedMenu = () => {
  const { branchId } = useAppState();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void catalogApi
      .getProducts({ branchId, featured: true })
      .then((rows) => {
        if (active) setProducts(rows.filter((product) => product.isAvailable).slice(0, 3));
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [branchId]);

  if (!isLoading && products.length === 0) return null;

  return (
    <MarketingSection tone="white" contentClassName="py-18 lg:py-24">
      <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <MarketingHeading
          eyebrow="Favoritos del menú"
          title="Una buena elección empieza aquí"
          description="Recetas destacadas con precio, disponibilidad e información nutricional conectados al catálogo real."
        />
        <Button component={Link} to={ROUTES.menu} variant="outline" className="w-full md:w-auto">
          Ver todo el menú <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={90}>
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => <ProductCardSkeleton key={index} />)
          : products.map((product) => <ProductCard key={product.id} product={product} />)}
      </RevealGroup>

      <Reveal delay={180} className="mt-7 flex items-center gap-3 border-l-2 border-brand-600 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <ChefHat className="size-4 shrink-0" aria-hidden="true" />
        <p><strong>¿Prefieres decidir cada ingrediente?</strong> También puedes empezar desde cero en el constructor.</p>
      </Reveal>
    </MarketingSection>
  );
};
