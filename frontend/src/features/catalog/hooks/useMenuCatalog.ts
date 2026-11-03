import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { useDebounce } from '@hooks/useDebounce';
import { accountApi } from '@features/account/services/account.service';
import { fetchCatalogMeta, fetchProducts, setFilters } from '../catalogSlice';

/** Lo que el menu precargo desde el perfil alimentario, para poder explicarlo y deshacerlo. */
export interface AppliedFoodPreferences {
  allergens: string[];
  dietaryTags: string[];
}

/** Coordina los datos del menú sin mezclar peticiones y temporización con la vista. */
export const useMenuCatalog = () => {
  const dispatch = useAppDispatch();
  const { branchId, openLocationModal, address, pickupBranch, deliveryType } = useAppState();
  const catalog = useAppSelector((state) => state.catalog);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const favorites = useAppSelector((state) => state.favorites.items);
  const debouncedSearch = useDebounce(catalog.filters.search, 350);
  const [retryNonce, setRetryNonce] = useState(0);
  const [declaredAllergens, setDeclaredAllergens] = useState<string[]>([]);
  const [appliedPreferences, setAppliedPreferences] = useState<AppliedFoodPreferences | null>(null);

  // El perfil se aplica una sola vez por sesión: si el cliente lo quita, no vuelve a entrar solo.
  const preferencesApplied = useRef(false);
  // Los filtros del momento sin volver a lanzar la carga del perfil al tocarlos.
  const filtersRef = useRef(catalog.filters);
  filtersRef.current = catalog.filters;

  useEffect(() => {
    dispatch(fetchCatalogMeta());
  }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated) {
      preferencesApplied.current = false;
      setDeclaredAllergens([]);
      setAppliedPreferences(null);
      return undefined;
    }
    if (preferencesApplied.current) return undefined;

    let active = true;
    accountApi
      .getFoodPreferences()
      .then((preferences) => {
        if (!active) return;
        preferencesApplied.current = true;
        setDeclaredAllergens(preferences.allergens);

        const current = filtersRef.current;
        // Lo que el cliente eligió a mano manda sobre lo que declaró en su perfil.
        if (current.excludeAllergens.length > 0 || current.dietaryTags.length > 0) return;
        if (preferences.allergens.length === 0 && preferences.dietaryTags.length === 0) return;

        dispatch(
          setFilters({
            excludeAllergens: preferences.allergens,
            dietaryTags: preferences.dietaryTags,
          }),
        );
        setAppliedPreferences({
          allergens: preferences.allergens,
          dietaryTags: preferences.dietaryTags,
        });
      })
      .catch(() => {
        // Sin perfil el menú funciona igual: no se molesta al cliente con este fallo.
        if (active) preferencesApplied.current = true;
      });

    return () => {
      active = false;
    };
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    dispatch(
      fetchProducts({
        branchId,
        filters: { ...catalog.filters, search: debouncedSearch },
      }),
    );
    // Los campos se declaran individualmente para no repetir peticiones por identidad del objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dispatch,
    branchId,
    debouncedSearch,
    catalog.filters.categoryId,
    catalog.filters.dietaryTags,
    catalog.filters.excludeAllergens,
    retryNonce,
  ]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((item) => item.productId)),
    [favorites],
  );
  const products = useMemo(() => {
    const byMode = catalog.products.filter((product) => {
      if (catalog.filters.productMode === 'CUSTOM') return product.type === 'CUSTOMIZABLE';
      if (catalog.filters.productMode === 'READY') return product.type !== 'CUSTOMIZABLE';
      return true;
    });
    const ordered = [...byMode].sort(
      (left, right) => Number(right.type === 'CUSTOMIZABLE') - Number(left.type === 'CUSTOMIZABLE'),
    );
    return catalog.filters.onlyFavorites
      ? ordered.filter((product) => favoriteIds.has(product.id))
      : ordered;
  }, [catalog.filters.onlyFavorites, catalog.filters.productMode, catalog.products, favoriteIds]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);

  const clearPreferenceFilters = useCallback(() => {
    dispatch(setFilters({ excludeAllergens: [], dietaryTags: [] }));
    setAppliedPreferences(null);
  }, [dispatch]);

  const dismissPreferencesNotice = useCallback(() => setAppliedPreferences(null), []);

  return {
    ...catalog,
    products,
    favorites,
    retry,
    /** Alérgenos declarados en el perfil, se apliquen o no como filtro. */
    declaredAllergens,
    appliedPreferences,
    clearPreferenceFilters,
    dismissPreferencesNotice,
    branchId,
    openLocationModal,
    address,
    pickupBranch,
    deliveryType,
  };
};
