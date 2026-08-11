import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../../src/components/BrandLogo';
import { ErrorState, LoadingState } from '../../src/components/ScreenState';
import { LocationBar } from '../../src/components/LocationBar';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ProductCard } from '../../src/components/ProductCard';
import { businessApi } from '../../src/services/api/business.service';
import { catalogApi } from '../../src/services/api/catalog.service';
import { engagementApi } from '../../src/services/api/engagement.service';
import { mobileAnalytics } from '../../src/services/analytics';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { PublicSettings, Recommendation } from '../../src/types/domain';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { branch } = usePurchase(); const { status } = useSession(); const favorites = useFavorites();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    const [business, featured] = await Promise.allSettled([
      businessApi.publicSettings(),
      engagementApi.recommendations(branch?.id, 6).catch(async () => (await catalogApi.products({ featured: true })).map((product) => ({ product, reason: 'Recomendado por Verde Bowl' }))),
    ]);
    if (business.status === 'fulfilled') setSettings(business.value);
    if (featured.status === 'fulfilled') setRecommendations(featured.value);
    if (business.status === 'rejected' && featured.status === 'rejected') {
      setError(featured.reason instanceof Error ? featured.reason.message : 'No pudimos cargar el inicio.');
    }
    setLoading(false);
    setRefreshing(false);
  }, [branch?.id, status]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <View style={[styles.page, { paddingTop: insets.top }]}><LoadingState label="Preparando el menú…" /></View>;
  if (error) return <View style={[styles.page, { paddingTop: insets.top }]}><ErrorState message={error} onRetry={() => void load()} /></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand600} />}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <BrandLogo inverse />
        <View style={styles.phase}><Text style={styles.phaseText}>APP CLIENTE</Text></View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.kicker}>COMIDA REAL · DECISIONES CLARAS</Text>
        <Text style={styles.heroTitle}>Tu bowl favorito, a tu manera.</Text>
        <Text style={styles.heroCopy}>Elige cómo quieres disfrutarlo y revisa ingredientes, nutrición y disponibilidad antes de pedir.</Text>
        <LocationBar inverse />
        <PrimaryButton label="Explorar el menú" onPress={() => router.push('/(tabs)/menu')} style={styles.heroButton} />
      </View>

      <Pressable style={styles.planBanner} onPress={() => router.push('/plans' as Href)}>
        <View style={styles.planIcon}><MaterialCommunityIcons name="wallet-giftcard" size={25} color={colors.surface} /></View>
        <View style={styles.planCopy}><Text style={styles.planEyebrow}>PLANES VERDE BOWL</Text><Text style={styles.planTitle}>Recibe más de lo que recargas</Text><Text style={styles.planText}>Saldo, bonos y beneficios sin cargos automáticos.</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={colors.brand700} />
      </Pressable>

      <View style={styles.sectionHeader}>
        <View><Text style={styles.eyebrow}>RECOMENDADOS</Text><Text style={styles.sectionTitle}>Lo mejor de hoy</Text></View>
        <Text onPress={() => router.push('/(tabs)/menu')} style={styles.seeAll}>Ver todo</Text>
      </View>
      {recommendations.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRail}>
          {recommendations.map(({ product, reason }) => <View key={product.id}><View style={styles.reason}><MaterialCommunityIcons name="creation" size={13} color={colors.brand700} /><Text style={styles.reasonText}>{reason}</Text></View><ProductCard product={product} isFavorite={favorites.ids.has(product.id)} onToggleFavorite={() => { if (status !== 'authenticated') { router.push({ pathname: '/(auth)/login', params: { returnTo: '/(tabs)' } }); return; } void favorites.toggle(product).catch((caught) => Alert.alert('Favoritos', caught instanceof Error ? caught.message : 'No pudimos guardar el favorito.')); }} onPress={() => { void mobileAnalytics.track('RECOMMENDATION_OPEN', { productId: product.id, reason }, branch?.id); router.push({ pathname: '/product/[slug]', params: { slug: product.slug } }); }} /></View>)}
        </ScrollView>
      ) : (
        <View style={styles.emptyProducts}><MaterialCommunityIcons name="chef-hat" size={34} color={colors.brand600} /><Text style={styles.emptyTitle}>La cocina está preparando novedades</Text><Text style={styles.emptyCopy}>Puedes revisar el menú completo mientras publicamos recomendaciones.</Text></View>
      )}

      <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>ELIGE TU EXPERIENCIA</Text><Text style={styles.sectionTitle}>Tres formas de disfrutar</Text></View></View>
      <View style={styles.modeGrid}>
        {[
          ['bike-fast', 'Delivery', 'Validamos cobertura y asignamos la mejor sede.'],
          ['shopping-outline', 'Recojo', 'Elige el local y evita tiempos de espera.'],
          ['silverware-fork-knife', 'En restaurante', 'Consulta el menú y luego pide desde el QR de mesa.'],
        ].map(([icon, title, copy]) => (
          <View key={title} style={styles.modeCard}>
            <View style={styles.modeIcon}><MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color={colors.brand700} /></View>
            <View style={styles.modeCopy}><Text style={styles.modeTitle}>{title}</Text><Text style={styles.modeDescription}>{copy}</Text></View>
          </View>
        ))}
      </View>

      <View style={styles.businessCard}>
        <MaterialCommunityIcons name="shield-check-outline" size={24} color={colors.brand700} />
        <View style={styles.businessCopy}><Text style={styles.businessTitle}>Compra con información clara</Text><Text style={styles.businessText}>Precios con IGV incluido · atención de {settings?.business.commercialName ?? 'Verde Bowl'}</Text></View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: 36 },
  header: { backgroundColor: colors.brand900, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phase: { borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.11)', paddingHorizontal: 10, paddingVertical: 7 },
  phaseText: { color: colors.brand100, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  hero: { backgroundColor: colors.brand900, paddingHorizontal: spacing.lg, paddingTop: 38, paddingBottom: 42 },
  kicker: { color: '#93c9ab', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { color: colors.surface, fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1.3, marginTop: 10 },
  heroCopy: { color: '#c6dbd0', fontSize: 15, lineHeight: 23, marginTop: 13, marginBottom: spacing.lg },
  heroButton: { marginTop: 12, backgroundColor: colors.accent500, borderColor: colors.accent500 },
  planBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.md, marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: '#badcc9', padding: 13 },
  planIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  planCopy: { flex: 1 },
  planEyebrow: { color: colors.brand600, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  planTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 3 },
  planText: { color: colors.inkMuted, fontSize: 9, marginTop: 3 },
  sectionHeader: { paddingHorizontal: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { color: colors.brand600, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.7, marginTop: 4 },
  seeAll: { color: colors.brand700, fontSize: 12, fontWeight: '900', paddingVertical: 5 },
  productRail: { paddingHorizontal: spacing.md, gap: 12, paddingBottom: 10 },
  reason: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.brand50, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6 },
  reasonText: { color: colors.brand700, fontSize: 9, fontWeight: '900' },
  emptyProducts: { marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', padding: spacing.lg },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 10 },
  emptyCopy: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  modeGrid: { paddingHorizontal: spacing.md, gap: 10 },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14 },
  modeIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  modeCopy: { flex: 1 },
  modeTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  modeDescription: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  businessCard: { marginHorizontal: spacing.md, marginTop: spacing.lg, flexDirection: 'row', gap: 12, backgroundColor: colors.brand50, borderRadius: radius.md, padding: 15 },
  businessCopy: { flex: 1 },
  businessTitle: { color: colors.brand900, fontSize: 13, fontWeight: '900' },
  businessText: { color: colors.brand700, fontSize: 11, lineHeight: 17, marginTop: 3 },
});
