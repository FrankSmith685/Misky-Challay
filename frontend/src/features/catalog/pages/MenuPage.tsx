import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Heart, MapPin, Store, UserCheck, X } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ProductMedia } from '@components/ui/ProductMedia';
import { useAppDispatch } from '@app/hooks';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { BranchPrompt } from '../components/BranchPrompt';
import { CatalogFiltersBar } from '../components/CatalogFiltersBar';
import { CatalogResults } from '../components/CatalogResults';
import { MenuHero } from '../components/MenuHero';
import { setFilters } from '../catalogSlice';
import { useMenuCatalog } from '../hooks/useMenuCatalog';

/** Menú público con contexto de ubicación, filtros progresivos y catálogo real. */
const MenuPage = () => {
  const dispatch = useAppDispatch();
  const {
    products,
    status,
    error,
    retry,
    tags,
    allergens,
    filters,
    favorites,
    declaredAllergens,
    appliedPreferences,
    clearPreferenceFilters,
    dismissPreferencesNotice,
    branchId,
    openLocationModal,
    address,
    pickupBranch,
    deliveryType,
  } = useMenuCatalog();
  const isPickup = deliveryType === 'PICKUP';
  const destination = isPickup ? pickupBranch?.name : address?.label;

  // El aviso explica el filtro con las palabras del perfil, no con códigos.
  const preferenceLabels = useMemo(() => {
    if (!appliedPreferences) return [];
    return [
      ...appliedPreferences.allergens.map((code) => {
        const name = allergens.find((allergen) => allergen.code === code)?.name ?? code;
        return `sin ${name.toLocaleLowerCase('es-PE')}`;
      }),
      ...appliedPreferences.dietaryTags.map(
        (code) => tags.find((tag) => tag.code === code)?.name ?? code,
      ),
    ];
  }, [allergens, appliedPreferences, tags]);

  const allergenAlerts = useMemo(
    () => allergens.filter((allergen) => declaredAllergens.includes(allergen.code)),
    [allergens, declaredAllergens],
  );

  return (
    <>
      <MenuHero />

      <section id="catalogo" className="relative scroll-mt-20 overflow-hidden bg-surface-muted pb-24 pt-10 sm:pt-12 lg:pb-28 lg:pt-16">
        <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(96,32,96,.045)_1px,transparent_1px)] [background-size:100%_48px]" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="mb-7 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-3"><span className="h-px w-8 bg-brand-600" /><p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Explora la cocina</p></div>
              <h2 className="mt-3 text-3xl font-black tracking-[-.04em] text-ink sm:text-4xl">¿Qué te provoca hoy?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted sm:text-base">Elige un plato listo o arma el tuyo desde cero. Precio, nutrición y disponibilidad viven en un mismo menú.</p>
            </div>
            {branchId && (
              <div className="flex items-center gap-3 rounded-card border border-brand-200 bg-white px-4 py-3 shadow-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">{isPickup ? <Store className="size-4" /> : <MapPin className="size-4" />}</span>
                <div className="min-w-0"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-brand-700"><CheckCircle2 className="size-3" /> Disponibilidad confirmada</p><p className="max-w-56 truncate text-xs font-bold text-ink">{destination ?? 'Sucursal seleccionada'}</p></div>
                <Button variant="ghost" onClick={openLocationModal}>Cambiar</Button>
              </div>
            )}
          </header>

          {appliedPreferences && preferenceLabels.length > 0 && (
            <div
              role="status"
              className="mb-4 flex flex-col gap-3 rounded-card border border-brand-200 bg-brand-50/80 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
            >
              <p className="flex items-start gap-2.5 text-xs leading-5 text-brand-900 sm:text-sm">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
                <span>
                  <strong className="font-extrabold">Filtramos el menú con tu perfil alimentario:</strong>{' '}
                  {preferenceLabels.join(' · ')}.
                </span>
              </p>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                <Button size="sm" variant="outline" onClick={clearPreferenceFilters}>
                  Ver el menú completo
                </Button>
                <button
                  type="button"
                  onClick={dismissPreferencesNotice}
                  aria-label="Ocultar este aviso y mantener el filtro"
                  className="grid size-9 shrink-0 place-items-center rounded-field text-brand-800 transition-colors hover:bg-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          <CatalogFiltersBar />

          {!branchId && <div className="mt-5"><BranchPrompt onChooseLocation={openLocationModal} /></div>}

          {favorites.length > 0 && !filters.onlyFavorites && (
            <section
              className="mt-5 rounded-card border border-line bg-white p-3 shadow-sm sm:p-4"
              aria-labelledby="menu-favorites-heading"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 id="menu-favorites-heading" className="inline-flex items-center gap-2 text-sm font-black text-ink">
                  <Heart className="size-4 fill-current text-red-500" aria-hidden="true" />
                  Tus favoritos ({favorites.length})
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch(setFilters({ onlyFavorites: true }))}
                >
                  Ver solo favoritos
                </Button>
              </div>
              <ul className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {favorites.slice(0, 8).map((item) => (
                  <li key={item.productId} className="w-40 shrink-0 sm:w-44">
                    <Link
                      to={item.type === 'CUSTOMIZABLE' ? ROUTES.builder : ROUTES.product(item.slug)}
                      className="block overflow-hidden rounded-card border border-line transition-colors hover:border-brand-300"
                    >
                      <ProductMedia src={item.imageUrl} alt={item.name} ratio="4/3" />
                      <div className="p-2.5">
                        <p className="truncate text-xs font-extrabold text-ink">{item.name}</p>
                        <p className="mt-1 text-xs font-black text-brand-700">
                          {item.type === 'CUSTOMIZABLE' ? 'Desde ' : ''}
                          {formatCurrency(item.priceFrom)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-9 sm:mt-11">
            <CatalogResults
              products={products}
              status={status}
              error={error}
              onRetry={retry}
              allergenAlerts={allergenAlerts}
            />
          </div>
        </div>
      </section>
    </>
  );
};

export default MenuPage;
