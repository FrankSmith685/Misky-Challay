import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type SectionListRenderItemInfo,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  CatalogFilters,
  EMPTY_CATALOG_FILTERS,
  countCatalogFilters,
  type CatalogFilterState,
} from '../../src/components/CatalogFilters';
import { AppImage } from '../../src/components/AppImage';
import { BrandLogo } from '../../src/components/BrandLogo';
import { CartAccessory } from '../../src/components/CartAccessory';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { MenuProductRow } from '../../src/components/MenuProductRow';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { useCart } from '../../src/providers/CartProvider';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { mobileAnalytics } from '../../src/services/analytics';
import { accountApi } from '../../src/services/api/account.service';
import { catalogApi } from '../../src/services/api/catalog.service';
import { customizationApi } from '../../src/services/api/customization.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type {
  Allergen,
  Category,
  DietaryTag,
  FoodPreferences,
  Product,
} from '../../src/types/domain';

/**
 * Cuántos platos se pintan de golpe. El backend devuelve el menú entero en una
 * sola respuesta (no pagina), así que la paginación es de dibujado: montar 60
 * tarjetas a la vez es lo que hacía que el primer scroll fuera a tirones.
 */
const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;
/** El catálogo cambia poco: no vale la pena revalidarlo en cada visita. */
const CATALOG_CACHE_MS = 10 * 60_000;
type MenuMode = 'ALL' | 'CUSTOM' | 'READY';

const toLabels = (rows: Array<{ code: string; name: string }>): Record<string, string> => {
  const labels: Record<string, string> = {};
  rows.forEach((row) => {
    labels[row.code] = row.name;
  });
  return labels;
};

export default function MenuScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { branch, address, serviceMode } = usePurchase();
  const { width } = useWindowDimensions();
  const { status } = useSession();
  const favorites = useFavorites();
  const { addItem, units } = useCart();
  const toast = useToast();

  const branchId = branch?.id ?? null;
  const locationTitle = serviceMode === 'DELIVERY' ? 'Delivery' : 'Recojo en local';
  const locationDetail = serviceMode === 'DELIVERY'
    ? (address?.line1 ?? 'Elige tu dirección')
    : (branch?.name ?? 'Elige local');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>('ALL');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [filters, setFilters] = useState<CatalogFilterState>(EMPTY_CATALOG_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    const requested = params.mode?.toUpperCase();
    if (requested !== 'CUSTOM' && requested !== 'READY' && requested !== 'ALL') return;
    setMenuMode(requested);
    setCategoryId(null);
    setOnlyFavorites(false);
  }, [params.mode]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const categories = useResource<Category[]>({
    key: 'catalog:categories',
    fetcher: () => catalogApi.categories(),
    cacheMs: CATALOG_CACHE_MS,
  });

  const dietaryTags = useResource<DietaryTag[]>({
    key: 'catalog:dietary-tags',
    fetcher: () => catalogApi.dietaryTags(),
    cacheMs: CATALOG_CACHE_MS,
  });

  const allergens = useResource<Allergen[]>({
    key: 'catalog:allergens',
    fetcher: () => catalogApi.allergens(),
    cacheMs: CATALOG_CACHE_MS,
  });

  // Perfil alimentario: sirve para avisar en rojo de los alérgenos que el cliente
  // declaró y para rellenar los filtros de un toque. Sin sesión, ni se pide.
  const preferences = useResource<FoodPreferences>({
    key: status === 'authenticated' ? 'account:food-preferences' : null,
    fetcher: () => accountApi.foodPreferences(),
    cacheMs: CATALOG_CACHE_MS,
  });

  /**
   * PREFILTRO POR PREFERENCIAS.
   *
   * En la web el menú llega ya filtrado por lo que el cliente declaró; aquí se
   * hace lo mismo, pero una sola vez por carga y siempre visible: si no se puede
   * ver el filtro puesto, un plato que falta parece un plato agotado.
   *
   * `seededRef` guarda la huella exacta de lo que sembramos. Mientras los filtros
   * sean esos, el chip está puesto; en cuanto el cliente toca cualquier cosa deja
   * de coincidir y el chip desaparece solo, sin estado extra que sincronizar.
   */
  const seededRef = useRef<string | null>(null);

  useEffect(() => {
    const prefs = preferences.data;
    if (!prefs || seededRef.current !== null) return;

    const seeded: CatalogFilterState = {
      dietaryTags: prefs.dietaryTags,
      excludeAllergens: prefs.allergens,
      maxCalories: prefs.calorieTarget,
      minProtein: prefs.proteinTarget,
    };
    // Sin preferencias guardadas no hay nada que sembrar, y marcar la huella
    // evitaría que se sembrara al guardarlas más tarde.
    if (countCatalogFilters(seeded) === 0) return;

    seededRef.current = JSON.stringify(seeded);
    setFilters(seeded);
  }, [preferences.data]);

  const preferencesApplied =
    seededRef.current !== null && seededRef.current === JSON.stringify(filters);

  /**
   * La clave identifica la consulta entera. Cambiarla es cambiar de dato, y
   * `useResource` descarta cualquier respuesta que llegue tarde de una clave
   * anterior: eso es lo que arregla la carrera del buscador.
   */
  const listKey = [
    'catalog:products',
    branchId ?? 'sin-sede',
    categoryId ?? 'todas',
    debouncedSearch || 'sin-texto',
    filters.dietaryTags.join('+') || '-',
    filters.excludeAllergens.join('+') || '-',
    filters.maxCalories ?? '-',
    filters.minProtein ?? '-',
  ].join(':');

  const menu = useResource<Product[]>({
    key: listKey,
    fetcher: () =>
      catalogApi.products({
        branchId,
        categoryId,
        search: debouncedSearch || undefined,
        dietaryTags: filters.dietaryTags,
        excludeAllergens: filters.excludeAllergens,
        maxCalories: filters.maxCalories ?? undefined,
        minProtein: filters.minProtein ?? undefined,
      }),
  });

  // La configuración personalizable se mantiene visible aunque el perfil
  // alimentario filtre las recetas listas del backend.
  const baseCatalog = useResource<Product[]>({
    key: `catalog:products:base:${branchId ?? 'sin-sede'}`,
    fetcher: () => catalogApi.products({ branchId }),
    cacheMs: CATALOG_CACHE_MS,
  });

  // Cambiar de consulta devuelve el scroll al principio de la paginación.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [listKey, menuMode, onlyFavorites]);

  useEffect(() => {
    void mobileAnalytics.track('MENU_VIEW', { branchId: branchId ?? 0 }, branchId);
  }, [branchId]);

  const builderProduct = useMemo(
    () => baseCatalog.data?.find((item) => item.type === 'CUSTOMIZABLE') ?? null,
    [baseCatalog.data],
  );
  const products = useMemo(() => {
    const rows = [...(menu.data ?? [])];
    if (!builderProduct || rows.some((item) => item.id === builderProduct.id)) return rows;

    const matchesCategory = categoryId === null || builderProduct.categoryId === categoryId;
    const term = debouncedSearch.toLocaleLowerCase('es-PE');
    const matchesSearch =
      !term ||
      menuMode === 'CUSTOM' ||
      `${builderProduct.name} ${builderProduct.description ?? ''}`
        .toLocaleLowerCase('es-PE')
        .includes(term);
    return matchesCategory && matchesSearch ? [builderProduct, ...rows] : rows;
  }, [builderProduct, categoryId, debouncedSearch, menu.data, menuMode]);
  const favoriteIds = favorites.ids;

  const visibleProducts = useMemo(() => {
    const byMode = products.filter((item) => {
      if (menuMode === 'CUSTOM') return item.type === 'CUSTOMIZABLE';
      if (menuMode === 'READY') return item.type !== 'CUSTOMIZABLE';
      return true;
    });

    // El constructor forma parte del catálogo: en "Todo el menú" se presenta
    // primero, con la misma jerarquía que cualquier otro producto.
    const ordered = [...byMode].sort(
      (left, right) => Number(right.type === 'CUSTOMIZABLE') - Number(left.type === 'CUSTOMIZABLE'),
    );
    return onlyFavorites ? ordered.filter((item) => favoriteIds.has(item.id)) : ordered;
  }, [favoriteIds, menuMode, onlyFavorites, products]);
  const page = useMemo(
    () => visibleProducts.slice(0, visibleCount),
    [visibleCount, visibleProducts],
  );

  const tagLabels = useMemo(() => toLabels(dietaryTags.data ?? []), [dietaryTags.data]);
  const allergenLabels = useMemo(() => toLabels(allergens.data ?? []), [allergens.data]);
  const alertAllergens = useMemo(
    () => preferences.data?.allergens ?? [],
    [preferences.data?.allergens],
  );

  /**
   * Favoritos y carrito viven en contextos que cambian de identidad en cuanto se
   * toca algo. Leerlos desde una ref mantiene estables los manejadores que
   * reciben las tarjetas y, con ellos, la memoización de `ProductCard`.
   */
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const openProduct = useCallback((product: Product) => {
    router.push({ pathname: '/product/[slug]', params: { slug: product.slug } });
  }, []);

  const openAvailabilityAlert = useCallback((product: Product) => {
    // El alta en el aviso vive en la ficha, con su hoja de canales: llegamos allí
    // con la hoja ya abierta para no pedir dos toques por lo mismo.
    router.push({ pathname: '/product/[slug]', params: { slug: product.slug, alerta: '1' } });
  }, []);

  const toggleFavorite = useCallback(
    (product: Product) => {
      if (status !== 'authenticated') {
        router.push({ pathname: '/(auth)/login', params: { returnTo: '/(tabs)/menu' } });
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void favoritesRef.current.toggle(product).catch((caught: unknown) => {
        toast.show({
          message:
            caught instanceof Error ? caught.message : 'No pudimos guardar el favorito.',
          tone: 'error',
        });
      });
    },
    [status, toast],
  );

  const quickAdd = useCallback(
    async (product: Product) => {
      if (product.defaultVariantId === null) {
        openProduct(product);
        return;
      }

      setAddingId(product.id);
      try {
        // El precio lo pone el backend, siempre: aquí no se multiplica nada.
        const quote = await customizationApi.quote({
          productId: product.id,
          variantId: product.defaultVariantId,
          quantity: 1,
          branchId,
          selections: [],
        });

        addItem({
          productId: product.id,
          variantId: product.defaultVariantId,
          productName: product.name,
          variantName: product.defaultVariantName ?? '',
          imageUrl: product.imageUrl,
          quantity: 1,
          unitPrice: quote.unitPrice,
          lineTotal: quote.lineTotal,
          description: quote.description || product.description || product.name,
          selections: [],
        });

        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void mobileAnalytics.track('CART_ADD', { productId: product.id, quantity: 1 }, branchId);

        // Agregar no expulsa del menú: el carrito queda a un toque de distancia.
        toast.show({
          message: `${product.name} está en tu carrito`,
          tone: 'success',
          action: { label: 'Ver carrito', onPress: () => router.push('/(tabs)/cart') },
        });
      } catch (caught) {
        toast.show({
          message: caught instanceof Error ? caught.message : 'No pudimos agregar este plato.',
          tone: 'error',
        });
      } finally {
        setAddingId(null);
      }
    },
    [addItem, branchId, openProduct, toast],
  );

  // Envoltorio estable: si la tarjeta recibiera una lambda nueva en cada render,
  // `memo` compararía funciones distintas y volvería a dibujarlo todo.
  const handleQuickAdd = useCallback(
    (product: Product) => {
      void quickAdd(product);
    },
    [quickAdd],
  );

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<Product>) => (
      <MenuProductRow
        product={item}
        isFavorite={favoriteIds.has(item.id)}
        busy={addingId === item.id}
        tagLabels={tagLabels}
        allergenLabels={allergenLabels}
        alertAllergens={alertAllergens}
        onPress={openProduct}
        onToggleFavorite={toggleFavorite}
        onQuickAdd={handleQuickAdd}
        onNotifyAvailability={openAvailabilityAlert}
      />
    ),
    [
      addingId,
      alertAllergens,
      allergenLabels,
      favoriteIds,
      handleQuickAdd,
      openAvailabilityAlert,
      openProduct,
      tagLabels,
      toggleFavorite,
    ],
  );

  const dietaryCount = countCatalogFilters(filters);
  const hasAnyFilter =
    dietaryCount > 0 ||
    categoryId !== null ||
    menuMode !== 'ALL' ||
    debouncedSearch.length > 0 ||
    onlyFavorites;

  const clearAll = () => {
    // Se suelta también la siembra: «quitar todo» no puede dejar el prefiltro
    // del perfil listo para volver a aplicarse.
    seededRef.current = null;
    setFilters(EMPTY_CATALOG_FILTERS);
    setCategoryId(null);
    setMenuMode('ALL');
    setOnlyFavorites(false);
    setSearch('');
  };

  /** Resumen de lo que está filtrando ahora mismo, quitable de un toque. */
  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; danger?: boolean; remove: () => void }> = [];

    // Cuando el filtro entero viene del perfil, se dice así y se quita de una vez:
    // desglosarlo en cinco chips oculta de dónde salió.
    if (preferencesApplied) {
      chips.push({
        id: 'preferences',
        label: 'Filtrado por tus preferencias',
        remove: () => {
          seededRef.current = null;
          setFilters(EMPTY_CATALOG_FILTERS);
        },
      });
      return chips;
    }

    filters.dietaryTags.forEach((code) => {
      chips.push({
        id: `tag-${code}`,
        label: tagLabels[code] ?? code,
        remove: () =>
          setFilters((current) => ({
            ...current,
            dietaryTags: current.dietaryTags.filter((item) => item !== code),
          })),
      });
    });

    filters.excludeAllergens.forEach((code) => {
      chips.push({
        id: `allergen-${code}`,
        label: `Sin ${(allergenLabels[code] ?? code).toLocaleLowerCase('es-PE')}`,
        danger: true,
        remove: () =>
          setFilters((current) => ({
            ...current,
            excludeAllergens: current.excludeAllergens.filter((item) => item !== code),
          })),
      });
    });

    if (filters.maxCalories !== null) {
      chips.push({
        id: 'kcal',
        label: `Hasta ${filters.maxCalories} kcal`,
        remove: () => setFilters((current) => ({ ...current, maxCalories: null })),
      });
    }

    if (filters.minProtein !== null) {
      chips.push({
        id: 'protein',
        label: `${filters.minProtein} g de proteína`,
        remove: () => setFilters((current) => ({ ...current, minProtein: null })),
      });
    }

    return chips;
  }, [allergenLabels, filters, preferencesApplied, tagLabels]);

  const showSkeleton = menu.loading && products.length === 0;
  const failed = menu.error !== null && products.length === 0;
  const readyProduct = useMemo(
    () => baseCatalog.data?.find((item) => item.type !== 'CUSTOMIZABLE') ?? null,
    [baseCatalog.data],
  );

  const chooseBuilder = useCallback(() => {
    void Haptics.selectionAsync();
    if (builderProduct) {
      router.push({ pathname: '/builder/[productId]', params: { productId: String(builderProduct.id) } });
      return;
    }
    setMenuMode('CUSTOM');
    setCategoryId(null);
    setOnlyFavorites(false);
  }, [builderProduct]);

  const chooseReady = useCallback(() => {
    void Haptics.selectionAsync();
    setMenuMode('READY');
    setCategoryId(null);
    setOnlyFavorites(false);
  }, []);

  const discoverHeader = (
    <View style={styles.discover}>
      <View style={styles.discoverHeading}>
        <View>
          <Text style={styles.eyebrow}>ELIGE CÓMO EMPEZAR</Text>
          <Text style={styles.discoverTitle}>Menú</Text>
        </View>
        {!showSkeleton && !failed ? (
          <Text style={styles.resultText}>{visibleProducts.length} opciones</Text>
        ) : null}
      </View>

      <View style={styles.bento}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Arma tu bowl"
          onPress={chooseBuilder}
          style={({ pressed }) => [styles.bentoBuilder, shadow.sm, pressed && styles.bentoPressed]}
        >
          <View style={styles.bentoCopy}>
            <Text style={styles.bentoBuilderTitle}>Arma tu bowl</Text>
            <Text style={styles.bentoBuilderText}>Elige tus bases, proteínas y más</Text>
            <View style={styles.bentoArrowLight}>
              <MaterialCommunityIcons name="arrow-right" size={19} color={colors.brand900} />
            </View>
          </View>
          <AppImage
            uri={builderProduct?.imageUrl}
            style={styles.bentoBuilderImage}
            fallbackIconSize={42}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver recetas listas"
          onPress={chooseReady}
          style={({ pressed }) => [styles.bentoReady, pressed && styles.bentoPressed]}
        >
          <Text style={styles.bentoReadyTitle}>Recetas listas</Text>
          <Text style={styles.bentoReadyText}>Favoritos de la casa</Text>
          <AppImage
            uri={readyProduct?.imageUrl}
            style={styles.bentoReadyImage}
            fallbackIconSize={32}
          />
          <View style={styles.bentoArrowDark}>
            <MaterialCommunityIcons name="arrow-right" size={18} color={colors.surface} />
          </View>
        </Pressable>
      </View>
    </View>
  );

  const categoryHeader = (
    <View style={styles.categoryHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label="Todos"
          selected={categoryId === null && menuMode === 'ALL' && !onlyFavorites}
          onPress={() => {
            setCategoryId(null);
            setMenuMode('ALL');
            setOnlyFavorites(false);
          }}
        />
        {status === 'authenticated' ? (
          <Chip
            icon={onlyFavorites ? 'heart' : 'heart-outline'}
            label="Favoritos"
            badge={favoriteIds.size}
            tone="danger"
            selected={onlyFavorites}
            onPress={() => setOnlyFavorites((value) => !value)}
          />
        ) : null}
        {(categories.data ?? []).map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            selected={menuMode === 'ALL' && categoryId === category.id && !onlyFavorites}
            onPress={() => {
              setMenuMode('ALL');
              setOnlyFavorites(false);
              setCategoryId(category.id);
            }}
          />
        ))}
      </ScrollView>

      {activeChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeChips}
          keyboardShouldPersistTaps="handled"
        >
          {activeChips.map((chip) => (
            <Chip
              key={chip.id}
              size="sm"
              icon="close"
              label={chip.label}
              tone={chip.danger ? 'danger' : 'brand'}
              onPress={chip.remove}
            />
          ))}
          <Chip size="sm" icon="broom" label="Limpiar todo" onPress={clearAll} />
        </ScrollView>
      ) : null}
    </View>
  );

  const empty = showSkeleton ? (
    <MenuSkeleton />
  ) : failed ? (
    <EmptyState
      icon="cloud-alert-outline"
      title="No pudimos cargar el menú"
      message={menu.error?.message ?? 'Revisa tu conexión e inténtalo otra vez.'}
      actionLabel="Reintentar"
      onAction={() => void menu.refetch()}
    />
  ) : onlyFavorites && favoriteIds.size === 0 ? (
    <EmptyState
      icon="heart-plus-outline"
      title="Todavía no guardaste platos"
      message="Toca el corazón de una tarjeta y aparecerá aquí y en todos tus dispositivos."
      actionLabel="Ver todo el menú"
      onAction={() => setOnlyFavorites(false)}
    />
  ) : (
    <EmptyState
      icon="food-off-outline"
      title="No encontramos coincidencias"
      message={
        hasAnyFilter
          ? 'Prueba con menos filtros o con otro término de búsqueda.'
          : 'La cocina seleccionada aún no publica platos.'
      }
      actionLabel={hasAnyFilter ? 'Quitar los filtros' : undefined}
      onAction={hasAnyFilter ? clearAll : undefined}
    />
  );

  const remaining = visibleProducts.length - page.length;

  return (
    <ScreenScaffold
      showBack={false}
      background={colors.surface}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.topBar}>
        <BrandLogo compact={width < 430} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar local o modalidad"
          onPress={() => router.push('/location')}
          style={({ pressed }) => [styles.location, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.brand700} />
          <View style={styles.locationCopy}>
            <Text numberOfLines={1} style={styles.locationLabel}>{locationTitle}</Text>
            <Text numberOfLines={1} style={styles.locationText}>{locationDetail}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.inkMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={units > 0 ? `Abrir carrito, ${units} productos` : 'Abrir carrito vacío'}
          onPress={() => router.push('/(tabs)/cart')}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="shopping-outline" size={23} color={colors.ink} />
          {units > 0 ? (
            <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{units > 99 ? '99+' : units}</Text></View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.searchToolbar}>
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={21} color={colors.inkMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar en el menú"
            placeholderTextColor="#7d8a84"
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Buscar en el menú"
          />
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Borrar la búsqueda"
              hitSlop={layout.iconHitSlop}
              onPress={() => setSearch('')}
            >
              <MaterialCommunityIcons name="close-circle" size={20} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dietaryCount > 0 ? `Filtros, ${dietaryCount} activos` : 'Abrir filtros'}
          onPress={() => setFiltersOpen(true)}
          style={({ pressed }) => [
            styles.filterButton,
            dietaryCount > 0 && styles.filterButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={22}
            color={dietaryCount > 0 ? colors.surface : colors.brand700}
          />
          {dietaryCount > 0 ? (
            <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{dietaryCount}</Text></View>
          ) : null}
        </Pressable>
      </View>

      <SectionList
        style={styles.list}
        sections={[{ title: 'catalog', data: showSkeleton || failed ? [] : page }]}
        renderItem={renderItem}
        renderSectionHeader={() => categoryHeader}
        stickySectionHeadersEnabled
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={discoverHeader}
        ListEmptyComponent={empty}
        ListFooterComponent={
          remaining > 0 ? (
            <View style={styles.footerHint}>
              <Text style={styles.footerText}>
                Quedan {remaining} {remaining === 1 ? 'plato' : 'platos'} por mostrar
              </Text>
            </View>
          ) : null
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (remaining > 0) setVisibleCount((count) => count + PAGE_SIZE);
        }}
        refreshControl={
          <RefreshControl
            refreshing={menu.refreshing}
            onRefresh={() => void menu.refresh()}
            tintColor={colors.brand600}
            colors={[colors.brand600]}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: units > 0 ? 88 : spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={PAGE_SIZE}
        windowSize={7}
        removeClippedSubviews
      />

      <CartAccessory style={styles.cartDock} />

      <CatalogFilters
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onApply={setFilters}
        dietaryTags={dietaryTags.data ?? []}
        allergens={allergens.data ?? []}
        loading={dietaryTags.loading || allergens.loading}
        preferences={preferences.data}
      />
    </ScreenScaffold>
  );
}

/** Silueta de la primera carga: cuatro fichas con la misma forma que las de verdad. */
function MenuSkeleton() {
  return (
    <View style={styles.skeleton}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={118} height={132} rounded="md" />
          <View style={styles.skeletonBody}>
            <Skeleton width="70%" height={18} rounded="sm" />
            <Skeleton width="95%" height={13} rounded="sm" style={styles.skeletonLine} />
            <Skeleton width="45%" height={13} rounded="sm" style={styles.skeletonLine} />
            <Skeleton width="55%" height={26} rounded="pill" style={styles.skeletonFoot} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flexGrow: 1,
  },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    zIndex: 3,
  },
  location: {
    minWidth: 0,
    minHeight: layout.minTouch,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
  },
  locationCopy: {
    minWidth: 0,
    flex: 1,
  },
  locationLabel: {
    ...type.caption,
    color: colors.brand700,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  locationText: {
    ...type.bodySm,
    minWidth: 0,
    color: colors.ink,
    fontWeight: '800',
  },
  headerAction: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  cartBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent500,
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    ...type.caption,
    color: colors.surface,
    fontSize: 10,
    fontWeight: '900',
  },
  searchToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    zIndex: 2,
  },
  search: {
    flex: 1,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
  },
  searchInput: {
    ...type.body,
    flex: 1,
    color: colors.ink,
  },
  filterButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
  },
  filterButtonActive: {
    backgroundColor: colors.brand600,
    borderColor: colors.brand600,
  },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.accent500,
  },
  filterBadgeText: {
    ...type.caption,
    color: colors.surface,
    textAlign: 'center',
  },
  discover: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  discoverHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  eyebrow: {
    ...type.caption,
    color: colors.brand600,
    fontWeight: '900',
    letterSpacing: 1,
  },
  discoverTitle: {
    ...type.title,
    color: colors.ink,
    marginTop: 2,
  },
  resultText: {
    ...type.caption,
    color: colors.inkMuted,
    paddingBottom: 3,
  },
  bento: {
    minHeight: 184,
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  bentoBuilder: {
    minWidth: 0,
    flex: 1.3,
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.brand900,
  },
  bentoCopy: {
    width: '64%',
    zIndex: 2,
    padding: spacing.md,
  },
  bentoBuilderTitle: {
    ...type.heading,
    color: colors.onDark,
  },
  bentoBuilderText: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginTop: spacing.xs,
  },
  bentoArrowLight: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  bentoBuilderImage: {
    position: 'absolute',
    right: -30,
    bottom: -20,
    width: 150,
    height: 150,
    borderRadius: radius.pill,
  },
  bentoReady: {
    minWidth: 0,
    flex: 0.95,
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: '#f4f1e9',
    padding: spacing.md,
  },
  bentoReadyTitle: {
    ...type.heading,
    color: colors.ink,
    zIndex: 2,
  },
  bentoReadyText: {
    ...type.caption,
    width: '72%',
    color: colors.inkMuted,
    marginTop: spacing.xs,
    zIndex: 2,
  },
  bentoReadyImage: {
    position: 'absolute',
    right: -34,
    bottom: -30,
    width: 124,
    height: 124,
    borderRadius: radius.pill,
  },
  bentoArrowDark: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.brand700,
  },
  bentoPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  categoryHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingBottom: spacing.xs,
  },
  categories: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  activeChips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  footerHint: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  footerText: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  skeleton: {
    paddingTop: spacing.sm + spacing.xs,
  },
  skeletonRow: {
    minHeight: 132,
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skeletonBody: {
    flex: 1,
    paddingVertical: spacing.sm + spacing.xs,
    paddingRight: spacing.sm + spacing.xs,
  },
  skeletonLine: {
    marginTop: spacing.sm,
  },
  skeletonFoot: {
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  cartDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
