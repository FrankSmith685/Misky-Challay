import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { resolvePublicAssetUrl } from '../../src/config/env';
import { useCart } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { colors, radius, spacing } from '../../src/theme/tokens';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { items, units, subtotal, setQuantity, removeItem, clear } = useCart();
  const { serviceMode } = usePurchase();
  const proceed = () => serviceMode === 'DINE_IN' ? router.push('/scan-table' as Href) : router.push('/checkout' as Href);
  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>TU PEDIDO</Text><Text style={styles.title}>Carrito</Text></View>{items.length > 0 && <Pressable onPress={() => Alert.alert('Vaciar carrito', '¿Retirar todos los productos?', [{ text: 'Cancelar' }, { text: 'Vaciar', style: 'destructive', onPress: () => void clear() }])}><Text style={styles.clear}>Vaciar</Text></Pressable>}</View>
    {items.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><MaterialCommunityIcons name="shopping-outline" size={43} color={colors.brand700} /></View><Text style={styles.emptyTitle}>Tu carrito está esperando</Text><Text style={styles.emptyCopy}>Explora la carta y agrega una receta o construye un bowl a tu gusto.</Text><PrimaryButton label="Explorar el menú" onPress={() => router.push('/(tabs)/menu')} style={styles.emptyButton} /></View> : <>
      <View style={styles.lines}>{items.map((item) => { const uri = resolvePublicAssetUrl(item.imageUrl); return <View key={item.id} style={styles.line}>
        {uri ? <Image source={{ uri }} style={styles.image} /> : <View style={styles.imageFallback}><MaterialCommunityIcons name="bowl-mix-outline" size={26} color={colors.brand600} /></View>}
        <View style={styles.lineCopy}><Text style={styles.name}>{item.productName}</Text><Text style={styles.variant}>{item.variantName}</Text><Text numberOfLines={2} style={styles.description}>{item.description}</Text><View style={styles.controls}><Pressable style={styles.qty} onPress={() => setQuantity(item.id, item.quantity - 1)}><MaterialCommunityIcons name="minus" size={17} color={colors.brand700} /></Pressable><Text style={styles.count}>{item.quantity}</Text><Pressable style={styles.qty} onPress={() => setQuantity(item.id, item.quantity + 1)}><MaterialCommunityIcons name="plus" size={17} color={colors.brand700} /></Pressable><Pressable style={styles.trash} onPress={() => removeItem(item.id)}><MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.danger} /></Pressable></View></View>
        <Text style={styles.lineTotal}>S/ {item.lineTotal.toFixed(2)}</Text>
      </View>; })}</View>
      <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>{units} {units === 1 ? 'producto' : 'productos'}</Text><Text style={styles.summaryValue}>S/ {subtotal.toFixed(2)}</Text></View><Text style={styles.hint}>Delivery, descuentos e IGV se recalculan antes de confirmar.</Text><PrimaryButton label={serviceMode === 'DINE_IN' ? 'Escanear QR de mi mesa' : 'Continuar al checkout'} onPress={proceed} style={styles.checkout} /></View>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted }, content: { paddingHorizontal: spacing.md, paddingBottom: 110 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: colors.brand600, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.ink, fontSize: 30, fontWeight: '900', marginTop: 3 }, clear: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.xl, marginTop: spacing.xl }, emptyIcon: { width: 82, height: 82, borderRadius: 27, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 17 }, emptyCopy: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }, emptyButton: { width: '100%', marginTop: spacing.lg },
  lines: { gap: 10, marginTop: spacing.lg }, line: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 }, image: { width: 72, height: 72, borderRadius: 13 }, imageFallback: { width: 72, height: 72, borderRadius: 13, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }, lineCopy: { flex: 1 }, name: { color: colors.ink, fontSize: 14, fontWeight: '900' }, variant: { color: colors.brand700, fontSize: 10, fontWeight: '800', marginTop: 2 }, description: { color: colors.inkMuted, fontSize: 9, lineHeight: 13, marginTop: 4 }, lineTotal: { color: colors.brand800, fontSize: 13, fontWeight: '900' }, controls: { flexDirection: 'row', alignItems: 'center', marginTop: 9 }, qty: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }, count: { minWidth: 30, textAlign: 'center', color: colors.ink, fontWeight: '900' }, trash: { marginLeft: 12, padding: 4 },
  summary: { backgroundColor: colors.brand900, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between' }, summaryLabel: { color: '#c8ddd2', fontSize: 13 }, summaryValue: { color: colors.surface, fontSize: 22, fontWeight: '900' }, hint: { color: '#9fc2b1', fontSize: 10, lineHeight: 15, marginTop: 8 }, checkout: { marginTop: spacing.md, backgroundColor: colors.accent500, borderColor: colors.accent500 },
});
