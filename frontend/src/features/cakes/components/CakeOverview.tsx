import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Pagination } from '@components/ui/Pagination';
import { ROUTES } from '@constants/routes';
import type { CakeConfiguration } from '../cakes.service';
import { CakeCreator } from './CakeCreator';

type VisibilityFilter = 'all' | 'visible' | 'pending';
type ModeFilter = 'all' | CakeConfiguration['profile']['saleMode'];
type SortOrder = 'name' | 'nameDesc' | 'pending';

const PAGE_SIZE = 10;
const MODE_LABELS: Record<CakeConfiguration['profile']['saleMode'], string> = {
  STANDARD: 'Sin personalización', SEMI_CUSTOM: 'Personalizable', ADVANCED: 'Diseño especial',
};

const isVisible = (entry: CakeConfiguration) => entry.product.status === 'ACTIVE'
  && entry.profile.isActive && Boolean(entry.product.allergensReviewedAt);

const pendingSteps = (entry: CakeConfiguration) => [
  ...(entry.product.status !== 'ACTIVE'
    ? [entry.product.status === 'DRAFT' ? 'Activar el producto en Catálogo.' : 'Volver a activar el producto en Catálogo.']
    : []),
  ...(!entry.product.allergensReviewedAt
    ? ['Clasificar en Inventario los insumos de las recetas y opciones; los alérgenos se calculan automáticamente.']
    : []),
  ...(!entry.profile.isActive ? ['Activar el perfil y guardar las reglas en Recetas y tiempos.'] : []),
];

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export const CakeOverview = ({ config, canCreate, canEditRules, canOpenCatalog, onCreated, onRecipes }: {
  config: CakeConfiguration[];
  canCreate: boolean;
  canEditRules: boolean;
  canOpenCatalog: boolean;
  onCreated: () => Promise<void>;
  onRecipes: (productId: number, panel?: 'recipe' | 'timings') => void;
}) => {
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [mode, setMode] = useState<ModeFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('name');
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);
  const visibleCount = config.filter(isVisible).length;
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return config.filter((entry) => {
      if (visibility === 'visible' && !isVisible(entry)) return false;
      if (visibility === 'pending' && isVisible(entry)) return false;
      if (mode !== 'all' && entry.profile.saleMode !== mode) return false;
      return !term || normalize(`${entry.product.name} ${entry.product.slug} ${entry.product.category?.name ?? ''}`).includes(term);
    }).sort((a, b) => {
      if (sortOrder === 'pending' && isVisible(a) !== isVisible(b)) return isVisible(a) ? 1 : -1;
      const byName = a.product.name.localeCompare(b.product.name, 'es', { sensitivity: 'base' });
      return sortOrder === 'nameDesc' ? -byName : byName;
    });
  }, [config, mode, query, sortOrder, visibility]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);
  const updateQuery = (value: string) => { setQuery(value); setPage(1); };
  const updateVisibility = (value: VisibilityFilter) => { setVisibility(value); setPage(1); };
  const updateMode = (value: ModeFilter) => { setMode(value); setPage(1); };
  const changePage = (next: number) => { setPage(next); listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="space-y-5">
      {canCreate && <><div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4"><p className="text-sm text-ink-muted">Para postres, turrones y bocaditos, crea el producto en Catálogo y configura aquí su receta y preparación.</p><Button component={Link} to={ROUTES.adminCatalog} variant="outline" size="sm">Abrir Catálogo</Button></div><CakeCreator onCreated={onCreated} /></>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-ink">Productos configurados</h2>
          <p className="mt-1 text-sm text-ink-muted">Busca un producto, completa lo pendiente y publícala desde Catálogo.</p>
        </div>
        {canOpenCatalog && <Button className="w-full sm:w-auto" size="sm" variant="outline" component={Link} to={ROUTES.adminCatalog}>Abrir Catálogo</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Resumen de tortas">
        <Card shadow="none" className="border-line p-4 sm:p-5"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Perfiles creados</p><p className="mt-1 text-2xl font-black text-ink">{config.length}</p><p className="mt-1 text-xs text-ink-muted">Tortas con reglas de producción.</p></Card>
        <Card shadow="none" className="border-green-200 bg-green-50/50 p-4 sm:p-5"><p className="text-xs font-bold uppercase tracking-wide text-green-800">Visibles en la web</p><p className="mt-1 text-2xl font-black text-green-900">{visibleCount}</p><p className="mt-1 text-xs text-green-800/80">Pueden recibir pedidos segón su disponibilidad.</p></Card>
        <Card shadow="none" className="border-amber-200 bg-amber-50/50 p-4 sm:p-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Pendientes</p><p className="mt-1 text-2xl font-black text-amber-900">{config.length - visibleCount}</p><p className="mt-1 text-xs text-amber-800/80">Revisa lo que falta antes de publicar.</p></Card>
      </div>
      <div ref={listTopRef}><Card className="overflow-hidden p-0">
        <div className="grid gap-3 border-b border-line bg-surface-muted/30 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="block text-xs font-bold text-ink-muted">
            Buscar producto
            <span className="relative mt-1 block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Nombre, categoría o enlace" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm font-normal text-ink" />
            </span>
          </label>
          <label className="block text-xs font-bold text-ink-muted">Publicación
            <select value={visibility} onChange={(event) => updateVisibility(event.target.value as VisibilityFilter)} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink">
              <option value="all">Todas</option><option value="visible">Visibles en la web</option><option value="pending">Pendientes</option>
            </select>
          </label>
          <label className="block text-xs font-bold text-ink-muted">Modo de venta
            <select value={mode} onChange={(event) => updateMode(event.target.value as ModeFilter)} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink">
              <option value="all">Todos</option>{Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-ink-muted">Ordenar
            <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as SortOrder); setPage(1); }} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink">
              <option value="name">Nombre: A a Z</option><option value="nameDesc">Nombre: Z a A</option><option value="pending">Pendientes primero</option>
            </select>
          </label>
        </div>
        {config.length === 0 ? (
          <div className="p-8 text-center"><p className="font-bold">Todavía no hay perfiles de torta.</p><p className="mt-1 text-sm text-ink-muted">Crea un borrador arriba para comenzar.</p></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center"><p className="font-bold">No hay productos con estos filtros.</p><p className="mt-1 text-sm text-ink-muted">Prueba otro nombre o cambia los filtros.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => { updateQuery(''); updateVisibility('all'); updateMode('all'); }}>Limpiar filtros</Button></div>
        ) : (
          <ul className="divide-y divide-line" aria-label="Productos configurados">
            {pageItems.map((entry) => {
              const visible = isVisible(entry);
              const steps = pendingSteps(entry);
              return <li key={entry.product.id} className="p-4 transition-colors hover:bg-surface-muted/50 sm:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
                  <div className="min-w-0"><h3 className="truncate text-base font-black text-ink" title={entry.product.name}>{entry.product.name}</h3><p className="mt-1 truncate text-xs text-ink-muted">{entry.product.category?.name ?? 'Sin categoría'} · {entry.product.slug}</p></div>
                  <div><Badge variant={visible ? 'success' : 'warning'}>{visible ? 'Visible en la web' : 'Pendiente de publicación'}</Badge><p className="mt-1 text-xs text-ink-muted">{entry.product.status === 'DRAFT' ? 'Borrador' : entry.product.status === 'INACTIVE' ? 'Producto inactivo' : entry.profile.isActive ? 'Perfil activo' : 'Perfil inactivo'}</p></div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><div><dt className="text-ink-muted">Modo</dt><dd className="font-semibold text-ink">{MODE_LABELS[entry.profile.saleMode]}</dd></div><div><dt className="text-ink-muted">Anticipación</dt><dd className="font-semibold text-ink">{entry.profile.minLeadHours} h</dd></div><div><dt className="text-ink-muted">Presentaciones</dt><dd className="font-semibold text-ink">{entry.variants.length}</dd></div><div><dt className="text-ink-muted">Opciones</dt><dd className="font-semibold text-ink">{entry.options.length}</dd></div></dl>
                </div>
                {!visible && <details className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><summary className="cursor-pointer font-bold">Qué falta para publicarlo ({steps.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{steps.map((step) => <li key={step}>{step}</li>)}</ul></details>}
                <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap">
                  {canEditRules && <><Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => onRecipes(entry.product.id, 'recipe')}>Receta e insumos</Button><Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => onRecipes(entry.product.id, 'timings')}>Tiempos y reglas</Button></>}
                  {canEditRules && entry.profile.saleMode === 'SEMI_CUSTOM' && <Button className="w-full sm:w-auto" size="sm" variant="outline" component={Link} to={`${ROUTES.adminBuilder}?productId=${entry.product.id}`}>Opciones</Button>}
                  {canOpenCatalog && <Button className="w-full sm:w-auto" size="sm" variant="outline" component={Link} to={`${ROUTES.adminCatalog}?producto=${entry.product.id}`}>Ficha en Catálogo</Button>}
                  {visible && <Button className="w-full sm:w-auto" size="sm" variant="ghost" component={Link} to={ROUTES.cake(entry.product.slug)}>Ver en la web</Button>}
                </div>
              </li>;
            })}
          </ul>
        )}
        {filtered.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-muted/50 px-4 py-3 text-xs text-ink-muted sm:px-5">
          <p aria-live="polite">Mostrando {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} de {filtered.length} tortas{filtered.length !== config.length ? ` (${config.length} en total)` : ''}</p>
          <Pagination page={currentPage} totalPages={pageCount} onChange={changePage} />
        </div>}
      </Card></div>
    </section>
  );
};
