import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductCard } from '../../src/components/ProductCard';
import { LoadingState } from '../../src/components/ScreenState';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { colors, spacing } from '../../src/theme/tokens';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets(); const { status } = useSession(); const favorites = useFavorites();
  useEffect(() => { if (status === 'anonymous') router.replace({ pathname: '/(auth)/login', params: { returnTo: '/favorites' } }); }, [status]);
  if (status === 'bootstrapping' || favorites.loading) return <View style={[styles.page, { paddingTop: insets.top }]}><LoadingState label="Sincronizando tus favoritos…" /></View>;
  return <FlatList style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} data={favorites.products} keyExtractor={(item) => String(item.id)} refreshControl={<RefreshControl refreshing={favorites.loading} onRefresh={() => void favorites.reload()} tintColor={colors.brand600} />} ListHeaderComponent={<View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.ink} /></Pressable><View><Text style={styles.eyebrow}>TU COLECCIÓN</Text><Text style={styles.title}>Mis favoritos</Text><Text style={styles.copy}>Se guardan en tu cuenta y aparecen en todos tus dispositivos.</Text></View></View>} renderItem={({ item }) => <View style={styles.card}><ProductCard compact product={item} isFavorite onToggleFavorite={() => void favorites.toggle(item)} onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })} /></View>} ListEmptyComponent={<View style={styles.empty}><MaterialCommunityIcons name="heart-plus-outline" size={48} color={colors.brand600} /><Text style={styles.emptyTitle}>Aún no guardaste platos</Text><Text style={styles.emptyCopy}>Toca el corazón del menú para armar una lista que viaje contigo.</Text><Pressable style={styles.explore} onPress={() => router.replace('/(tabs)/menu')}><Text style={styles.exploreText}>Explorar el menú</Text></Pressable></View>} />;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.surfaceMuted }, content: { paddingBottom: spacing.xl }, header: { flexDirection: 'row', gap: 12, paddingHorizontal: spacing.md, paddingBottom: spacing.md }, back: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: colors.ink, fontSize: 27, fontWeight: '900', marginTop: 2 }, copy: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: 4, paddingRight: 60 }, card: { paddingHorizontal: spacing.md, paddingTop: 10 }, empty: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 80 }, emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 14 }, emptyCopy: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }, explore: { backgroundColor: colors.brand700, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 13, marginTop: 18 }, exploreText: { color: colors.surface, fontSize: 12, fontWeight: '900' } });
