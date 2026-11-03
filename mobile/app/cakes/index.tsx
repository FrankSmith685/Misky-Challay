import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { whatsappLink } from '../../src/lib/whatsapp';
import { useToast } from '../../src/providers/ToastProvider';
import { useCart } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { catalogApi } from '../../src/services/api/catalog.service';
import { geoApi } from '../../src/services/api/geo.service';
import { cakesApi, type CakeDesignRequest } from '../../src/services/api/cakes.service';
import { businessApi } from '../../src/services/api/business.service';
import { colors, radius, spacing, type } from '../../src/theme/tokens';

const statusText: Record<string, string> = { SUBMITTED: 'En revisión', REQUESTED: 'En revisión', QUOTED: 'Cotización lista', ACCEPTED: 'Aceptada', REJECTED: 'No disponible', EXPIRED: 'Vencida' };
const allergenLabels: Record<string, string> = { gluten: 'Gluten', lacteos: 'Lácteos', huevo: 'Huevo', 'frutos-secos': 'Frutos secos', mani: 'Maní', mariscos: 'Mariscos', pescado: 'Pescado', sesamo: 'Sésamo', soya: 'Soya', sulfitos: 'Sulfitos' };

export default function CakeDesignsScreen() {
  const params = useLocalSearchParams<{ solicitud?: string }>();
  const linkedRequest = Number(params.solicitud);
  const toast = useToast();
  const cart = useCart();
  const { branch } = usePurchase();
  const designs = useResource<CakeDesignRequest[]>({ key: 'cakes:designs:mine', fetcher: cakesApi.mine, cacheMs: 20_000, pollIntervalMs: 30000 });
  const settings = useResource({ key: 'business:public', fetcher: businessApi.publicSettings, cacheMs: 60_000 });
  const stopWhatsapp = useCallback(async (requestId: number) => {
    try { await cakesApi.stopDesignWhatsapp(requestId); await designs.refresh(); toast.show({ tone: 'success', message: 'Avisos de esta solicitud desactivados.' }); }
    catch (error) { toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos desactivar los avisos.' }); }
  }, [designs, toast]);
  const accept = useCallback(async (quoteId: number) => {
    try { await cakesApi.acceptQuote(quoteId); toast.show({ tone: 'success', message: 'Cotización aceptada. Agrégala al carrito para hacer tu pedido.' }); await designs.refresh(); }
    catch (error) { toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos aceptar la cotización.' }); }
  }, [designs, toast]);
  const addAccepted = useCallback(async (request: CakeDesignRequest, quote: CakeDesignRequest['quotes'][number]) => {
    if (branch?.id !== request.branchId) { Alert.alert('Sucursal diferente', 'Elige la misma sucursal de tu solicitud antes de agregar esta torta.'); router.push('/location'); return; }
    try {
      const [products, slots] = await Promise.all([catalogApi.products({ branchId: request.branchId }), geoApi.slots(request.branchId, 45)]);
      const product = products.find((entry) => entry.id === request.productId);
      const slot = slots.find((entry) => new Date(entry.startsAt).getTime() === new Date(quote.proposedAt).getTime());
      if (!product || !slot) throw new Error('El producto o la franja aprobada ya no está disponible. Pide una nueva cotización.');
      if (cart.items.some((item) => item.designQuoteId === quote.id)) throw new Error('Esta cotización ya está en tu carrito.');
      if (cart.items.some((item) => item.preferredSlotId && item.preferredSlotId !== slot.id)) throw new Error('Las tortas del mismo pedido deben tener la misma fecha.');
      const price = Number(quote.price);
      cart.addItem({ productId: request.productId, variantId: request.variantId, productName: product.name,
        variantName: request.requestKind === 'FREEFORM' ? `A medida · ${request.brief.servings} porciones` : product.defaultVariantName ?? 'Diseño especial',
        imageUrl: product.imageUrl, quantity: 1, unitPrice: price, lineTotal: price, description: request.description,
        selections: request.selectionsJson ?? [], designQuoteId: quote.id, preferredSlotId: slot.id });
      router.push('/(tabs)/cart');
    } catch (error) { Alert.alert('No pudimos agregar la torta', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
  }, [branch?.id, cart]);
  if (designs.loading && !designs.data) return <ScreenScaffold title="Mis diseños" showBack><View style={styles.loading}><Skeleton height={150} rounded="lg" count={2} gap={spacing.md} /></View></ScreenScaffold>;
  return <ScreenScaffold title="Mis diseños" subtitle="Solicitudes de tortas especiales" showBack>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={designs.refreshing} onRefresh={() => void designs.refresh()} tintColor={colors.brand600} />}>
      <View style={styles.intro}><MaterialCommunityIcons name="palette-outline" size={30} color={colors.brand700} /><View style={styles.introCopy}><Text style={styles.introTitle}>Tus ideas, bajo control</Text><Text style={styles.introText}>Aquí verás el avance, las referencias y las cotizaciones de cada torta.</Text></View></View>
      <PrimaryButton label="Solicitar otro diseño" icon="plus" onPress={() => router.push('/cakes/design' as never)} style={styles.newButton} />
      {designs.error ? <EmptyState icon="cloud-alert-outline" title="No pudimos cargar tus diseños" message={designs.error.message} actionLabel="Reintentar" onAction={() => void designs.refetch()} /> : null}
      {!designs.error && !(designs.data?.length) ? <EmptyState icon="cake-variant-outline" title="Todavía no tienes diseños" message="Sube una referencia y cuéntanos qué quieres celebrar." actionLabel="Crear mi primer diseño" onAction={() => router.push('/cakes/design' as never)} /> : null}
      {[...(designs.data ?? [])].sort((a, b) => Number(b.id === linkedRequest) - Number(a.id === linkedRequest)).map((request) => {
        const quote = request.quotes?.find((item) => item.status === 'PROPOSED' || item.status === 'ACCEPTED') ?? request.quotes?.[0];
        const supportLink = whatsappLink((settings.data?.business.whatsappPhone ?? settings.data?.business.phone), `Hola, tengo una consulta sobre mi solicitud de diseño #${request.id}.`);
        return <View key={request.id} style={styles.card}>
          <View style={styles.cardTop}><View style={styles.icon}><MaterialCommunityIcons name="cake-variant-outline" size={22} color={colors.brand700} /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>Solicitud #{request.id}</Text><Text style={styles.cardMeta}>{new Date(request.desiredAt).toLocaleDateString('es-PE')} · {request.brief?.occasion || 'Ocasión especial'}</Text></View><View style={styles.badge}><Text style={styles.badgeText}>{statusText[request.status] ?? request.status}</Text></View></View>
          <Text style={styles.description}>{request.description}</Text>
          {quote ? <View style={styles.quote}><Text style={styles.quoteTitle}>Cotización {quote.version ? `v${quote.version}` : ''}</Text><Text style={styles.quotePrice}>S/ {Number(quote.price).toFixed(2)}</Text><Text style={styles.quoteTerms}>{quote.terms}</Text>{quote.allergenCodesJson && <Text style={styles.quoteTerms}>{quote.allergenCodesJson.length ? `Alérgenos de los insumos: ${quote.allergenCodesJson.map((code) => allergenLabels[code] ?? code).join(', ')}.` : 'Los insumos cotizados no tienen alérgenos declarados de la lista.'} Consulta al equipo si tienes alergias; puede haber contacto cruzado.</Text>}{quote.status === 'PROPOSED' ? <PrimaryButton label="Aceptar cotización" onPress={() => void accept(quote.id)} style={styles.accept} /> : null}{quote.status === 'ACCEPTED' && !quote.orderId ? <PrimaryButton label="Agregar al carrito" onPress={() => void addAccepted(request, quote)} style={styles.accept} /> : null}</View> : <Text style={styles.waiting}>El equipo está revisando tu idea y te escribirá cuando tenga una propuesta.</Text>}
          {supportLink ? <PrimaryButton label="Consultar por WhatsApp" variant="secondary" onPress={() => void Linking.openURL(supportLink)} style={styles.accept} /> : null}
          {request.whatsappOptInAt ? <PrimaryButton label="Dejar de recibir avisos" variant="ghost" onPress={() => void stopWhatsapp(request.id)} style={styles.accept} /> : null}
        </View>;
      })}
    </ScrollView>
  </ScreenScaffold>;
}

const styles = StyleSheet.create({ content: { padding: spacing.md, paddingBottom: spacing.xxxl, backgroundColor: '#f3f7f4' }, loading: { padding: spacing.md }, intro: { flexDirection: 'row', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.brand50, padding: spacing.lg }, introCopy: { flex: 1 }, introTitle: { ...type.heading, color: colors.brand900 }, introText: { ...type.bodySm, color: colors.brand700, marginTop: 3 }, newButton: { marginTop: spacing.md }, card: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md, marginTop: spacing.md }, cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 }, cardCopy: { flex: 1 }, cardTitle: { ...type.heading, color: colors.ink }, cardMeta: { ...type.caption, color: colors.inkMuted, marginTop: 3 }, badge: { borderRadius: radius.pill, backgroundColor: colors.accent50, paddingHorizontal: 9, paddingVertical: 5 }, badgeText: { ...type.caption, color: colors.warning, fontWeight: '800' }, description: { ...type.bodySm, color: colors.ink, marginTop: spacing.md }, quote: { borderRadius: radius.md, backgroundColor: colors.brand50, padding: spacing.md, marginTop: spacing.md }, quoteTitle: { ...type.bodySm, color: colors.brand700, fontWeight: '800' }, quotePrice: { ...type.title, color: colors.brand900, marginTop: 3 }, quoteTerms: { ...type.caption, color: colors.inkMuted, marginTop: 3, lineHeight: 18 }, accept: { marginTop: spacing.md }, waiting: { ...type.bodySm, color: colors.inkMuted, marginTop: spacing.md },
});
