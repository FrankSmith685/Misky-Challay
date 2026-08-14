import { useCallback, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useResource } from '../../src/hooks/useResource';
import { money } from '../../src/lib/format';
import { useCart, type RemovedCartLine } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { plansApi } from '../../src/services/api/plans.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { CartItem, WalletSummary } from '../../src/types/domain';


interface CartLineProps {
  item: CartItem;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  onEdit: () => void;
}

/**
 * Una línea del carrito. El bowl armado se puede reeditar sin borrarlo: hasta
 * ahora había que quitarlo y rehacerlo entero desde cero.
 */
function CartLine({ item, onQuantity, onRemove, onEdit }: CartLineProps) {
  const isCustom = item.selections.length > 0;

  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <AppImage
          uri={item.imageUrl}
          style={styles.image}
          accessibilityLabel={item.productName}
          fallbackIconSize={28}
        />

        <View style={styles.lineCopy}>
          <Text numberOfLines={2} style={styles.name}>
            {item.productName}
          </Text>

          {item.variantName ? <Text style={styles.variant}>{item.variantName}</Text> : null}

          {item.description ? (
            <Text numberOfLines={2} style={styles.description}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.priceBox}>
          <Text style={styles.lineTotal}>{money(item.lineTotal)}</Text>
          <Text style={styles.unitPrice}>{money(item.unitPrice)} c/u</Text>
        </View>
      </View>

      <View style={styles.lineActions}>
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantity}
          size="sm"
          minBehavior="remove"
          onRemove={onRemove}
          label={item.productName}
        />

        {isCustom ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Editar ${item.productName}`}
            hitSlop={layout.iconHitSlop}
            onPress={onEdit}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="pencil-outline" size={17} color={colors.brand700} />
            <Text style={styles.editLabel}>Editar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function CartScreen() {
  const { items, units, subtotal, hydrated, setQuantity, removeItem, restoreItem, beginEdit, cancelEdit, clear } =
    useCart();
  const { serviceMode, branch } = usePurchase();
  const { status } = useSession();
  const toast = useToast();

  /*
   * Llegar aquí significa que la edición que empezó en esta pantalla no acabó en
   * el constructor: la línea original sigue intacta, así que el próximo bowl que
   * se agregue tiene que ser uno nuevo y no un reemplazo.
   */
  useFocusEffect(
    useCallback(() => {
      cancelEdit();
    }, [cancelEdit]),
  );

  const wallet = useResource<WalletSummary>({
    key: status === 'authenticated' && items.length > 0 ? 'plans:wallet' : null,
    fetcher: () => plansApi.wallet(),
  });
  const walletBalance = wallet.data && wallet.data.balance > 0 ? wallet.data.balance : null;

  const handleRemove = useCallback(
    (item: CartItem) => {
      const removed: RemovedCartLine | null = removeItem(item.id);
      if (!removed) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      /*
       * Quitar era la única acción destructiva muda del recorrido. No se pregunta
       * antes —sería un peaje en la acción más repetida del carrito—: se avisa y
       * se puede revertir sin perder el sitio que ocupaba la línea.
       */
      toast.show({
        message: `Quitamos ${item.productName} del carrito`,
        tone: 'info',
        action: { label: 'Deshacer', onPress: () => restoreItem(removed) },
      });
    },
    [removeItem, restoreItem, toast],
  );

  const handleEdit = useCallback(
    (item: CartItem) => {
      const editing = beginEdit(item.id);
      if (!editing) return;
      void Haptics.selectionAsync();
      // El constructor recibe el id para precargar la receta; el reemplazo en su
      // sitio lo resuelve CartProvider cuando vuelva el mismo producto.
      router.push({
        pathname: '/builder/[productId]',
        params: { productId: String(item.productId), editItemId: item.id },
      });
    },
    [beginEdit],
  );

  const confirmClear = useCallback(() => {
    Alert.alert(
      '¿Vaciar todo el carrito?',
      `Se quitarán ${units} ${units === 1 ? 'producto' : 'productos'} por ${money(subtotal)}. Esto no se puede deshacer.`,
      [
        { text: 'Conservar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: () => {
            void clear();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  }, [clear, subtotal, units]);

  const proceed = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (serviceMode === 'DINE_IN') {
      router.push('/scan-table');
      return;
    }

    /*
     * El checkout exige sesión. Se avisa AQUÍ, antes de dar el paso: llegar al
     * checkout y ser rebotado a la pantalla de acceso se lee como un error de la
     * tienda, no como un requisito.
     */
    if (status !== 'authenticated') {
      router.push({ pathname: '/(auth)/login', params: { returnTo: '/checkout' } });
      return;
    }

    router.push('/checkout');
  }, [serviceMode, status]);

  const ctaLabel = useMemo(() => {
    if (serviceMode === 'DINE_IN') return 'Escanear el QR de mi mesa';
    if (status !== 'authenticated') return 'Inicia sesión para continuar';
    return 'Continuar al checkout';
  }, [serviceMode, status]);

  const renderLine = useCallback(
    ({ item }: ListRenderItemInfo<CartItem>) => (
      <CartLine
        item={item}
        onQuantity={(quantity) => setQuantity(item.id, quantity)}
        onRemove={() => handleRemove(item)}
        onEdit={() => handleEdit(item)}
      />
    ),
    [handleEdit, handleRemove, setQuantity],
  );

  const destination =
    serviceMode === 'PICKUP'
      ? {
          icon: 'storefront-outline' as const,
          title: branch ? `Recoges en ${branch.name}` : 'Falta elegir el local de recojo',
          copy: branch?.addressLine ?? 'Elige desde dónde quieres recoger tu pedido.',
          ok: Boolean(branch),
        }
      : serviceMode === 'DINE_IN'
        ? {
            icon: 'qrcode-scan' as const,
            title: 'Pedido en el local',
            copy: 'Escanea el QR de tu mesa para enviar el pedido a cocina.',
            ok: true,
          }
        : {
            icon: 'map-marker-outline' as const,
            title: 'Entrega a domicilio',
            copy: 'Confirmarás la dirección y la cobertura en el siguiente paso.',
            ok: true,
          };

  const header = (
    <View style={styles.header}>
      <View style={styles.checkoutProgress}>
        <View style={styles.checkoutStepActive}><Text style={styles.checkoutStepNumberActive}>1</Text></View>
        <View style={styles.checkoutLine} />
        <View style={styles.checkoutStep}><Text style={styles.checkoutStepNumber}>2</Text></View>
        <View style={styles.checkoutLine} />
        <View style={styles.checkoutStep}><Text style={styles.checkoutStepNumber}>3</Text></View>
      </View>
      <View style={styles.checkoutLabels}>
        <Text style={styles.checkoutLabelActive}>Revisa</Text>
        <Text style={styles.checkoutLabel}>Completa</Text>
        <Text style={styles.checkoutLabel}>Confirma</Text>
      </View>

      <View style={[styles.destination, !destination.ok && styles.destinationWarning]}>
        <View style={[styles.destinationIcon, !destination.ok && styles.destinationIconWarning]}>
          <MaterialCommunityIcons
            name={destination.icon}
            size={22}
            color={destination.ok ? colors.brand700 : colors.warning}
          />
        </View>

        <View style={styles.destinationCopy}>
          <Text style={styles.destinationTitle}>{destination.title}</Text>
          <Text style={styles.destinationText}>{destination.copy}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar dónde recibes el pedido"
          hitSlop={layout.iconHitSlop}
          onPress={() => router.push('/location')}
          style={({ pressed }) => [styles.destinationChange, pressed && styles.pressed]}
        >
          <Text style={styles.destinationChangeLabel}>Cambiar</Text>
        </Pressable>
      </View>

      {walletBalance !== null ? (
        <View style={styles.walletNotice}>
          <MaterialCommunityIcons name="wallet-outline" size={19} color={colors.brand700} />
          <Text style={styles.walletText}>
            Tienes {money(walletBalance)} de saldo. Podrás aplicarlo en el checkout.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const footer =
    items.length > 0 ? (
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            {units} {units === 1 ? 'producto' : 'productos'} · {items.length}{' '}
            {items.length === 1 ? 'preparación' : 'preparaciones'}
          </Text>
          <Text style={styles.summaryValue}>{money(subtotal)}</Text>
        </View>

        <Text style={styles.summaryHint}>
          Delivery, descuentos, saldo e IGV los calcula el servidor antes de confirmar.
        </Text>

        <PrimaryButton label={ctaLabel} icon={status === 'authenticated' ? 'arrow-right-circle-outline' : 'account-lock-outline'} trailingIcon="arrow-right" onPress={proceed} style={styles.cta} />
      </View>
    ) : undefined;

  return (
    <ScreenScaffold
      tone="light"
      title="Carrito"
      subtitle={
        items.length > 0
          ? `${units} ${units === 1 ? 'producto listo' : 'productos listos'} para continuar`
          : 'Tu próxima elección empieza aquí'
      }
      showBack={false}
      headerRight={
        items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vaciar el carrito"
            hitSlop={layout.iconHitSlop}
            onPress={confirmClear}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} />
          </Pressable>
        ) : undefined
      }
      edges={['top', 'left', 'right']}
      footer={footer}
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderLine}
        ListHeaderComponent={items.length > 0 ? header : null}
        ListEmptyComponent={
          hydrated ? (
            <EmptyState
              icon="shopping-outline"
              title="Tu carrito está esperando"
              message="Explora la carta y agrega una receta, o arma un bowl a tu gusto: lo que agregues se conserva mientras sigues mirando."
              actionLabel="Explorar el menú"
              onAction={() => router.push('/(tabs)/menu')}
            />
          ) : null
        }
        contentContainerStyle={[
          styles.content,
          items.length === 0 && styles.contentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 112,
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#f3f7f4',
  },
  contentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    gap: spacing.sm + spacing.xs,
    paddingBottom: spacing.xs,
  },
  checkoutProgress: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  checkoutStep: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  checkoutStepActive: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent500, ...shadow.sm },
  checkoutStepNumber: { ...type.caption, color: colors.inkMuted },
  checkoutStepNumberActive: { ...type.label, color: colors.surface },
  checkoutLine: { flex: 1, height: 2, backgroundColor: colors.line },
  checkoutLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  checkoutLabel: { ...type.caption, width: 72, color: colors.inkMuted, textAlign: 'center' },
  checkoutLabelActive: { ...type.caption, width: 72, color: colors.warning, fontWeight: '900', textAlign: 'center' },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand100,
    padding: spacing.sm + spacing.xs,
  },
  destinationWarning: {
    backgroundColor: '#fff8e8',
    borderColor: '#f0dcb4',
  },
  destinationIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  destinationIconWarning: {
    backgroundColor: colors.surface,
  },
  destinationCopy: {
    flex: 1,
  },
  destinationTitle: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  destinationText: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  destinationChange: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  destinationChangeLabel: {
    ...type.label,
    color: colors.brand700,
  },
  walletNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.sm + spacing.xs,
  },
  walletText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand800,
  },
  line: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    ...shadow.sm,
  },
  lineTop: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  image: {
    width: 76,
    height: 76,
    borderRadius: radius.sm + 2,
  },
  lineCopy: {
    flex: 1,
  },
  name: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  variant: {
    ...type.label,
    color: colors.brand700,
    marginTop: 2,
  },
  description: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  lineTotal: {
    ...type.body,
    fontWeight: '900',
    color: colors.brand800,
  },
  unitPrice: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm + spacing.xs,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.sm + spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
  },
  editLabel: {
    ...type.label,
    color: colors.brand700,
  },
  clearButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summary: {
    paddingBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryLabel: {
    ...type.bodySm,
    flex: 1,
    color: colors.inkMuted,
  },
  summaryValue: {
    ...type.title,
    color: colors.brand700,
  },
  summaryHint: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  cta: {
    marginTop: spacing.sm + spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
