import { useLiveRefresh } from '@services/realtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  CakeSlice,
  ChevronDown,
  Clock3,
  Cookie,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  UtensilsCrossed,
  WandSparkles,
} from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { useAppState } from '@context/AppStateContext';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { EmptyState } from '@components/common/EmptyState';
import { getApiErrorMessage } from '@services/api/client';
import { BranchPrompt } from '../components/BranchPrompt';
import { MenuHero } from '../components/MenuHero';
import { ProductCard } from '../components/ProductCard';
import { ProductGridSkeleton } from '../components/ProductCardSkeleton';
import { catalogApi } from '../services/catalog.service';
import { productImage } from '../productImage';
import type { Category, Product } from '../types';
import type { ProductFamily } from '../pastry';

type Collection = 'ALL' | 'CAKE' | 'CUSTOM' | '24H' | 'DESSERT' | 'NOUGAT' | 'BITES' | 'STANDARD';
type FamilyKey = 'ALL' | ProductFamily;
type SortMode = 'FEATURED' | 'BEST_SELLERS' | 'PRICE' | 'PRICE_DESC';

const COLLECTION_IDS: Collection[] = ['ALL', 'CAKE', 'CUSTOM', '24H', 'DESSERT', 'NOUGAT', 'BITES', 'STANDARD'];

const FAMILY_LABELS: Record<FamilyKey, string> = {
  ALL: 'Todo el menú',
  CAKE: 'Tortas',
  DESSERT: 'Postres',
  NOUGAT: 'Turrones',
  BITES: 'Bocaditos',
};

const FAMILY_DESCRIPTIONS: Record<FamilyKey, string> = {
  ALL: 'Explora el catálogo completo y encuentra algo para cada celebración.',
  CAKE: 'Tortas clásicas y personalizables para celebrar sin complicarte.',
  DESSERT: 'Porciones dulces para disfrutar hoy o acompañar una reunión.',
  NOUGAT: 'Elige entre nuestros turrones y sus distintas presentaciones.',
  BITES: 'Bocaditos listos para compartir en reuniones y celebraciones.',
};

const matchesCollection = (product: Product, collection: Collection) => {
  if (product.cakeSaleMode === 'ADVANCED') return false;
  const family = product.family ?? 'CAKE';
  if (collection === 'CUSTOM') return family === 'CAKE' && product.cakeSaleMode === 'SEMI_CUSTOM';
  if (collection === '24H') return family === 'CAKE' && product.preparationMode !== 'READY_STOCK' && product.minLeadHours === 24;
  if (collection === 'STANDARD') return product.cakeSaleMode === 'STANDARD';
  if (collection === 'CAKE') return family === 'CAKE';
  if (collection === 'ALL') return true;
  return family === collection;
};

const familyForCollection = (collection: Collection): FamilyKey => {
  if (collection === 'DESSERT' || collection === 'NOUGAT' || collection === 'BITES') return collection;
  if (collection === 'CUSTOM' || collection === '24H' || collection === 'STANDARD' || collection === 'CAKE') return 'CAKE';
  return 'ALL';
};

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE');

const descendantIds = (categoryId: number, categories: Category[]) => {
  const ids = new Set<number>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    categories.forEach((category) => {
      if (category.parentId !== null && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    });
  }
  return ids;
};

const MenuPage = () => {
  const { branchId, address, pickupBranch, deliveryType, openLocationModal } = useAppState();
  const [params, setParams] = useSearchParams();
  const requestedMode = params.get('modo');
  const requestedCollectionRaw = params.get('coleccion');
  const requestedCollection = requestedCollectionRaw as Collection | null;
  const businessRedirect = requestedCollectionRaw === 'DESIGNS' || requestedMode === 'ADVANCED';
  const collection: Collection = requestedCollection && COLLECTION_IDS.includes(requestedCollection)
    ? requestedCollection
    : ['CUSTOM', 'SEMI_CUSTOM'].includes(requestedMode ?? '') ? 'CUSTOM'
      : requestedMode === 'STANDARD' ? 'STANDARD' : 'ALL';
  const activeFamily = familyForCollection(collection);
  const categoryId = Number(params.get('categoria')) || null;
  const sugarFree = params.get('sin-azucar') === '1';
  const preparation = params.get('preparacion') ?? '';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('FEATURED');
  const [filtersOpen, setFiltersOpen] = useState(Boolean(categoryId || preparation || sugarFree));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(12);
  const loadSequence = useRef(0);
  const hasProductsRef = useRef(false);

  const loadCatalog = useCallback(async (background = false) => {
    const request = ++loadSequence.current;
    let retryScheduled = false;
    let attempts = 0;
    if (background && hasProductsRef.current) setRefreshing(true);
    else setLoading(true);
    setError('');

    const load = async (): Promise<void> => {
      try {
        const [rows, groups] = await Promise.all([
          catalogApi.getProducts({ branchId, sort: 'BEST_SELLERS' }),
          catalogApi.getCategories(),
        ]);
        if (request !== loadSequence.current) return;
        setProducts(rows);
        setCategories(groups);
        hasProductsRef.current = rows.length > 0;
      } catch (cause) {
        if (request !== loadSequence.current) return;
        if (axios.isAxiosError(cause) && cause.response?.status === 503 && attempts++ < 30) {
          retryScheduled = true;
          setTimeout(() => { retryScheduled = false; void load(); }, 2000);
          return;
        }
        setError(getApiErrorMessage(cause));
      } finally {
        if (!retryScheduled && request === loadSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    await load();
  }, [branchId]);

  useLiveRefresh(['catalog', 'inventory'], () => loadCatalog(true), { enabled: !businessRedirect });

  const updateFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next);
  };

  const chooseCategory = (id: number | null) => {
    const next = new URLSearchParams(params);
    next.delete('modo');
    next.delete('coleccion');
    if (id === null) next.delete('categoria');
    else next.set('categoria', String(id));
    setParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (collection !== 'ALL') next.set('coleccion', collection);
    setParams(next);
    setSearch('');
  };

  useEffect(() => {
    if (!businessRedirect) void loadCatalog();
    return () => { loadSequence.current += 1; };
  }, [businessRedirect, loadCatalog]);

  const scopedProducts = useMemo(
    () => products.filter((product) => matchesCollection(product, collection)),
    [products, collection],
  );

  const availableProductCount = useMemo(
    () => scopedProducts.filter((product) => product.isAvailable).length,
    [scopedProducts],
  );

  const minimumCakePrice = useMemo(() => {
    const prices = scopedProducts
      .filter((product) => product.family === 'CAKE' && product.isAvailable && product.priceFrom > 0)
      .map((product) => product.priceFrom);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, [scopedProducts]);

  const spotlightProduct = useMemo(() => [...scopedProducts]
    .filter((product) => product.isAvailable)
    .sort((left, right) => (right.salesCount ?? 0) - (left.salesCount ?? 0) || Number(right.isFeatured) - Number(left.isFeatured) || left.name.localeCompare(right.name, 'es'))[0] ?? null, [scopedProducts]);

  const categoryHighlights = useMemo(() => {
    const highlights = new Map<number, Product>();
    products
      .filter((product) => product.cakeSaleMode !== 'ADVANCED')
      .sort((left, right) => (right.salesCount ?? 0) - (left.salesCount ?? 0) || Number(right.isFeatured) - Number(left.isFeatured))
      .forEach((product) => {
        if (!highlights.has(product.categoryId)) highlights.set(product.categoryId, product);
      });
    return highlights;
  }, [products]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    categories.forEach((category) => {
      const scope = descendantIds(category.id, categories);
      counts.set(category.id, scopedProducts.filter((product) => scope.has(product.categoryId)).length);
    });
    return counts;
  }, [categories, scopedProducts]);

  const categoryRoots = useMemo(() => categories
    .filter((category) => category.parentId === null && (categoryCounts.get(category.id) ?? 0) > 0)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'es')), [categories, categoryCounts]);

  const activeRootId = useMemo(() => {
    if (categoryId) return categoryRoots.find((category) => descendantIds(category.id, categories).has(categoryId))?.id ?? categoryId;
    if (collection === 'ALL') return null;
    return categoryRoots.find((category) => scopedProducts.some((product) => descendantIds(category.id, categories).has(product.categoryId)))?.id ?? null;
  }, [categories, categoryId, categoryRoots, collection, scopedProducts]);

  const categoryOptions = useMemo(() => {
    const options = categoryId
      ? categories.filter((category) => category.parentId === categoryId && (categoryCounts.get(category.id) ?? 0) > 0)
      : activeFamily !== 'ALL'
        ? categories.filter((category) => (categoryCounts.get(category.id) ?? 0) > 0 && !categories.some((child) => child.parentId === category.id && (categoryCounts.get(child.id) ?? 0) > 0))
        : [];
    return options.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'es'));
  }, [activeFamily, categoryId, categories, categoryCounts]);

  const categoryFilterOptions = useMemo(() => categories
    .filter((category) => (categoryCounts.get(category.id) ?? 0) > 0)
    .filter((category) => !categories.some((child) => child.parentId === category.id && (categoryCounts.get(child.id) ?? 0) > 0))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'es')), [categories, categoryCounts]);

  const categoryScope = useMemo(
    () => (categoryId ? descendantIds(categoryId, categories) : null),
    [categoryId, categories],
  );

  const visible = useMemo(() => products
    .filter((product) => matchesCollection(product, collection))
    .filter((product) => (!categoryScope || categoryScope.has(product.categoryId)))
    .filter((product) => (!sugarFree || product.dietaryTags.includes('sin-azucar')))
    .filter((product) => (!preparation || product.preparationMode === preparation))
    .filter((product) => searchable(`${product.name} ${product.description ?? ''}`).includes(searchable(search.trim())))
    .sort((left, right) => {
      if (sort === 'PRICE') return left.priceFrom - right.priceFrom;
      if (sort === 'PRICE_DESC') return right.priceFrom - left.priceFrom;
      if (sort === 'BEST_SELLERS') return (right.salesCount ?? 0) - (left.salesCount ?? 0) || Number(right.isFeatured) - Number(left.isFeatured);
      return Number(right.isFeatured) - Number(left.isFeatured) || (right.salesCount ?? 0) - (left.salesCount ?? 0) || left.name.localeCompare(right.name, 'es');
    }), [products, collection, categoryScope, sugarFree, preparation, search, sort]);

  useEffect(() => {
    setVisibleLimit(12);
  }, [collection, categoryId, sugarFree, preparation, search, sort]);

  const visibleProducts = visible.slice(0, visibleLimit);

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const hasFilters = collection !== 'ALL' || categoryId !== null || sugarFree || preparation !== '' || search !== '';
  const resultCount = visible.length;
  const extraFilterCount = Number(categoryId !== null) + Number(preparation !== '') + Number(sugarFree);
  const selectedLocation = branchId ? (deliveryType === 'PICKUP' ? pickupBranch?.name : address?.line1) : undefined;
  const sectionLabel = selectedCategory?.name ?? FAMILY_LABELS[activeFamily];

  if (businessRedirect) return <Navigate to={ROUTES.business} replace />;

  return (
    <section id="menu-page" aria-labelledby="catalog-title">
      <MenuHero
        customView={collection === 'CUSTOM'}
        spotlightProduct={spotlightProduct}
        availableProductCount={availableProductCount}
        minimumCakePrice={minimumCakePrice}
      />

      <div id="catalogo" className="container-shell scroll-mt-24 py-8 sm:py-12">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-brand-700">Explora a tu ritmo</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">¿Qué te provoca hoy?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Elige una familia de productos y luego revisa sus tipos disponibles. Así encuentras exactamente lo que buscas.</p>
          </div>
          <BranchPrompt onChooseLocation={openLocationModal} selectedLocation={selectedLocation} />
        </div>

        <nav aria-label="Categorías principales" className="mt-8 rounded-[28px] border border-[#e9e1d6] bg-[#fffdfa] p-4 shadow-[0_14px_40px_rgba(57,39,27,0.08)] sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <p className="text-[11px] font-black uppercase tracking-[.16em] text-brand-700">Elige tu antojo</p>
              </div>
              <h3 className="mt-3 text-xl font-black tracking-tight text-ink sm:text-2xl">Compra por categoría</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">Encuentra la opción ideal para tu celebración, desde una torta personalizada hasta un detalle listo para compartir.</p>
            </div>
            <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-[#f7efe7] px-3 py-1.5 text-xs font-bold text-[#735746]">
              {loading ? 'Cargando…' : `${categoryRoots.length} categorías`}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <button
              type="button"
              aria-pressed={activeRootId === null}
              onClick={() => chooseCategory(null)}
              className={`group relative min-h-[136px] overflow-hidden rounded-2xl border p-4 text-left transition duration-200 ${activeRootId === null ? 'border-brand-800 bg-brand-800 text-white shadow-[0_10px_24px_rgba(31,72,111,0.22)]' : 'border-[#e8e0d5] bg-white text-ink hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2'}`}
            >
              {spotlightProduct && (spotlightProduct.imageUrl ?? spotlightProduct.categoryImageUrl) && (
                <span className="absolute right-3 top-3 size-12 overflow-hidden rounded-full border-4 border-white/70 opacity-90 shadow-sm">
                  <img src={productImage(spotlightProduct) ?? ''} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-110" />
                </span>
              )}
              <span className={`relative grid size-9 place-items-center rounded-xl ${activeRootId === null ? 'bg-white/15 text-accent-200' : 'bg-brand-50 text-brand-700'}`}>
                <UtensilsCrossed className="size-4.5" aria-hidden="true" />
              </span>
              <span className="relative mt-5 block text-sm font-black leading-tight">Todo el menú</span>
              <span className={`relative mt-2 block text-[11px] leading-4 ${activeRootId === null ? 'text-brand-100' : 'text-ink-muted'}`}>{loading ? 'Cargando opciones' : `${products.length} productos`}</span>
            </button>

            {categoryRoots.map((category) => {
              const active = activeRootId === category.id;
              const highlight = categoryHighlights.get(category.id) ?? products.find((product) => descendantIds(category.id, categories).has(product.categoryId));
              const highlightImage = category.imageUrl ?? (highlight ? productImage(highlight) : null);
              const Icon = category.slug.includes('torta') ? CakeSlice : category.slug.includes('post') ? Cookie : Sparkles;
              const count = categoryCounts.get(category.id) ?? 0;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseCategory(active ? null : category.id)}
                  className={`group relative min-h-[136px] overflow-hidden rounded-2xl border p-4 text-left transition duration-200 ${active ? 'border-brand-800 bg-brand-800 text-white shadow-[0_10px_24px_rgba(31,72,111,0.22)]' : 'border-[#e8e0d5] bg-white text-ink hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e2'}`}
                >
                  {highlightImage && (
                    <span className="absolute right-3 top-3 size-12 overflow-hidden rounded-full border-4 border-white/70 opacity-90 shadow-sm">
                      <img src={highlightImage} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-110" />
                    </span>
                  )}
                  <span className={`relative grid size-9 place-items-center rounded-xl ${active ? 'bg-white/15 text-accent-200' : 'bg-brand-50 text-brand-700 group-hover:bg-accent-50 group-hover:text-accent-700'}`}>
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="relative mt-5 block truncate text-sm font-black leading-tight">{category.name}</span>
                  <span className={`relative mt-2 block text-[11px] leading-4 ${active ? 'text-brand-100' : 'text-ink-muted'}`}>{count} producto{count === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col justify-between gap-3 border-t border-[#eee6dc] pt-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-black text-ink">¿Buscas algo especial?</p>
              <p className="mt-0.5 text-xs text-ink-muted">Personaliza una torta o elige una opción lista para entregar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button component={Link} to={ROUTES.menuMode('CUSTOM')} size="sm" variant="outline" leftIcon={<WandSparkles size={15} />}>Diseña tu torta</Button>
              <Button component={Link} to={ROUTES.menuMode('STANDARD')} size="sm" variant="ghost" leftIcon={<Clock3 size={15} />}>Ver tortas listas</Button>
            </div>
          </div>
        </nav>

        <section className="sticky top-16 z-20 mt-8 rounded-card border border-line bg-white shadow-e2 lg:top-[72px]" aria-label="Buscar y filtrar productos">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                type="search"
                aria-label="Buscar producto"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Busca por nombre, sabor o ingrediente"
                startAdornment={<Search className="size-4.5 text-ink-muted" />}
              />
              <div className="flex gap-2">
                <Button
                  variant={filtersOpen ? 'primary' : 'outline'}
                  aria-expanded={filtersOpen}
                  aria-controls="catalog-extra-filters"
                  onClick={() => setFiltersOpen((open) => !open)}
                  leftIcon={<SlidersHorizontal className="size-4" />}
                  className="shrink-0"
                  sx={{ minHeight: 52 }}
                >
                  Filtros{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}<ChevronDown className={`ml-1 size-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                </Button>
                {hasFilters && <button type="button" onClick={clearFilters} className="min-h-11 whitespace-nowrap rounded-field px-3 text-sm font-bold text-brand-700 underline underline-offset-4">Limpiar</button>}
              </div>
            </div>

            {categoryOptions.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Tipos de {(selectedCategory?.name ?? FAMILY_LABELS[activeFamily]).toLocaleLowerCase('es-PE')}</p>
                    <p className="mt-1 text-sm text-ink-muted">Selecciona una subcategoría para ver solo esos productos.</p>
                  </div>
                  {selectedCategory && <span className="text-xs font-bold text-brand-700">Viendo: {selectedCategory.name}</span>}
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {categoryOptions.map((category) => {
                    const active = categoryId === category.id;
                    const count = categoryCounts.get(category.id) ?? 0;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => chooseCategory(active ? null : category.id)}
                        className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition ${active ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-400 hover:bg-brand-50'}`}
                      >
                        {category.name}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-700'}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div id="catalog-extra-filters" hidden={!filtersOpen}>
              <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <Select label="Tipo de producto" value={categoryId ? String(categoryId) : ''} onChange={(event) => updateFilter('categoria', event.target.value)}>
                  <SelectOption value="">Todos los tipos</SelectOption>
                  {categoryFilterOptions.map((category) => <SelectOption key={category.id} value={String(category.id)}>{category.name}</SelectOption>)}
                </Select>
                <Select label="Preparación" value={preparation} onChange={(event) => updateFilter('preparacion', event.target.value)}>
                  <SelectOption value="">Todas</SelectOption>
                  <SelectOption value="MADE_TO_ORDER">Por encargo</SelectOption>
                  <SelectOption value="READY_STOCK">Producto preparado</SelectOption>
                </Select>
                <button type="button" aria-pressed={sugarFree} onClick={() => updateFilter('sin-azucar', sugarFree ? '' : '1')} className={`min-h-11 self-end rounded-field border px-3.5 py-2.5 text-left text-sm font-bold transition ${sugarFree ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50'}`}>
                  {sugarFree ? '✓ ' : ''}Opciones sin azúcar
                </button>
              </div>
            </div>
          </div>
        </section>

        {collection === '24H' && <p role="note" className="mt-5 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm leading-6 text-accent-900"><strong>Pide con al menos 24 horas de anticipación.</strong> Confirmaremos la fecha según la capacidad del taller.</p>}

        <div className="mb-6 mt-10 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">{sectionLabel}</p>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-ink" aria-live="polite">
              {loading && !products.length ? 'Preparando algo especial…' : error && !products.length ? 'Explora nuestros productos' : `${resultCount} producto${resultCount === 1 ? '' : 's'} para elegir`}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{selectedCategory?.description ?? FAMILY_DESCRIPTIONS[activeFamily]}</p>
          </div>
          {refreshing && <span className="text-xs font-semibold text-brand-700" role="status">Actualizando disponibilidad…</span>}
          <div className="w-full sm:w-56">
            <Select label="Ordenar" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <SelectOption value="FEATURED">Recomendados</SelectOption>
              <SelectOption value="BEST_SELLERS">Más vendidos</SelectOption>
              <SelectOption value="PRICE">Menor precio</SelectOption>
              <SelectOption value="PRICE_DESC">Mayor precio</SelectOption>
            </Select>
          </div>
        </div>

        {error && products.length === 0 ? (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
            <p>{error}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void loadCatalog()}>Reintentar</Button>
          </div>
        ) : loading && products.length === 0 ? (
          <div role="status" aria-label="Cargando el catálogo"><ProductGridSkeleton count={6} /></div>
        ) : resultCount ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">
              {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
            {visible.length > visibleProducts.length && (
              <div className="mt-8 flex justify-center">
                <Button variant="outline" onClick={() => setVisibleLimit((limit) => limit + 12)}>
                  Ver {Math.min(12, visible.length - visibleProducts.length)} productos más
                </Button>
              </div>
            )}
          </>
        ) : error ? (
          <div role="status" className="rounded-xl border border-accent-200 bg-accent-50 p-4 text-sm leading-6 text-accent-900">
            No pudimos actualizar la disponibilidad. Mostramos la última información cargada.
            <button type="button" className="ml-2 font-bold underline underline-offset-2" onClick={() => void loadCatalog(true)}>Reintentar</button>
          </div>
        ) : (
          <EmptyState
            icon={hasFilters ? SearchX : CakeSlice}
            title={hasFilters ? 'No hay productos con esta selección' : 'Estamos preparando nuestro catálogo'}
            description={hasFilters ? 'Prueba otro tipo, cambia de familia o limpia los filtros para explorar lo disponible.' : 'Los productos aparecerán aquí cuando estén publicados y listos para recibir pedidos.'}
            action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Ver todo el menú</Button> : undefined}
          />
        )}
      </div>
    </section>
  );
};

export default MenuPage;
