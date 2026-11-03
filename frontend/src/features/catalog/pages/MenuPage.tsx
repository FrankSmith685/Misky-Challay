import { useLiveRefresh } from '@services/realtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, CakeSlice, ChevronDown, Clock3, Cookie, Search, SearchX, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { useAppState } from '@context/AppStateContext';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { EmptyState } from '@components/common/EmptyState';
import { getApiErrorMessage } from '@services/api/client';
import { BranchPrompt } from '../components/BranchPrompt';
import { ProductCard } from '../components/ProductCard';
import { ProductGridSkeleton } from '../components/ProductCardSkeleton';
import { catalogApi } from '../services/catalog.service';
import type { Category, Product } from '../types';

type Collection = 'ALL' | 'CUSTOM' | '24H' | 'DESSERT' | 'NOUGAT' | 'BITES' | 'STANDARD';
const COLLECTIONS = [
  { id: 'ALL', label: 'Todo el catálogo', icon: Cookie },
  { id: 'CUSTOM', label: 'Torta personalizada', icon: Sparkles },
  { id: '24H', label: 'Tortas 24 horas', icon: Clock3 },
  { id: 'DESSERT', label: 'Postres', icon: CakeSlice },
  { id: 'NOUGAT', label: 'Turrones', icon: Cookie },
  { id: 'BITES', label: 'Bocaditos', icon: Cookie },
] as const;

const matchesCollection = (product: Product, collection: Collection) => {
  if (product.cakeSaleMode === 'ADVANCED') return false;
  if (collection === 'CUSTOM') return (product.family ?? 'CAKE') === 'CAKE' && product.cakeSaleMode === 'SEMI_CUSTOM';
  if (collection === '24H') return (product.family ?? 'CAKE') === 'CAKE' && product.preparationMode !== 'READY_STOCK' && product.minLeadHours === 24;
  if (collection === 'STANDARD') return product.cakeSaleMode === 'STANDARD';
  return collection === 'ALL' || product.family === collection;
};
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE');

const MenuPage = () => {
  const { branchId, address, pickupBranch, deliveryType, openLocationModal } = useAppState();
  const [params, setParams] = useSearchParams();
  const requestedMode = params.get('modo');
  const requestedCollection = params.get('coleccion');
  const businessRedirect = requestedCollection === 'DESIGNS' || requestedMode === 'ADVANCED';
  const collection: Collection = requestedCollection && COLLECTIONS.some((entry) => entry.id === requestedCollection)
    ? requestedCollection as Collection
    : ['CUSTOM', 'SEMI_CUSTOM', 'ADVANCED'].includes(requestedMode ?? '') ? 'CUSTOM'
      : requestedMode === 'STANDARD' ? 'STANDARD' : 'ALL';
  const categoryId = Number(params.get('categoria')) || null;
  const sugarFree = params.get('sin-azucar') === '1';
  const preparation = params.get('preparacion') ?? '';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('FEATURED');
  const [filtersOpen, setFiltersOpen] = useState(Boolean(categoryId || preparation));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const categoryRailRef = useRef<HTMLDivElement>(null);
  useLiveRefresh(['catalog', 'inventory', 'coverage'], () => setRetry((value) => value + 1), { enabled: !businessRedirect });
  const updateFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next);
  };
  const chooseCollection = (value: Collection) => {
    const next = new URLSearchParams(params);
    next.delete('modo'); next.delete('categoria');
    if (value === 'ALL') next.delete('coleccion'); else next.set('coleccion', value);
    setParams(next);
  };
  const clearFilters = () => { setParams({}); setSearch(''); };
  const chooseCategory = (id: number) => {
    const next = new URLSearchParams(params);
    next.delete('coleccion');
    next.delete('modo');
    next.set('categoria', String(id));
    setParams(next);
  };
  const moveCategories = (direction: 'previous' | 'next') => {
    categoryRailRef.current?.scrollBy({ left: direction === 'next' ? 280 : -280, behavior: 'smooth' });
  };

  useEffect(() => {
    if (businessRedirect) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setLoading(true); setError('');
    const load = async () => {
      try {
        const [rows, groups] = await Promise.all([catalogApi.getProducts({ branchId }), catalogApi.getCategories()]);
        if (active) { setProducts(rows); setCategories(groups); setLoading(false); }
      } catch (cause) {
        if (!active) return;
        if (axios.isAxiosError(cause) && cause.response?.status === 503 && attempts++ < 30) { timer = setTimeout(() => void load(), 2000); return; }
        setError(getApiErrorMessage(cause)); setLoading(false);
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [branchId, retry, businessRedirect]);

  const visible = useMemo(() => products.filter((product) => matchesCollection(product, collection)
    && (!categoryId || product.categoryId === categoryId)
    && (!sugarFree || product.dietaryTags.includes('sin-azucar'))
    && (!preparation || product.preparationMode === preparation)
    && searchable(`${product.name} ${product.description ?? ''}`).includes(searchable(search.trim())))
    .sort((a, b) => sort === 'PRICE' ? a.priceFrom - b.priceFrom
      : sort === 'PRICE_DESC' ? b.priceFrom - a.priceFrom
        : Number(b.isFeatured) - Number(a.isFeatured) || a.name.localeCompare(b.name, 'es')), [products, collection, categoryId, sugarFree, preparation, search, sort]);
  const categoryCounts = useMemo(() => new Map(categories.map((category) => [category.id, products.filter((product) => product.categoryId === category.id).length])), [categories, products]);
  const hasFilters = collection !== 'ALL' || categoryId !== null || sugarFree || preparation !== '' || search !== '';
  const resultCount = visible.length;
  const extraFilterCount = Number(categoryId !== null) + Number(preparation !== '');
  const selectedLocation = branchId ? (deliveryType === 'PICKUP' ? pickupBranch?.name : address?.line1) : undefined;

  if (businessRedirect) return <Navigate to={ROUTES.business} replace />;

  return <section id="catalogo" className="container-shell py-8 sm:py-12" aria-labelledby="catalog-title">
    <header className="mb-7 border-b border-line pb-7 sm:mb-8">
      <div>
      <p className="flex items-center gap-3 text-xs font-extrabold uppercase tracking-[.16em] text-brand-700"><span className="h-px w-8 bg-accent-500" aria-hidden="true" />Pastelería Misky Challay</p>
      <h1 id="catalog-title" className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">Algo dulce para cada momento.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted sm:text-base">Una torta para celebrar, un postre para ti o algo dulce para compartir. Elige tu favorito y reserva la entrega.</p>
      </div>
    </header>

    <div className="relative overflow-hidden rounded-card border border-line bg-white p-4 shadow-sm sm:p-6">
      <div className="absolute inset-x-0 top-0 flex h-[3px]" aria-hidden="true"><span className="w-3/4 bg-brand-700" /><span className="flex-1 bg-accent-500" /></div>
      <div className="flex items-start gap-3">
        <Input type="search" aria-label="Buscar producto" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busca tortas, postres o sabores" startAdornment={<Search className="size-4.5 text-ink-muted" />} />
        <Button variant="outline" aria-expanded={filtersOpen} aria-controls="catalog-extra-filters" onClick={() => setFiltersOpen((open) => !open)} leftIcon={<SlidersHorizontal className="size-4" />} className="shrink-0" sx={{ minHeight: 52 }}>
          Filtros{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}<ChevronDown className={`ml-1 size-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </Button>
      </div>
      <div className="mb-3 mt-6 flex items-center justify-between gap-2"><p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-muted">Elige qué se te antoja</p><span className="text-[10px] text-ink-muted sm:hidden">Desliza para ver más →</span></div>
      <nav aria-label="Colecciones del catálogo" className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
        {COLLECTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={collection === id} onClick={() => chooseCollection(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-field border px-3.5 py-2.5 text-sm font-semibold transition ${collection === id ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-400 hover:bg-brand-50'}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{label}</button>)}
        <button type="button" aria-pressed={sugarFree} onClick={() => updateFilter('sin-azucar', sugarFree ? '' : '1')} className={`min-h-11 shrink-0 whitespace-nowrap rounded-field border px-3.5 py-2.5 text-sm font-semibold ${sugarFree ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink hover:bg-brand-50'}`}>Sin azúcar</button>
      </nav>
      <div id="catalog-extra-filters" hidden={!filtersOpen}>
        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Select label="Categoría" value={categoryId ? String(categoryId) : ''} onChange={(event) => updateFilter('categoria', event.target.value)}><SelectOption value="">Todas las categorías</SelectOption>{categories.map((category) => <SelectOption key={category.id} value={String(category.id)}>{category.name}</SelectOption>)}</Select>
          <Select label="Preparación" value={preparation} onChange={(event) => updateFilter('preparacion', event.target.value)}><SelectOption value="">Todas</SelectOption><SelectOption value="MADE_TO_ORDER">Por encargo</SelectOption><SelectOption value="READY_STOCK">Producto preparado</SelectOption></Select>
        </div>
      </div>
      {hasFilters && <div className="mt-4 flex justify-end"><button type="button" onClick={clearFilters} className="min-h-8 text-xs font-semibold text-brand-700 underline underline-offset-4">Limpiar filtros</button></div>}
    </div>

    {selectedLocation && <div className="mt-5"><BranchPrompt onChooseLocation={openLocationModal} selectedLocation={selectedLocation} /></div>}
    {categories.length > 0 && <section className="mt-7" aria-labelledby="category-carousel-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-brand-700">Explora por categoría</p>
          <h2 id="category-carousel-heading" className="mt-1 text-xl font-black text-ink">Elige algo dulce</h2>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button type="button" aria-label="Categorías anteriores" onClick={() => moveCategories('previous')} className="grid size-10 place-items-center rounded-full border border-line bg-white text-brand-700 transition hover:border-brand-400 hover:bg-brand-50"><ArrowLeft className="size-4" /></button>
          <button type="button" aria-label="Siguientes categorías" onClick={() => moveCategories('next')} className="grid size-10 place-items-center rounded-full border border-line bg-white text-brand-700 transition hover:border-brand-400 hover:bg-brand-50"><ArrowRight className="size-4" /></button>
        </div>
      </div>
      <div ref={categoryRailRef} className="-mx-4 flex gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'thin' }}>
        {categories.map((category) => {
          const active = categoryId === category.id && collection === 'ALL';
          const count = categoryCounts.get(category.id) ?? 0;
          return <button key={category.id} type="button" aria-pressed={active} onClick={() => chooseCategory(category.id)} className={`group relative flex min-w-[205px] shrink-0 items-end overflow-hidden rounded-card border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-w-[230px] ${active ? 'border-brand-700 ring-2 ring-brand-200' : 'border-line'}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-accent-50 via-surface-muted to-brand-50" />
            {category.imageUrl && <img src={category.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
            <div className="relative min-h-[118px] w-full p-4 text-white">
              <p className="text-lg font-black drop-shadow-sm">{category.name}</p>
              <p className="mt-1 text-xs font-semibold text-white/85">{count} producto{count === 1 ? '' : 's'}</p>
            </div>
          </button>;
        })}
      </div>
    </section>}
    {collection === '24H' && <p role="note" className="mt-5 text-sm leading-6 text-ink-muted"><strong className="text-ink">Pide con al menos 24 horas de anticipación.</strong> Confirmaremos la fecha según la capacidad del taller.</p>}
    {sugarFree && <p className="mt-5 text-sm leading-6 text-ink-muted">Selección identificada como «Sin azúcar» por el negocio. Revisa los ingredientes y alérgenos de cada producto.</p>}
    <div className="mb-6 mt-8 flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5 sm:mt-10">
      <div><p className="text-[11px] font-extrabold uppercase tracking-widest text-brand-700">Nuestro catálogo</p><h2 className="mt-1.5 text-xl font-extrabold sm:text-2xl" aria-live="polite">{loading ? 'Preparando algo especial…' : error ? 'Explora nuestros productos' : `${resultCount} producto${resultCount === 1 ? '' : 's'} para disfrutar`}</h2></div>
      <div className="w-full sm:w-56"><Select label="Ordenar" value={sort} onChange={(event) => setSort(event.target.value)}><SelectOption value="FEATURED">Recomendados</SelectOption><SelectOption value="PRICE">Menor precio</SelectOption><SelectOption value="PRICE_DESC">Mayor precio</SelectOption></Select></div>
    </div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800"><p>{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button></div>
      : loading ? <div role="status" aria-label="Cargando el catálogo"><ProductGridSkeleton count={6} /></div>
        : resultCount ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          : <EmptyState icon={hasFilters ? SearchX : CakeSlice} title={hasFilters ? 'No hay productos con esta selección' : 'Estamos preparando nuestro catálogo'} description={hasFilters ? 'Prueba otra categoría o limpia los filtros para explorar lo disponible.' : 'Los productos aparecerán aquí cuando estén publicados y listos para recibir pedidos.'} action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Ver todo el catálogo</Button> : undefined} />}
  </section>;
};
export default MenuPage;
