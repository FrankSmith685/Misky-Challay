import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { BottomSheet } from '../../src/components/BottomSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { money } from '../../src/lib/format';
import { useCart } from '../../src/providers/CartProvider';
import { useFavorites } from '../../src/providers/FavoritesProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { mobileAnalytics } from '../../src/services/analytics';
import { accountApi } from '../../src/services/api/account.service';
import { catalogApi } from '../../src/services/api/catalog.service';
import { customizationApi } from '../../src/services/api/customization.service';
import { engagementApi } from '../../src/services/api/engagement.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { AvailabilityAlert, ProductDetail, ProductReviews } from '../../src/types/domain';


export default function ProductDetailScreen() {
  const { slug, alerta } = useLocalSearchParams<{ slug: string; alerta?: string }>();
  const { branch } = usePurchase();
  const { addItem } = useCart();
  const { status, user } = useSession();
  const favorites = useFavorites();
  const toast = useToast();

  const branchId = branch?.id ?? null;

  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const detail = useResource<ProductDetail>({
    key: slug ? `catalog:product:${slug}:${branchId ?? 'sin-sede'}` : null,
    fetcher: () => catalogApi.product(slug, branchId),
  });

  const product = detail.data;
  const productId = product?.id ?? null;

  const reviews = useResource<ProductReviews>({
    key: productId === null ? null : `engagement:reviews:${productId}`,
    fetcher: () => engagementApi.reviews(productId ?? 0),
  });

  // La variante por defecto manda; si el backend cambia la carta, se recalcula.
  useEffect(() => {
    if (!product) return;
    const preferred = product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
    setVariantId(preferred?.id ?? null);
  }, [product]);

  useEffect(() => {
    if (productId === null) return;
    void mobileAnalytics.track('PRODUCT_VIEW', { productId }, branchId);
  }, [branchId, productId]);

  const selected =
    product?.variants.find((variant) => variant.id === variantId) ?? product?.variants[0] ?? null;

  const isFavorite = productId !== null && favorites.ids.has(productId);
  const isBuilder = product?.type === 'CUSTOMIZABLE';

  const toggleFavorite = () => {
    if (!product) return;
    if (status !== 'authenticated') {
      router.push({ pathname: '/(auth)/login', params: { returnTo: `/product/${product.slug}` } });
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void favorites.toggle(product.id).catch((caught: unknown) => {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos actualizar el favorito.',
        tone: 'error',
      });
    });
  };

  const addToCart = async () => {
    if (!product || !selected) return;

    setAdding(true);
    try {
      // Precio, descripción y total salen del backend: aquí no se multiplica nada.
      const quote = await customizationApi.quote({
        productId: product.id,
        variantId: selected.id,
        quantity,
        branchId,
        selections: [],
      });

      addItem({
        productId: product.id,
        variantId: selected.id,
        productName: product.name,
        variantName: selected.name,
        imageUrl: product.imageUrl,
        quantity,
        unitPrice: quote.unitPrice,
        lineTotal: quote.lineTotal,
        description: quote.description || product.description || product.name,
        selections: [],
      });

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void mobileAnalytics.track('CART_ADD', { productId: product.id, quantity }, branchId);

      toast.show({
        message: quantity === 1 ? 'Producto agregado. Revisa tu pedido.' : `${quantity} productos agregados.`,
        tone: 'success',
      });
      setQuantity(1);
      router.replace('/(tabs)/cart');
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos agregar este plato.',
        tone: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  /**
   * El aviso necesita saber en qué cocina debe volver el plato y a quién avisar:
   * sin sede o sin sesión, se resuelve eso primero en vez de morir en silencio.
   */
  const requestAlert = useCallback(() => {
    if (!product) return;

    if (branchId === null) {
      toast.show({
        message: 'Elige primero tu local o dirección para saber dónde debe volver el plato.',
        tone: 'warning',
        action: { label: 'Elegir', onPress: () => router.push('/location') },
      });
      return;
    }

    if (status !== 'authenticated') {
      router.push({ pathname: '/(auth)/login', params: { returnTo: `/product/${product.slug}` } });
      return;
    }

    setAlertOpen(true);
  }, [branchId, product, status, toast]);

  // Llegada desde el menú con «avísame» ya pulsado: la hoja se abre sola una vez.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || alerta !== '1' || !product || product.isAvailable) return;
    autoOpened.current = true;
    requestAlert();
  }, [alerta, product, requestAlert]);

  const heart = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      disabled={!product}
      hitSlop={layout.iconHitSlop}
      onPress={toggleFavorite}
      style={({ pressed }) => [styles.heart, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons
        name={isFavorite ? 'heart' : 'heart-outline'}
        size={23}
        color={isFavorite ? colors.danger : colors.brand700}
      />
    </Pressable>
  );

  if (detail.loading && !product) {
    return (
      <ScreenScaffold title="Ficha del plato">
        <View style={styles.skeleton}>
          <Skeleton height={240} rounded="lg" />
          <Skeleton width="60%" height={26} rounded="sm" style={styles.skeletonLine} />
          <Skeleton width="90%" height={15} rounded="sm" style={styles.skeletonLine} />
          <Skeleton height={64} rounded="md" count={2} gap={spacing.sm} style={styles.skeletonBlock} />
        </View>
      </ScreenScaffold>
    );
  }

  if (!product) {
    return (
      <ScreenScaffold title="Ficha del plato">
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos abrir este plato"
          message={detail.error?.message ?? 'Puede que ya no esté en la carta.'}
          actionLabel="Reintentar"
          onAction={() => void detail.refetch()}
          secondaryLabel="Volver al menú"
          onSecondary={() => router.push('/(tabs)/menu')}
        />
      </ScreenScaffold>
    );
  }

  const summary = reviews.data?.summary ?? { average: 0, count: 0 };

  return (
    <ScreenScaffold
      title={isBuilder ? 'Arma tu bowl' : 'Ficha del plato'}
      headerRight={heart}
      footer={
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <Text numberOfLines={1} style={styles.footerVariant}>
              {selected ? selected.name : 'Sin variantes disponibles'}
            </Text>
            {selected && (
              <Text style={styles.footerPrice}>
                {money(selected.basePrice)}
                {!isBuilder && quantity > 1 ? <Text style={styles.perUnit}> c/u</Text> : null}
              </Text>
            )}
          </View>

          {!product.isAvailable ? (
            <PrimaryButton
              variant="secondary"
              label="Avísame cuando vuelva"
              onPress={requestAlert}
            />
          ) : isBuilder ? (
            <PrimaryButton
              label="Personalizar mi bowl"
              onPress={() =>
                router.push({
                  pathname: '/builder/[productId]',
                  params: { productId: String(product.id) },
                })
              }
            />
          ) : (
            <View style={styles.footerActions}>
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={20}
                label={product.name}
                disabled={adding}
              />
              <PrimaryButton
                label="Agregar y revisar carrito"
                icon="shopping-outline"
                trailingIcon="arrow-right"
                loading={adding}
                disabled={!selected}
                onPress={() => void addToCart()}
                style={styles.addButton}
              />
            </View>
          )}
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <AppImage
            uri={product.imageUrl}
            style={styles.image}
            priority="high"
            fallbackIconSize={64}
            accessibilityLabel={product.name}
          />
          <View style={[styles.badge, product.isAvailable ? styles.available : styles.soldOut]}>
            <MaterialCommunityIcons
              name={product.isAvailable ? 'check-circle-outline' : 'clock-alert-outline'}
              size={15}
              color={product.isAvailable ? colors.brand700 : colors.onDark}
            />
            <Text style={[styles.badgeText, !product.isAvailable && styles.badgeTextDark]}>
              {product.isAvailable ? 'Disponible' : 'Agotado por ahora'}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.eyebrow}>
            {isBuilder ? 'PERSONALIZABLE' : 'RECETA VERDE BOWL'}
          </Text>
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.description}>
            {product.description || 'Preparado fresco con ingredientes seleccionados.'}
          </Text>

          {product.dietaryTags.length > 0 && (
            <View style={styles.tags}>
              {product.dietaryTags.map((tag) => (
                <View key={tag.code} style={styles.tag}>
                  <MaterialCommunityIcons name="leaf" size={14} color={colors.brand700} />
                  <Text style={styles.tagText}>{tag.name}</Text>
                </View>
              ))}
            </View>
          )}

          {!product.isAvailable && (
            <View style={styles.soldOutNotice}>
              <MaterialCommunityIcons name="bell-ring-outline" size={21} color={colors.brand700} />
              <View style={styles.soldOutCopy}>
                <Text style={styles.soldOutTitle}>Se acabó en esta cocina</Text>
                <Text style={styles.soldOutText}>
                  Te escribimos una sola vez, en cuanto vuelva
                  {branch ? ` a ${branch.name}` : ''}.
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>Elige tu tamaño</Text>
          <View style={styles.variants}>
            {product.variants.map((variant) => {
              const isSelected = variant.id === selected?.id;
              return (
                <Pressable
                  key={variant.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${variant.name}, ${money(variant.basePrice)}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setVariantId(variant.id);
                  }}
                  style={({ pressed }) => [
                    styles.variant,
                    isSelected && styles.variantSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.variantCopy}>
                    <Text style={styles.variantName}>{variant.name}</Text>
                    {variant.isDefault && <Text style={styles.variantHint}>El más elegido</Text>}
                  </View>
                  <View style={styles.variantRight}>
                    <Text style={styles.variantPrice}>{money(variant.basePrice)}</Text>
                    <MaterialCommunityIcons
                      name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                      size={22}
                      color={isSelected ? colors.brand600 : '#a3aea8'}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {selected?.nutrition && (
            <>
              <Text style={styles.sectionTitle}>Información nutricional</Text>
              <View style={styles.nutrition}>
                {[
                  { label: 'Calorías', value: selected.nutrition.calories, unit: 'kcal' },
                  { label: 'Proteína', value: selected.nutrition.protein, unit: 'g' },
                  { label: 'Carbos', value: selected.nutrition.carbs, unit: 'g' },
                  { label: 'Grasas', value: selected.nutrition.fat, unit: 'g' },
                ].map((item) => (
                  <View key={item.label} style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>
                      {Math.round(item.value)}
                      <Text style={styles.nutritionUnit}> {item.unit}</Text>
                    </Text>
                    <Text style={styles.nutritionLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {product.allergens.length > 0 && (
            <View style={styles.allergens}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.warning} />
              <View style={styles.allergensCopy}>
                <Text style={styles.allergensTitle}>
                  Contiene {product.allergens.map((item) => item.name).join(' · ')}
                </Text>
                <Text style={styles.allergensText}>
                  Preparamos todo en la misma cocina, así que no podemos descartar trazas.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.reviewHeader}>
            <View style={styles.reviewHeaderCopy}>
              <Text style={styles.sectionTitleFlush}>Opiniones verificadas</Text>
              <Text style={styles.reviewCount}>
                {summary.count > 0
                  ? `${summary.average.toFixed(1)} de 5 · ${summary.count} ${
                      summary.count === 1 ? 'reseña' : 'reseñas'
                    }`
                  : 'Aún no hay reseñas de este plato'}
              </Text>
            </View>
            {summary.count > 0 && (
              <View style={styles.rating}>
                <MaterialCommunityIcons name="star" size={21} color={colors.accent500} />
                <Text style={styles.ratingText}>{summary.average.toFixed(1)}</Text>
              </View>
            )}
          </View>

          {(reviews.data?.reviews ?? []).slice(0, 3).map((review) => (
            <View key={review.id} style={styles.review}>
              <View style={styles.reviewTop}>
                <Text style={styles.reviewAuthor}>{review.authorName}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <MaterialCommunityIcons
                      key={star}
                      name={star <= review.rating ? 'star' : 'star-outline'}
                      size={15}
                      color={colors.accent500}
                    />
                  ))}
                </View>
              </View>
              {review.verifiedPurchase && (
                <Text style={styles.reviewVerified}>Compra verificada</Text>
              )}
              {review.comment ? (
                <Text style={styles.reviewComment}>{review.comment}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>

      <AvailabilityAlertSheet
        visible={alertOpen}
        onClose={() => setAlertOpen(false)}
        productId={product.id}
        productName={product.name}
        branchId={branchId}
        branchName={branch?.name ?? null}
        canEmail={Boolean(user?.email)}
      />
    </ScreenScaffold>
  );
}

interface AvailabilityAlertSheetProps {
  visible: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  branchId: number | null;
  branchName: string | null;
  /** Sin correo en la cuenta, el backend rechaza el canal de email. */
  canEmail: boolean;
}

/** Alta, edición y baja del aviso de vuelta a stock, con sus dos canales. */
function AvailabilityAlertSheet({
  visible,
  onClose,
  productId,
  productName,
  branchId,
  branchName,
  canEmail,
}: AvailabilityAlertSheetProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<AvailabilityAlert | null>(null);
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(canEmail);

  useEffect(() => {
    if (!visible || branchId === null) return;

    let active = true;
    setLoading(true);
    accountApi
      .availabilityAlert(productId, branchId)
      .then((row) => {
        if (!active) return;
        setAlert(row);
        if (row && row.status === 'WAITING') {
          setNotifyInApp(row.notifyInApp);
          setNotifyEmail(row.notifyEmail && canEmail);
        }
      })
      .catch(() => {
        // Que no se pueda leer el estado previo no impide crear uno nuevo.
        if (active) setAlert(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchId, canEmail, productId, visible]);

  const waiting = alert?.status === 'WAITING';

  const save = async () => {
    if (branchId === null) return;
    if (!notifyEmail && !notifyInApp) {
      toast.show({ message: 'Elige al menos un canal para avisarte.', tone: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const saved = await accountApi.subscribeAvailabilityAlert({
        productId,
        branchId,
        notifyEmail,
        notifyInApp,
      });
      setAlert(saved);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        message: `Listo. Te avisamos cuando vuelva ${productName}.`,
        tone: 'success',
      });
      onClose();
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos crear el aviso.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (branchId === null) return;

    setSaving(true);
    try {
      await accountApi.cancelAvailabilityAlert(productId, branchId);
      setAlert(null);
      toast.show({ message: 'Aviso cancelado.', tone: 'info' });
      onClose();
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos cancelar el aviso.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={waiting ? 'Tu aviso está activo' : 'Avísame cuando vuelva'}
      subtitle={
        waiting
          ? 'Puedes cambiar los canales o cancelarlo cuando quieras.'
          : `Te escribimos una sola vez, en cuanto ${productName} vuelva a la carta.`
      }
      footer={
        <View style={styles.sheetActions}>
          {waiting ? (
            <PrimaryButton
              variant="secondary"
              label="Cancelar aviso"
              disabled={saving}
              onPress={() => void cancel()}
              style={styles.sheetSecondary}
            />
          ) : null}
          <PrimaryButton
            label={waiting ? 'Guardar canales' : 'Crear aviso'}
            loading={saving}
            disabled={loading}
            onPress={() => void save()}
            style={styles.sheetPrimary}
          />
        </View>
      }
    >
      <View style={styles.sheetBranch}>
        <MaterialCommunityIcons name="storefront-outline" size={21} color={colors.brand700} />
        <View style={styles.sheetBranchCopy}>
          <Text style={styles.sheetBranchLabel}>Disponibilidad en</Text>
          <Text numberOfLines={1} style={styles.sheetBranchName}>
            {branchName ?? 'la cocina que te atiende'}
          </Text>
        </View>
      </View>

      {loading ? (
        <Skeleton height={54} rounded="md" count={2} gap={spacing.sm} style={styles.sheetBlock} />
      ) : (
        <View style={styles.sheetChannels}>
          <ChannelRow
            icon="bell-outline"
            label="Notificación en la app"
            checked={notifyInApp}
            onToggle={() => setNotifyInApp((value) => !value)}
          />
          <ChannelRow
            icon="email-outline"
            label="Correo electrónico"
            hint={canEmail ? undefined : 'Agrega un correo a tu cuenta para usar este canal'}
            disabled={!canEmail}
            checked={notifyEmail && canEmail}
            onToggle={() => setNotifyEmail((value) => !value)}
          />
        </View>
      )}

    </BottomSheet>
  );
}

function ChannelRow({
  icon,
  label,
  hint,
  checked,
  disabled = false,
  onToggle,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle();
      }}
      style={({ pressed }) => [
        styles.channel,
        checked && styles.channelChecked,
        disabled && styles.channelDisabled,
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={21} color={colors.brand700} />
      <View style={styles.channelCopy}>
        <Text style={styles.channelLabel}>{label}</Text>
        {hint ? <Text style={styles.channelHint}>{hint}</Text> : null}
      </View>
      <MaterialCommunityIcons
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={24}
        color={checked ? colors.brand600 : '#a3aea8'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
    backgroundColor: '#f3f7f4',
  },
  skeleton: {
    padding: spacing.md,
  },
  skeletonLine: {
    marginTop: spacing.md,
  },
  skeletonBlock: {
    marginTop: spacing.lg,
  },
  hero: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  image: {
    height: 320,
    borderRadius: radius.xl,
  },
  badge: {
    position: 'absolute',
    left: spacing.sm + spacing.xs,
    bottom: spacing.sm + spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  available: {
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  soldOut: {
    backgroundColor: 'rgba(18,61,43,0.92)',
  },
  badgeText: {
    ...type.label,
    color: colors.brand700,
  },
  badgeTextDark: {
    color: colors.onDark,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
  },
  eyebrow: {
    ...type.label,
    color: colors.brand600,
    letterSpacing: 1.2,
  },
  title: {
    ...type.hero,
    color: colors.ink,
    marginTop: 5,
  },
  description: {
    ...type.body,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  tagText: {
    ...type.caption,
    color: colors.brand700,
  },
  soldOutNotice: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  soldOutCopy: {
    flex: 1,
  },
  soldOutTitle: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  soldOutText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  sectionTitle: {
    ...type.heading,
    color: colors.ink,
    marginTop: spacing.xl,
    marginBottom: spacing.sm + spacing.xs,
  },
  sectionTitleFlush: {
    ...type.heading,
    color: colors.ink,
  },
  variants: {
    gap: spacing.sm,
  },
  variant: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  variantSelected: {
    borderColor: '#8dc2a6',
    backgroundColor: colors.brand50,
  },
  variantCopy: {
    flex: 1,
  },
  variantName: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  variantHint: {
    ...type.caption,
    color: colors.brand600,
    marginTop: 3,
  },
  variantRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  variantPrice: {
    ...type.heading,
    color: colors.brand700,
  },
  nutrition: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
  },
  nutritionItem: {
    flex: 1,
    alignItems: 'center',
  },
  nutritionValue: {
    ...type.heading,
    color: colors.ink,
  },
  nutritionUnit: {
    ...type.caption,
    color: colors.inkMuted,
  },
  nutritionLabel: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 4,
  },
  allergens: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#fff7e5',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  allergensCopy: {
    flex: 1,
  },
  allergensTitle: {
    ...type.body,
    color: '#7a4d00',
    fontWeight: '800',
  },
  allergensText: {
    ...type.bodySm,
    color: '#8a5b12',
    marginTop: 3,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.sm + spacing.xs,
  },
  reviewHeaderCopy: {
    flex: 1,
  },
  reviewCount: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingText: {
    ...type.heading,
    color: colors.ink,
  },
  review: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.sm,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewAuthor: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  stars: {
    flexDirection: 'row',
  },
  reviewVerified: {
    ...type.caption,
    color: colors.success,
    marginTop: 3,
  },
  reviewComment: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  heart: {
    width: 48,
    height: 48,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
  footerTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  footerVariant: {
    ...type.bodySm,
    flex: 1,
    color: colors.inkMuted,
  },
  footerPrice: {
    ...type.heading,
    color: colors.brand700,
  },
  perUnit: {
    ...type.caption,
    color: colors.inkMuted,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  addButton: {
    flex: 1,
  },
  sheetBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    padding: spacing.sm + spacing.xs,
    ...shadow.sm,
  },
  sheetBranchCopy: {
    flex: 1,
  },
  sheetBranchLabel: {
    ...type.caption,
    color: colors.inkMuted,
  },
  sheetBranchName: {
    ...type.body,
    color: colors.ink,
    fontWeight: '800',
  },
  sheetBlock: {
    marginTop: spacing.md,
  },
  sheetChannels: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  channel: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  channelChecked: {
    borderColor: '#8dc2a6',
    backgroundColor: colors.brand50,
  },
  channelDisabled: {
    opacity: 0.6,
  },
  channelCopy: {
    flex: 1,
  },
  channelLabel: {
    ...type.body,
    color: colors.ink,
    fontWeight: '700',
  },
  channelHint: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    marginTop: spacing.lg,
  },
  sheetSecondary: {
    flex: 1,
  },
  sheetPrimary: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
  },
});
