import { useEffect } from 'react';
import { Leaf, MapPin, SearchX, Sparkles } from 'lucide-react';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { useDebounce } from '@hooks/useDebounce';
import { fetchCatalogMeta, fetchProducts } from '../catalogSlice';
import { CatalogFiltersBar } from '../components/CatalogFiltersBar';
import { ProductCard } from '../components/ProductCard';

/** Menu con filtros. El listado depende de la sucursal asignada (RN-005). */
const MenuPage = () => {
  const dispatch = useAppDispatch();
  const { branchId, openLocationModal } = useAppState();
  const { products, filters, status, error } = useAppSelector((state) => state.catalog);

  const debouncedSearch = useDebounce(filters.search, 350);

  useEffect(() => {
    dispatch(fetchCatalogMeta());
  }, [dispatch]);

  useEffect(() => {
    dispatch(
      fetchProducts({
        branchId,
        filters: { ...filters, search: debouncedSearch },
      }),
    );
    // Se re-consulta cuando cambia la sucursal o cualquier filtro (la busqueda, con debounce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dispatch,
    branchId,
    debouncedSearch,
    filters.categoryId,
    filters.dietaryTags,
    filters.excludeAllergens,
    filters.maxCalories,
    filters.minProtein,
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6 lg:py-12">
      <div className="relative mb-8 overflow-hidden rounded-[1.75rem] bg-brand-800 px-6 py-8 text-white sm:px-9 sm:py-10"><div className="absolute -right-8 -top-16 size-64 rounded-full bg-brand-500/30 blur-3xl" /><div className="relative"><span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-200"><Leaf className="size-3.5" /> Menu Verde</span><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Encuentra tu favorito saludable</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">Filtra por tus objetivos, preferencias o alergenos. Nutricion transparente y sabor de verdad en cada plato.</p></div></div>

      {!branchId && (
        <Card className="mb-6 flex flex-col gap-3 border-dashed sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-accent-500" />
            <CardDescription>
              Todavia no sabemos donde estas. Elige tu direccion para confirmar que podemos
              prepararte estos platos y entregartelos.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={openLocationModal} className="shrink-0">
            Elegir direccion
          </Button>
        </Card>
      )}

      <CatalogFiltersBar />

      <div className="mt-8">
        {status === 'loading' && products.length === 0 && <PageLoader />}

        {status === 'failed' && (
          <Card className="border-red-200 bg-red-50">
            <CardDescription className="text-red-700">
              {error ?? 'No se pudo cargar el menu'}
            </CardDescription>
          </Card>
        )}

        {status !== 'loading' && products.length === 0 && (
          <Card className="flex flex-col items-center gap-2 border-dashed py-12 text-center">
            <SearchX className="size-8 text-ink-muted" />
            <CardDescription>
              No encontramos platos con esos filtros. Prueba quitando alguno.
            </CardDescription>
          </Card>
        )}

        {products.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between"><p className="text-sm font-medium text-ink-muted">{products.length} platos disponibles</p><span className="hidden items-center gap-1.5 text-xs text-brand-600 sm:flex"><Sparkles className="size-3.5" /> Preparados al momento</span></div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MenuPage;
