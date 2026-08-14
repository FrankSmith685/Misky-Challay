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
import { money } from '../lib/format';
import { colors, layout, radius, spacing, type } from '../theme/tokens';
import type { Product } from '../types/domain';

interface MenuProductRowProps {
  product: Product;
  isFavorite: boolean;
  busy?: boolean;
  tagLabels?: Record<string, string>;
  allergenLabels?: Record<string, string>;
  alertAllergens?: readonly string[];
  onPress: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onNotifyAvailability: (product: Product) => void;
}

const humanize = (code: string) => {
  const words = code.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function MenuProductRowView({
  product,
  isFavorite,
  busy = false,
  tagLabels,
  allergenLabels,
  alertAllergens,
  onPress,
  onToggleFavorite,
  onQuickAdd,
  onNotifyAvailability,
}: MenuProductRowProps) {
  const isBuilder = product.type === 'CUSTOMIZABLE';
  const price = isBuilder ? product.priceFrom : product.defaultVariantPrice || product.priceFrom;
  const tag = product.dietaryTags[0];
  const warnings = (alertAllergens ?? []).filter((code) => product.allergens.includes(code));
  const canQuickAdd = product.isAvailable && !isBuilder && product.defaultVariantId !== null;

  const stopAnd = (action: (item: Product) => void) => (event: GestureResponderEvent) => {
    event.stopPropagation();
    action(product);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${isBuilder ? 'desde ' : ''}${money(price)}${
        product.isAvailable ? '' : ', agotado'
      }`}
      onPress={() => onPress(product)}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <View style={styles.media}>
        <AppImage
          uri={product.imageUrl}
          style={styles.image}
          transitionMs={160}
          fallbackIconSize={32}
        />
        {product.isFeatured && product.isAvailable ? (
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>Top</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={styles.name}>
            {product.name}
          </Text>
          {tag ? (
            <View style={styles.tag}>
              <Text numberOfLines={1} style={styles.tagText}>
                {tagLabels?.[tag] ?? humanize(tag)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text numberOfLines={2} style={styles.description}>
          {product.description || 'Preparado fresco en nuestra cocina.'}
        </Text>

        {warnings.length > 0 ? (
          <View style={styles.warning}>
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.danger} />
            <Text numberOfLines={1} style={styles.warningText}>
              Contiene {warnings.map((code) => allergenLabels?.[code] ?? humanize(code)).join(', ')}
            </Text>
          </View>
        ) : product.nutrition ? (
          <Text numberOfLines={1} style={styles.nutrition}>
            {Math.round(product.nutrition.calories)} kcal · {Math.round(product.nutrition.protein)}{' '}
            g proteína
          </Text>
        ) : null}

        <Text style={styles.price}>
          {isBuilder ? 'Desde ' : ''}
          {money(price)}
        </Text>
      </View>

      <View style={styles.actions}>
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
          style={({ pressed }) => [styles.favorite, pressed && styles.actionPressed]}
        >
          <MaterialCommunityIcons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={21}
            color={isFavorite ? colors.danger : colors.inkMuted}
          />
        </Pressable>

        {canQuickAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Agregar ${product.name}`}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={stopAnd(onQuickAdd)}
            style={({ pressed }) => [styles.add, pressed && styles.actionPressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <MaterialCommunityIcons name="plus" size={25} color={colors.surface} />
            )}
          </Pressable>
        ) : product.isAvailable && isBuilder ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Personalizar ${product.name}`}
            onPress={stopAnd(onPress)}
            style={({ pressed }) => [styles.customize, pressed && styles.actionPressed]}
          >
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.brand700} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Avisarme cuando vuelva ${product.name}`}
            onPress={stopAnd(onNotifyAvailability)}
            style={({ pressed }) => [styles.notify, pressed && styles.actionPressed]}
          >
            <MaterialCommunityIcons name="bell-outline" size={19} color={colors.brand700} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export const MenuProductRow = memo(MenuProductRowView);

const styles = StyleSheet.create({
  root: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  media: {
    width: 96,
    height: 108,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
  },
  image: {
    flex: 1,
  },
  topBadge: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.accent500,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  topBadgeText: {
    ...type.caption,
    color: colors.surface,
    fontWeight: '900',
  },
  content: {
    minWidth: 0,
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  titleLine: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  name: {
    ...type.body,
    minWidth: 0,
    flexShrink: 1,
    color: colors.ink,
    fontWeight: '900',
  },
  tag: {
    maxWidth: 96,
    flexShrink: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.brand50,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    ...type.caption,
    color: colors.brand700,
    fontSize: 11,
  },
  description: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 4,
  },
  nutrition: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 4,
  },
  warning: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  warningText: {
    ...type.caption,
    minWidth: 0,
    flex: 1,
    color: colors.danger,
  },
  price: {
    ...type.bodySm,
    color: colors.warning,
    fontWeight: '900',
    marginTop: 5,
  },
  actions: {
    width: layout.minTouch,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  favorite: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.brand600,
  },
  customize: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
  },
  notify: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  actionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});
