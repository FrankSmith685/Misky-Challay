import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppImage } from './AppImage';
import { colors, layout, radius, shadow, spacing, type } from '../theme/tokens';
import type { Product } from '../types/domain';

export interface ProductCardProps {
  product: Product;
  /**
   * Las tres acciones reciben el producto para que la pantalla pueda pasar
   * funciones estables (`useCallback` sin dependencias por fila). Es lo que
   * permite que `memo` sirva de algo: antes cada corazón pulsado volvía a
   * dibujar todas las tarjetas visibles.
   */
  onPress: (product: Product) => void;
  compact?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (product: Product) => void;
  /** Añadir sin salir del menú. Solo aparece en platos FIJOS y disponibles. */
  onQuickAdd?: (product: Product) => void;
  /** Alta en el aviso de vuelta a stock. Solo aparece si el plato está agotado. */
  onNotifyAvailability?: (product: Product) => void;
  /** Mientras se cotiza y añade este plato en concreto. */
  busy?: boolean;
  /** Códigos de etiqueta a nombre legible (GET /catalog/dietary-tags). */
  tagLabels?: Record<string, string>;
  /** Códigos de alérgeno a nombre legible (GET /catalog/allergens). */
  allergenLabels?: Record<string, string>;
  /**
   * Alérgenos que el cliente declaró evitar. Solo se avisa en rojo de los que
   * chocan con su perfil: marcar todos en rojo sería ruido y dejaría de leerse.
   */
  alertAllergens?: readonly string[];
}

const money = (value: number): string => `S/ ${value.toFixed(2)}`;

/** «alto-en-proteina» sin diccionario cargado se lee como «Alto en proteina». */
const humanize = (code: string): string => {
  const words = code.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const MAX_TAGS = 2;

function ProductCardView({
  product,
  onPress,
  compact = false,
  isFavorite = false,
  onToggleFavorite,
  onQuickAdd,
  onNotifyAvailability,
  busy = false,
  tagLabels,
  allergenLabels,
  alertAllergens,
}: ProductCardProps) {
  const isBuilder = product.type === 'CUSTOMIZABLE';
  const tags = product.dietaryTags.slice(0, MAX_TAGS);
  const extraTags = product.dietaryTags.length - tags.length;

  const warnings = (alertAllergens ?? []).filter((code) => product.allergens.includes(code));
  const canQuickAdd = product.isAvailable && !isBuilder && product.defaultVariantId !== null;

  const openDetail = () => onPress(product);

  const stopAnd = (action?: (item: Product) => void) => (event: GestureResponderEvent) => {
    event.stopPropagation();
    action?.(product);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, desde ${money(product.priceFrom)}${
        product.isAvailable ? '' : ', agotado'
      }`}
      onPress={openDetail}
      style={({ pressed }) => [
        styles.card,
        shadow.sm,
        compact && styles.cardCompact,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.media, compact ? styles.mediaCompact : styles.mediaWide]}>
        <AppImage
          uri={product.imageUrl}
          style={styles.image}
          transitionMs={180}
          fallbackIconSize={compact ? 34 : 44}
        />

        {!product.isAvailable && (
          <View style={styles.soldOut}>
            <Text style={styles.soldOutText}>Agotado</Text>
          </View>
        )}

        {product.isFeatured && product.isAvailable && (
          <View style={styles.featured}>
            <MaterialCommunityIcons name="star" size={13} color={colors.surface} />
            <Text style={styles.featuredText}>Top</Text>
          </View>
        )}
      </View>

      <View style={[styles.body, compact && styles.bodyCompact]}>
        <Text numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>

        <Text numberOfLines={2} style={styles.description}>
          {product.description || 'Preparado fresco en nuestra cocina.'}
        </Text>

        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.map((code) => (
              <View key={code} style={styles.tag}>
                <MaterialCommunityIcons name="leaf" size={12} color={colors.brand700} />
                <Text style={styles.tagText}>{tagLabels?.[code] ?? humanize(code)}</Text>
              </View>
            ))}
            {extraTags > 0 && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>+{extraTags}</Text>
              </View>
            )}
          </View>
        )}

        {warnings.length > 0 && (
          <View style={styles.warning}>
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.danger} />
            <Text numberOfLines={1} style={styles.warningText}>
              Contiene {warnings.map((code) => allergenLabels?.[code] ?? humanize(code)).join(', ')}
            </Text>
          </View>
        )}

        {product.nutrition && (
          <View style={styles.nutrition}>
            <MaterialCommunityIcons name="fire" size={14} color={colors.inkMuted} />
            <Text style={styles.nutritionText}>
              {Math.round(product.nutrition.calories)} kcal
            </Text>
            <View style={styles.nutritionDivider} />
            <Text style={styles.nutritionText}>
              {Math.round(product.nutrition.protein)} g proteína
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>{isBuilder ? 'Desde' : 'Precio'}</Text>
            <Text style={styles.price}>
              {money(isBuilder ? product.priceFrom : product.defaultVariantPrice || product.priceFrom)}
            </Text>
          </View>

          {!product.isAvailable && onNotifyAvailability ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Avisarme cuando vuelva ${product.name}`}
              onPress={stopAnd(onNotifyAvailability)}
              style={({ pressed }) => [styles.notify, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="bell-outline" size={18} color={colors.brand700} />
              <Text style={styles.notifyText}>Avísame</Text>
            </Pressable>
          ) : null}

          {canQuickAdd && onQuickAdd ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Agregar ${product.name} al carrito`}
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={stopAnd(onQuickAdd)}
              style={({ pressed }) => [styles.add, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <MaterialCommunityIcons name="plus" size={24} color={colors.surface} />
              )}
            </Pressable>
          ) : null}

          {product.isAvailable && isBuilder ? (
            <View style={styles.builder}>
              <MaterialCommunityIcons name="tune-variant" size={17} color={colors.brand700} />
              <Text style={styles.builderText}>Armar</Text>
            </View>
          ) : null}
        </View>
      </View>

      {onToggleFavorite && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          accessibilityLabel={
            isFavorite
              ? `Quitar ${product.name} de favoritos`
              : `Guardar ${product.name} en favoritos`
          }
          hitSlop={layout.iconHitSlop}
          onPress={stopAnd(onToggleFavorite)}
          style={({ pressed }) => [styles.favorite, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={22}
            color={isFavorite ? colors.danger : colors.brand700}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

/**
 * Memoizada a propósito: en el menú hay decenas de tarjetas y cualquier cambio de
 * estado de la pantalla (escribir en el buscador, marcar un favorito) volvía a
 * dibujarlas todas. Con acciones estables solo se redibuja la que cambió.
 */
export const ProductCard = memo(ProductCardView);

const styles = StyleSheet.create({
  card: {
    width: 276,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  cardCompact: {
    width: '100%',
    flexDirection: 'row',
    borderRadius: radius.md,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  media: {
    backgroundColor: colors.brand50,
  },
  mediaWide: {
    height: 164,
  },
  mediaCompact: {
    width: 118,
  },
  image: {
    flex: 1,
  },
  soldOut: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,32,26,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soldOutText: {
    ...type.caption,
    color: colors.onDark,
  },
  featured: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent500,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  featuredText: {
    ...type.caption,
    color: colors.surface,
  },
  body: {
    flex: 1,
    padding: spacing.sm + spacing.xs,
  },
  /** En la fila compacta el corazón flota sobre el texto: hay que reservarle sitio. */
  bodyCompact: {
    paddingRight: spacing.xl + spacing.sm,
  },
  name: {
    ...type.heading,
    color: colors.ink,
  },
  description: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagText: {
    ...type.caption,
    color: colors.brand700,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  warningText: {
    ...type.caption,
    flex: 1,
    color: colors.danger,
  },
  nutrition: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: spacing.sm,
  },
  nutritionText: {
    ...type.caption,
    color: colors.inkMuted,
  },
  nutritionDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.line,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm + spacing.xs,
  },
  priceBox: {
    flex: 1,
  },
  priceLabel: {
    ...type.caption,
    color: colors.inkMuted,
  },
  price: {
    ...type.heading,
    color: colors.brand700,
  },
  add: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  notify: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
    paddingHorizontal: 12,
  },
  notifyText: {
    ...type.label,
    color: colors.brand700,
  },
  builder: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
    paddingHorizontal: 12,
  },
  builderText: {
    ...type.label,
    color: colors.brand700,
  },
  favorite: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
});
