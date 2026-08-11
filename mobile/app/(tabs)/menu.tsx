import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  CatalogFilters,
  EMPTY_CATALOG_FILTERS,
  countCatalogFilters,
  type CatalogFilterState,
} from '../../src/components/CatalogFilters';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { LocationBar } from '../../src/components/LocationBar';
import { ProductCard } from '../../src/components/ProductCard';
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
import { colors, layout, radius, spacing, type } from '../../src/theme/tokens';
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

const toLabels = (rows: Array<{ code: string; name: string }>): Record<string, string> => {
  const labels: Record<string, string> = {};
  rows.forEach((row) => {
    labels[row.code] = row.name;
  });
  return labels;
};

export default function MenuScreen() {
  const { branch } = usePurchase();
  const { status } = useSession();
  const favorites = useFavorites();
  const { addItem } = useCart();
  const toast = useToast();

  const branchId = branch?.id ?? null;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [filters, setFilters] = useState<CatalogFilterState>(EMPTY_CATALOG_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [addingId, setAddingId] = useState<number | null>(null);

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

  // Cambiar de consulta devuelve el scroll al principio de la paginación.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [listKey, onlyFavorites]);

  useEffect(() => {
    void mobileAnalytics.track('MENU_VIEW', { branchId: branchId ?? 0 }, branchId);
  }, [branchId]);

  const products = useMemo(() => menu.data ?? [], [menu.data]);
  const favoriteIds = favorites.ids;

  const visibleProducts = useMemo(
    () => (onlyFavorites ? products.filter((item) => favoriteIds.has(item.id)) : products),
    [favoriteIds, onlyFavorites, products],
  );
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
    ({ item }: ListRenderItemInfo<Product>) => (
      <View style={styles.row}>
        <ProductCard
          compact
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
      </View>
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
    dietaryCount > 0 || categoryId !== null || debouncedSearch.length > 0 || onlyFavorites;

  const clearAll = () => {
    // Se suelta también la siembra: «quitar todo» no puede dejar el prefiltro
    // del perfil listo para volver a aplicarse.
    seededRef.current = null;
    setFilters(EMPTY_CATALOG_FILTERS);
    setCategoryId(null);
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

  const header = (
    <View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>MENÚ VERDE BOWL</Text>
        <Text style={styles.title}>¿Qué te provoca hoy?</Text>
        <Text style={styles.subtitle}>
          Busca, compara y revisa la disponibilidad de la cocina que te atiende.
        </Text>
        <LocationBar />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <MaterialCommunityIcons name="magnify" size={21} color={colors.inkMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar bowls, proteínas…"
              placeholderTextColor="#7d8a84"
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Buscar en el menú"
            />
            {search.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Borrar la búsqueda"
                hitSlop={layout.iconHitSlop}
                onPress={() => setSearch('')}
              >
                <MaterialCommunityIcons name="close-circle" size={20} color="#8f9a94" />
              </Pressable>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              dietaryCount > 0
                ? `Filtros dietéticos, ${dietaryCount} activos`
                : 'Abrir filtros dietéticos'
            }
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
            {dietaryCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{dietaryCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          <Chip label="Todo" selected={categoryId === null} onPress={() => setCategoryId(null)} />

          {status === 'authenticated' && (
            <Chip
              icon={onlyFavorites ? 'heart' : 'heart-outline'}
              label="Favoritos"
              badge={favoriteIds.size}
              tone="danger"
              selected={onlyFavorites}
              onPress={() => setOnlyFavorites((value) => !value)}
            />
          )}

          {(categories.data ?? []).map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
        </ScrollView>

        {activeChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
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
        )}

        {!showSkeleton && !failed && (
          <Text style={styles.results}>
            {visibleProducts.length}{' '}
            {visibleProducts.length === 1 ? 'opción encontrada' : 'opciones encontradas'}
            {branch ? ` en ${branch.name}` : ''}
          </Text>
        )}
      </View>
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
      <FlatList
        style={styles.list}
        data={showSkeleton || failed ? [] : page}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
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
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={PAGE_SIZE}
        windowSize={7}
        removeClippedSubviews
      />

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
    backgroundColor: colors.surfaceMuted,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  hero: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    ...type.label,
    color: colors.brand600,
    letterSpacing: 1.2,
  },
  title: {
    ...type.display,
    color: colors.ink,
    marginTop: 4,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 6,
    marginBottom: spacing.md,
  },
  toolbar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  search: {
    flex: 1,
    height: 52,
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
    width: 52,
    height: 52,
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
  chips: {
    gap: spacing.sm,
    paddingTop: spacing.sm + spacing.xs,
    paddingBottom: spacing.xs,
  },
  results: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + spacing.xs,
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + spacing.xs,
    gap: spacing.sm + spacing.xs,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    overflow: 'hidden',
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
});
