import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  Info,
  Search,
  Salad,
  ShoppingBag,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Input } from '@components/ui/Input';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { removeFavorite, type FavoriteItem } from '../favoritesSlice';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';

type FavoriteFilter = 'ALL' | FavoriteItem['type'];

const FavoritesPage = () => {
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => state.favorites.items);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FavoriteFilter>('ALL');

  const counts = useMemo(() => ({
    ALL: items.length,
    FIXED: items.filter((item) => item.type === 'FIXED').length,
    CUSTOMIZABLE: items.filter((item) => item.type === 'CUSTOMIZABLE').length,
  }), [items]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-PE');
    return items.filter((item) => {
      const matchesType = filter === 'ALL' || item.type === filter;
      const matchesQuery = !normalizedQuery || item.name.toLocaleLowerCase('es-PE').includes(normalizedQuery);
      return matchesType && matchesQuery;
    });
  }, [filter, items, query]);

  const removeItem = (item: FavoriteItem) => {
    dispatch(removeFavorite(item.productId));
    toast.success(`${item.name} se quitó de tus favoritos`);
  };

  const resetView = () => {
    setQuery('');
    setFilter('ALL');
  };

  const filters: Array<{ value: FavoriteFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'FIXED', label: 'Del menú' },
    { value: 'CUSTOMIZABLE', label: 'Personalizables' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Actividad"
        title="Mis favoritos"
        description={items.length ? 'Encuentra rápidamente los bowls que guardaste para tu próxima compra.' : 'Guarda aquí los platos que más te gustan para encontrarlos rápidamente.'}
        icon={Heart}
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }, { label: 'Favoritos' }]}
        action={<Button component={Link} to={ROUTES.menu} variant="outline" leftIcon={<ShoppingBag className="size-4" />}>Explorar menú</Button>}
        className="mb-6"
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Todavía no tienes favoritos"
          description="Toca el corazón en cualquier plato del menú para guardarlo aquí."
          action={<Button component={Link} to={ROUTES.menu} leftIcon={<ShoppingBag className="size-4" />}>Ver el menú</Button>}
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-3 gap-2" aria-label="Resumen de favoritos">
            <FavoriteStat value={counts.ALL} label="Guardados" icon={Heart} highlighted />
            <FavoriteStat value={counts.FIXED} label="Del menú" icon={Utensils} />
            <FavoriteStat value={counts.CUSTOMIZABLE} label="Personalizables" icon={Sparkles} />
          </section>

          <section className="mb-5 rounded-card border border-line bg-white p-3 sm:p-4" aria-label="Buscar y filtrar favoritos">
            <Input
              label="Buscar en favoritos"
              placeholder="Nombre del bowl..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              startAdornment={<Search className="size-4 text-ink-muted" />}
            />
            <nav className="mt-3 overflow-x-auto border-t border-line" aria-label="Filtrar favoritos">
              <div className="flex min-w-max gap-1 pt-1">
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    aria-pressed={filter === item.value}
                    className={cn('relative flex min-h-11 items-center gap-2 px-3 text-sm font-bold transition', filter === item.value ? 'text-brand-800' : 'text-ink-muted hover:text-ink')}
                  >
                    {item.label}
                    <span className={cn('rounded-pill px-1.5 py-0.5 text-[10px]', filter === item.value ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted')}>{counts[item.value]}</span>
                    {filter === item.value && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-brand-700" />}
                  </button>
                ))}
              </div>
            </nav>
          </section>

          {/* El aviso explica el alcance real (una lista por navegador) y qué hacer para
            * llevarse una receta a otro dispositivo, en lugar de disculparse por el límite. */}
          <div className="mb-5 flex items-start gap-2 rounded-card border border-brand-100 bg-brand-50/55 p-3 text-xs leading-5 text-brand-900">
            <Info className="mt-0.5 size-4 shrink-0" /> Esta lista es de este navegador: marcar un corazón es instantáneo y no depende de la conexión. Para tenerlo en cualquier dispositivo, guárdalo como bowl en tu cuenta desde el personalizador.
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              variant="inset"
              icon={Search}
              title="No encontramos favoritos"
              description="Prueba con otro nombre o vuelve a mostrar todos los bowls guardados."
              action={<Button variant="outline" onClick={resetView}>Limpiar búsqueda</Button>}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {filteredItems.map((item) => {
                const isBuilder = item.type === 'CUSTOMIZABLE';
                const to = isBuilder ? ROUTES.builder : ROUTES.product(item.slug);
                return (
                  <li key={item.productId}>
                    <Card className="group flex h-full flex-col overflow-hidden rounded-card p-0 transition hover:border-brand-200 hover:shadow-e3">
                      <div className="relative aspect-[16/9] overflow-hidden bg-brand-50">
                        <Link to={to} className="block size-full" aria-label={`Abrir ${item.name}`}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="size-full object-cover transition duration-300 group-hover:scale-[1.025]" />
                          ) : (
                            <span className="grid size-full place-items-center bg-gradient-to-br from-brand-100 to-brand-50"><Salad className="size-12 text-brand-400" /></span>
                          )}
                        </Link>
                        <span className="absolute bottom-3 left-3 rounded-pill border border-white/70 bg-white/95 px-2.5 py-1 text-[10px] font-extrabold text-ink shadow-sm">
                          {isBuilder ? 'Personalizable' : 'Plato del menú'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(item)}
                          className="absolute right-3 top-3 grid size-10 place-items-center rounded-field border border-white/70 bg-white/95 text-red-500 shadow-md transition hover:bg-red-50"
                          aria-label={`Quitar ${item.name} de favoritos`}
                        >
                          <Heart className="size-4 fill-current" />
                        </button>
                      </div>

                      <div className="flex flex-1 flex-col p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link to={to} className="font-extrabold leading-6 text-ink transition hover:text-brand-700">{item.name}</Link>
                            <p className="mt-1 text-xs font-semibold text-ink-muted">{isBuilder ? 'Combínalo a tu gusto' : 'Consulta opciones y detalles'}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] font-semibold text-ink-muted">{isBuilder ? 'Desde' : 'Precio'}</p>
                            <p className="font-black text-brand-800">{formatCurrency(item.priceFrom)}</p>
                          </div>
                        </div>

                        <div className="mt-auto flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <Button size="sm" variant="ghost" leftIcon={<Trash2 className="size-3.5" />} onClick={() => removeItem(item)}>Quitar</Button>
                          <Button component={Link} to={to} size="sm" className="w-full sm:w-auto" leftIcon={isBuilder ? <Sparkles className="size-3.5" /> : <Utensils className="size-3.5" />}>
                            {isBuilder ? 'Personalizar' : 'Ver y pedir'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

const FavoriteStat = ({ value, label, icon: Icon, highlighted = false }: {
  value: number;
  label: string;
  icon: typeof Heart;
  highlighted?: boolean;
}) => (
  <div className={cn('rounded-card border p-3 text-center sm:flex sm:items-center sm:gap-3 sm:text-left', highlighted ? 'border-brand-200 bg-brand-50' : 'border-line bg-white')}>
    <span className={cn('mx-auto grid size-8 place-items-center rounded-card sm:mx-0', highlighted ? 'bg-brand-700 text-white' : 'bg-surface-muted text-brand-700')}><Icon className={cn('size-4', highlighted && 'fill-current')} /></span>
    <div className="mt-2 min-w-0 sm:mt-0"><p className="text-lg font-black text-ink">{value}</p><p className="truncate text-[10px] font-semibold text-ink-muted sm:text-xs">{label}</p></div>
  </div>
);

export default FavoritesPage;
