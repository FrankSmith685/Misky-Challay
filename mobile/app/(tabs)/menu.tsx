import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocationBar } from '../../src/components/LocationBar';
import { ProductCard } from '../../src/components/ProductCard';
import { ErrorState, LoadingState } from '../../src/components/ScreenState';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { mobileAnalytics } from '../../src/services/analytics';
import { catalogApi } from '../../src/services/api/catalog.service';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { Category, Product } from '../../src/types/domain';

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { branch } = usePurchase();
  const { status } = useSession();
  const favorites = useFavorites();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        categories.length ? Promise.resolve(categories) : catalogApi.categories(),
        catalogApi.products({ branchId: branch?.id, categoryId, search: debouncedSearch }),
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cargar el menú.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branch?.id, categories, categoryId, debouncedSearch]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => { void mobileAnalytics.track('MENU_VIEW', { branchId: branch?.id ?? 0 }, branch?.id); }, [branch?.id]);

  const toggleFavorite = (product: Product) => {
    if (status !== 'authenticated') { router.push({ pathname: '/(auth)/login', params: { returnTo: '/(tabs)/menu' } }); return; }
    void favorites.toggle(product).catch((caught) => Alert.alert('Favoritos', caught instanceof Error ? caught.message : 'No pudimos guardar el favorito.'));
  };
  const visibleProducts = onlyFavorites ? products.filter((product) => favorites.ids.has(product.id)) : products;

  const header = (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.eyebrow}>MENÚ VERDE BOWL</Text>
        <Text style={styles.title}>¿Qué te provoca hoy?</Text>
        <Text style={styles.subtitle}>Busca, compara y revisa la disponibilidad de la cocina seleccionada.</Text>
        <LocationBar />
      </View>
      <View style={styles.filters}>
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={21} color={colors.inkMuted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar bowls, proteínas…" placeholderTextColor="#89938e" style={styles.searchInput} returnKeyType="search" />
          {search.length > 0 && <Pressable onPress={() => setSearch('')} hitSlop={8}><MaterialCommunityIcons name="close-circle" size={20} color="#9ba59f" /></Pressable>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable onPress={() => setCategoryId(null)} style={[styles.chip, categoryId === null && styles.chipActive]}><Text style={[styles.chipText, categoryId === null && styles.chipTextActive]}>Todo</Text></Pressable>
          {status === 'authenticated' && <Pressable onPress={() => setOnlyFavorites((value) => !value)} style={[styles.chip, styles.favoriteChip, onlyFavorites && styles.chipActive]}><MaterialCommunityIcons name={onlyFavorites ? 'heart' : 'heart-outline'} size={15} color={onlyFavorites ? colors.surface : colors.danger} /><Text style={[styles.chipText, onlyFavorites && styles.chipTextActive]}>Favoritos ({favorites.ids.size})</Text></Pressable>}
          {categories.map((category) => <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.chip, categoryId === category.id && styles.chipActive]}><Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>{category.name}</Text></Pressable>)}
        </ScrollView>
        {!loading && !error && <Text style={styles.results}>{visibleProducts.length} {visibleProducts.length === 1 ? 'opción encontrada' : 'opciones encontradas'}</Text>}
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.page}
      data={loading || error ? [] : visibleProducts}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <View style={styles.productWrap}><ProductCard compact product={item} isFavorite={favorites.ids.has(item.id)} onToggleFavorite={() => toggleFavorite(item)} onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })} /></View>}
      ListHeaderComponent={header}
      ListEmptyComponent={loading ? <LoadingState label="Cargando platos disponibles…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : <View style={styles.empty}><MaterialCommunityIcons name="food-off-outline" size={42} color={colors.brand600} /><Text style={styles.emptyTitle}>No encontramos coincidencias</Text><Text style={styles.emptyCopy}>Prueba con otro término o vuelve a ver todas las categorías.</Text></View>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand600} />}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.lg },
  hero: { backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  eyebrow: { color: colors.brand600, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.9, marginTop: 5 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: spacing.md },
  filters: { backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  search: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  chips: { gap: 8, paddingTop: 12, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 9 },
  favoriteChip: { borderColor: '#efcaca' },
  chipActive: { backgroundColor: colors.brand700, borderColor: colors.brand700 },
  chipText: { color: colors.inkMuted, fontSize: 11, fontWeight: '800' },
  chipTextActive: { color: colors.surface },
  results: { color: colors.inkMuted, fontSize: 10, marginTop: 2 },
  productWrap: { paddingHorizontal: spacing.md, paddingTop: 10 },
  empty: { minHeight: 270, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 12 },
  emptyCopy: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
});
