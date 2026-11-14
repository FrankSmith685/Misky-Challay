import { useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, SearchX, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Select, SelectOption } from '@components/ui/Select';
import { EmptyState } from '@components/common/EmptyState';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { resetFilters } from '../catalogSlice';
import type { RequestStatus } from '@/types/api';
import type { Allergen, Product } from '../types';
import { ProductCard } from './ProductCard';
import { ProductGridSkeleton } from './ProductCardSkeleton';

type SortMode = 'recommended' | 'price';

interface CatalogResultsProps {
  products: Product[];
  status: RequestStatus;
  error: string | null;
  /** Vuelve a pedir el menú tras un fallo de red. */
  onRetry: () => void;
  /** Alérgenos declarados en el perfil: la tarjeta avisa cuando el plato los lleva. */
  allergenAlerts?: Allergen[];
}

/** Resultados con ordenamiento local, estados accionables y grilla consistente. */
export const CatalogResults = ({
  products,
  status,
  error,
  onRetry,
  allergenAlerts,
}: CatalogResultsProps) => {
  const dispatch = useAppDispatch();
  const onlyFavorites = useAppSelector((state) => state.catalog.filters.onlyFavorites);
  const [sort, setSort] = useState<SortMode>('recommended');
  const sortedProducts = useMemo(() => {
    const rows = [...products];
    if (sort === 'price') return rows.sort((a, b) => displayPrice(a) - displayPrice(b));
    return rows.sort((a, b) => {
      const builderFirst = Number(b.type === 'CUSTOMIZABLE') - Number(a.type === 'CUSTOMIZABLE');
      return builderFirst || Number(b.isFeatured) - Number(a.isFeatured);
    });
  }, [products, sort]);

  if (status === 'loading' && products.length === 0) return <ProductGridSkeleton count={6} />;

  // Un fallo de red no es un menú vacío: se dice qué pasó y se ofrece reintentar.
  if (status === 'failed') {
    return (
      <div className="grid justify-items-center gap-4 rounded-card border border-line bg-white px-4 py-12 text-center shadow-e2">
        <span className="grid size-12 place-items-center rounded-card bg-red-50 text-red-600">
          <AlertTriangle className="size-6" />
        </span>
        <div>
          <h2 className="text-xl font-black text-ink">No pudimos cargar el menú</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
            {error ?? 'Revisa tu conexión e inténtalo nuevamente en unos segundos.'}
          </p>
        </div>
        <Button onClick={onRetry} leftIcon={<RefreshCw className="size-4" />}>Reintentar</Button>
      </div>
    );
  }

  if (status !== 'loading' && products.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-brand-200 bg-white py-5 shadow-sm">
        <EmptyState
          icon={SearchX}
          title={onlyFavorites ? 'Ninguno de tus favoritos está en este menú' : 'No encontramos coincidencias'}
          description={onlyFavorites
            ? 'Tus favoritos guardados no están disponibles en esta sucursal o no pasan los filtros activos.'
            : 'Prueba otra búsqueda o elimina los filtros activos.'}
          action={<Button variant="outline" leftIcon={<SlidersHorizontal className="size-4" />} onClick={() => dispatch(resetFilters())}>Restablecer filtros</Button>}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">{onlyFavorites ? 'Tus favoritos' : 'Nuestra cocina'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-black tracking-tight text-ink">{products.length} {products.length === 1 ? 'plato disponible' : 'platos disponibles'}</h2>
            {status === 'loading' && <span className="animate-pulse text-xs font-bold text-brand-600">Actualizando…</span>}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <span className="hidden items-center gap-2 px-2 pb-3 text-xs font-bold text-brand-700 lg:inline-flex"><Sparkles className="size-3.5" /> Preparados al momento</span>
          <Select label="Ordenar" size="small" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} sx={{ minWidth: { xs: '100%', sm: 205 }, bgcolor: 'background.paper', '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-field)' } }}>
            <SelectOption value="recommended">Recomendados</SelectOption>
            <SelectOption value="price">Menor precio</SelectOption>
          </Select>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
        {sortedProducts.map((product) => <ProductCard key={product.id} product={product} allergenAlerts={allergenAlerts} />)}
      </div>
    </>
  );
};

const displayPrice = (product: Product) => product.type === 'CUSTOMIZABLE' ? product.priceFrom : product.defaultVariantPrice || product.priceFrom;
