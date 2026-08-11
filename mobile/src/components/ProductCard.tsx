import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { resolvePublicAssetUrl } from '../config/env';
import { colors, radius } from '../theme/tokens';
import type { Product } from '../types/domain';

const money = (value: number) => `S/ ${value.toFixed(2)}`;

export function ProductCard({ product, onPress, compact = false, isFavorite = false, onToggleFavorite }: { product: Product; onPress: () => void; compact?: boolean; isFavorite?: boolean; onToggleFavorite?: () => void }) {
  const imageUrl = resolvePublicAssetUrl(product.imageUrl);
  const [brokenImage, setBrokenImage] = useState(false);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}>
      <View style={[styles.media, compact && styles.mediaCompact]}>
        {imageUrl && !brokenImage ? <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" onError={() => setBrokenImage(true)} /> : (
          <View style={styles.fallback}><MaterialCommunityIcons name="bowl-mix-outline" size={42} color="#79b697" /></View>
        )}
        {!product.isAvailable && <View style={styles.unavailable}><Text style={styles.unavailableText}>Agotado</Text></View>}
        {product.isFeatured && product.isAvailable && <View style={styles.featured}><Text style={styles.featuredText}>Favorito</Text></View>}
        {onToggleFavorite && <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? `Quitar ${product.name} de favoritos` : `Guardar ${product.name} en favoritos`} onPress={(event: GestureResponderEvent) => { event.stopPropagation(); onToggleFavorite(); }} style={styles.favorite}><MaterialCommunityIcons name={isFavorite ? 'heart' : 'heart-outline'} size={21} color={isFavorite ? colors.danger : colors.brand700} /></Pressable>}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>{product.name}</Text>
        <Text numberOfLines={2} style={styles.description}>{product.description || 'Preparado fresco en nuestra cocina.'}</Text>
        <View style={styles.meta}>
          <Text style={styles.price}>Desde {money(product.priceFrom)}</Text>
          {product.nutrition && <Text style={styles.calories}>{Math.round(product.nutrition.calories)} kcal</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 276, overflow: 'hidden', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, shadowColor: colors.brand900, shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  cardCompact: { width: '100%', flexDirection: 'row', borderRadius: radius.md },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  media: { height: 158, backgroundColor: colors.brand50 },
  mediaCompact: { width: 116, height: 132 },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  unavailable: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(20,32,26,.86)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  unavailableText: { color: colors.surface, fontSize: 10, fontWeight: '900' },
  featured: { position: 'absolute', top: 10, left: 10, backgroundColor: colors.accent500, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  featuredText: { color: colors.surface, fontSize: 10, fontWeight: '900' },
  favorite: { position: 'absolute', top: 9, right: 9, width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.95)', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  body: { flex: 1, padding: 14 },
  name: { color: colors.ink, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  description: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 5, minHeight: 36 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 11 },
  price: { color: colors.brand700, fontSize: 13, fontWeight: '900' },
  calories: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
});
