import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { EmptyState } from '../../src/components/EmptyState';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { money } from '../../src/lib/format';
import { useToast } from '../../src/providers/ToastProvider';
import { diningApi, type DiningOrderInput } from '../../src/services/api/dining.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { DiningProduct, PublicDiningTable } from '../../src/types/domain';

const MAX_UNITS_PER_DISH = 20;


type DiningOrderItem = DiningOrderInput['items'][number];

/**
 * Una comanda reenviada NO es una comanda nueva.
 *
 * El backend añade los platos a la comanda abierta de la mesa, así que con el
 * wifi del local saturado el comensal que reintenta acaba con todo por
 * duplicado en cocina. La clave nace con la selección y solo cambia cuando
 * cambia lo pedido: reintentar manda exactamente la misma clave, y editar el
 * pedido antes de reintentar manda una nueva porque ya es otra comanda.
 */
const buildKey = (token: string): string =>
  `mesa-${token}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface DishRowProps {
  row: DiningProduct;
  quantity: number;
  onAdd: (row: DiningProduct) => void;
  onChange: (row: DiningProduct, next: number) => void;
}

function DishRowView({ row, quantity, onAdd, onChange }: DishRowProps) {
  const chosen = quantity > 0;

  return (
    <View style={[styles.dish, shadow.sm, chosen && styles.dishChosen]}>
      <AppImage
        uri={row.imageUrl}
        style={styles.dishImage}
        accessibilityLabel={row.name}
        fallbackIcon="chef-hat"
        fallbackIconSize={30}
      />

      <View style={styles.dishBody}>
        {row.offering ? (
          <View style={styles.menuBadge}>
            <MaterialCommunityIcons name="silverware-clean" size={13} color="#8a5b00" />

            <Text style={styles.menuBadgeText}>
              Menú del día
              {row.offering.remaining !== null ? ` · quedan ${row.offering.remaining}` : ''}
            </Text>
          </View>
        ) : null}

        <Text numberOfLines={2} style={styles.dishName}>
          {row.name}
        </Text>

        {row.variantName ? (
          <Text numberOfLines={1} style={styles.dishVariant}>
            {row.variantName}
          </Text>
        ) : null}

        <View style={styles.dishFooter}>
          <Text style={styles.dishPrice}>{money(row.price)}</Text>

          {chosen ? (
            <QuantityStepper
              size="sm"
              min={0}
              max={MAX_UNITS_PER_DISH}
              value={quantity}
              label={row.name}
              onChange={(next) => onChange(row, next)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                row.isAvailable ? `Agregar ${row.name} a la comanda` : `${row.name} está agotado`
              }
              accessibilityState={{ disabled: !row.isAvailable }}
              disabled={!row.isAvailable}
              onPress={() => onAdd(row)}
              style={({ pressed }) => [
                styles.add,
                !row.isAvailable && styles.addDisabled,
                pressed && row.isAvailable && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={row.isAvailable ? 'plus' : 'close'}
                size={18}
                color={row.isAvailable ? colors.surface : colors.inkMuted}
              />

              <Text style={[styles.addText, !row.isAvailable && styles.addTextDisabled]}>
                {row.isAvailable ? 'Agregar' : 'Agotado'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const DishRow = memo(DishRowView);

export default function DiningTableScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const toast = useToast();

  const table = useResource<PublicDiningTable>({
    key: token ? `dining:table:${token}` : null,
    fetcher: () => diningApi.table(token),
    // La carta del salón cambia con el turno (menús que se agotan): poco caché.
    cacheMs: 20_000,
  });

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  /** Clave de idempotencia viva, junto a la selección que la originó. */
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  const data = table.data;
  const catalog = useMemo(() => data?.catalog ?? [], [data]);

  const selection = useMemo(
    () => catalog.filter((row) => (quantities[row.variantId] ?? 0) > 0),
    [catalog, quantities],
  );

  const units = selection.reduce((sum, row) => sum + (quantities[row.variantId] ?? 0), 0);
  // Anticipo de lo que se está pidiendo. El importe que se cobra lo calcula el
  // backend al abrir o ampliar la comanda; esto es solo una referencia en pantalla.
  const preview = selection.reduce(
    (sum, row) => sum + row.price * (quantities[row.variantId] ?? 0),
    0,
  );

  const changeQuantity = useCallback((row: DiningProduct, next: number) => {
    setQuantities((current) => {
      const value = Math.max(0, Math.min(MAX_UNITS_PER_DISH, next));
      const updated = { ...current };
      if (value === 0) delete updated[row.variantId];
      else updated[row.variantId] = value;
      return updated;
    });
  }, []);

  const addDish = useCallback(
    (row: DiningProduct) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      changeQuantity(row, 1);
    },
    [changeQuantity],
  );

  const send = async () => {
    // Doble guardia: el estado apaga el botón y esta línea corta el doble toque
    // que llega antes de que React vuelva a pintar.
    if (sending || selection.length === 0) return;

    const items: DiningOrderItem[] = selection.map((row) => ({
      productId: row.productId,
      variantId: row.variantId,
      offeringId: row.offering?.id,
      quantity: quantities[row.variantId] ?? 0,
    }));

    const signature = JSON.stringify({ items, notes: notes.trim(), guestName: guestName.trim() });
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: buildKey(token) };
    }

    const body: DiningOrderInput = {
      guestName: guestName.trim() || undefined,
      notes: notes.trim() || undefined,
      items,
      idempotencyKey: attempt.current.key,
    };

    setSending(true);
    try {
      const result = await diningApi.order(token, body);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setLastSent(result.orderNumber);
      setQuantities({});
      setNotes('');
      attempt.current = null;
      toast.show({ message: `Comanda ${result.orderNumber} enviada a cocina`, tone: 'success' });
      await table.refetch();
    } catch (caught) {
      // Un fallo de red no dice si cocina llegó a recibir la comanda: volvemos a
      // preguntar por la mesa para que la tarjeta de arriba muestre la verdad
      // antes de que el comensal vuelva a pulsar.
      void table.refetch();
      toast.show({
        message:
          caught instanceof Error
            ? `${caught.message} Revisa arriba el estado de tu mesa antes de reintentar.`
            : 'No pudimos enviar tu comanda. Revisa el estado de tu mesa.',
        tone: 'error',
        placement: 'top',
      });
    } finally {
      setSending(false);
    }
  };

  const goHome = useCallback(() => router.replace('/(tabs)'), []);

  const openCommand = data?.command ?? null;

  const footer = data ? (
    <View style={styles.bar}>
      <View style={styles.barText}>
        <Text style={styles.barUnits}>
          {units} {units === 1 ? 'producto' : 'productos'}
        </Text>

        <Text style={styles.barTotal}>{money(preview)}</Text>

        <Text style={styles.barNote}>Referencial · el importe final lo calcula el local</Text>
      </View>

      <PrimaryButton
        label={openCommand ? 'Agregar a mi mesa' : 'Enviar a cocina'}
        loading={sending}
        disabled={selection.length === 0 || sending}
        onPress={() => void send()}
        style={styles.barButton}
      />
    </View>
  ) : undefined;

  return (
    <ScreenScaffold
      tone="dark"
      title={data ? data.table.code : 'Tu mesa'}
      subtitle={data ? `${data.branch.name} · ${data.table.area}` : 'Pedido en el local'}
      showBack
      onBack={goHome}
      contentStyle={styles.sheet}
      footer={footer}
    >
      {table.loading ? (
        <View style={styles.skeleton}>
          <Skeleton height={132} rounded="md" count={4} gap={spacing.sm + spacing.xs} />
        </View>
      ) : !data ? (
        <EmptyState
          icon="qrcode-remove"
          title="No pudimos abrir tu mesa"
          message={table.error?.message ?? 'Este QR ya no está activo. Pídele ayuda al personal.'}
          actionLabel="Reintentar"
          onAction={() => void table.refetch()}
          secondaryLabel="Ir al inicio"
          onSecondary={goHome}
        />
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.fill}
        >
          <FlatList
            data={catalog}
            keyExtractor={(item) => String(item.variantId)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={table.refreshing}
                onRefresh={() => void table.refresh()}
                tintColor={colors.brand600}
              />
            }
            ListHeaderComponent={
              <View>
                {openCommand ? (
                  <View style={styles.command}>
                    <MaterialCommunityIcons
                      name={openCommand.status === 'READY' ? 'silverware-clean' : 'chef-hat'}
                      size={24}
                      color={colors.brand700}
                    />

                    <View style={styles.commandText}>
                      <Text style={styles.commandTitle}>
                        {openCommand.status === 'READY'
                          ? 'Tu comanda está lista para servir'
                          : 'Tienes una comanda en cocina'}
                      </Text>

                      <Text style={styles.commandCopy}>
                        {openCommand.orderNumber} · {money(openCommand.total)} acumulados. Lo que
                        agregues ahora se suma a esta misma cuenta.
                      </Text>
                    </View>
                  </View>
                ) : null}

                {lastSent ? (
                  <View style={styles.sent}>
                    <MaterialCommunityIcons
                      name="check-decagram-outline"
                      size={22}
                      color={colors.success}
                    />

                    <Text style={styles.sentText}>
                      Cocina recibió la comanda {lastSent}. Te avisamos con el personal cuando salga.
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.eyebrow}>CARTA DISPONIBLE AHORA</Text>

                <Text style={styles.title}>¿Qué te provoca?</Text>
              </View>
            }
            renderItem={({ item }) => (
              <DishRow
                row={item}
                quantity={quantities[item.variantId] ?? 0}
                onAdd={addDish}
                onChange={changeQuantity}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="silverware-fork-knife"
                title="La carta no está disponible"
                message="Este local todavía no publicó platos para pedir desde la mesa."
                actionLabel="Reintentar"
                onAction={() => void table.refetch()}
              />
            }
            ListFooterComponent={
              <View style={styles.form}>
                {openCommand ? null : (
                  <FormField
                    label="Tu nombre (opcional)"
                    value={guestName}
                    onChangeText={setGuestName}
                    placeholder="¿Cómo te llamamos?"
                    icon="account-outline"
                    returnKeyType="done"
                    maxLength={120}
                  />
                )}

                <FormField
                  label="Indicación para cocina"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Ej. sin ají, sin cebolla"
                  icon="note-text-outline"
                  returnKeyType="done"
                  maxLength={500}
                />

                <View style={styles.payNote}>
                  <MaterialCommunityIcons
                    name="receipt-text-outline"
                    size={19}
                    color={colors.brand700}
                  />

                  <Text style={styles.payNoteText}>
                    El pago y el comprobante se gestionan con el personal al terminar. El total
                    definitivo lo confirma la comanda de tu mesa.
                  </Text>
                </View>
              </View>
            }
          />
        </KeyboardAvoidingView>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  /** El contenido es una lámina clara sobre la cabecera oscura de la mesa. */
  sheet: {
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  skeleton: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  command: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    padding: spacing.md,
  },
  commandText: {
    flex: 1,
  },
  commandTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.brand900,
  },
  commandCopy: {
    ...type.bodySm,
    color: colors.brand700,
    marginTop: 3,
  },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.sm + spacing.xs,
  },
  sentText: {
    ...type.bodySm,
    flex: 1,
    color: colors.ink,
  },
  eyebrow: {
    ...type.label,
    color: colors.brand600,
    marginTop: spacing.lg,
  },
  title: {
    ...type.title,
    color: colors.ink,
    marginTop: 3,
    marginBottom: spacing.md,
  },
  dish: {
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginBottom: spacing.sm + spacing.xs,
  },
  dishChosen: {
    borderColor: colors.brand600,
  },
  dishImage: {
    width: 112,
    alignSelf: 'stretch',
    minHeight: 132,
  },
  dishBody: {
    flex: 1,
    padding: spacing.sm + spacing.xs,
  },
  menuBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: '#fff0cf',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: spacing.xs + 2,
  },
  menuBadgeText: {
    ...type.caption,
    color: '#8a5b00',
  },
  dishName: {
    ...type.heading,
    color: colors.ink,
  },
  dishVariant: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  dishFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 'auto',
    paddingTop: spacing.sm,
  },
  dishPrice: {
    ...type.heading,
    color: colors.brand700,
  },
  add: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.brand600,
    paddingHorizontal: 14,
  },
  addDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  addText: {
    ...type.label,
    color: colors.surface,
  },
  addTextDisabled: {
    color: colors.inkMuted,
  },
  form: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  payNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.xs,
  },
  payNoteText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  barText: {
    minWidth: 96,
  },
  // La barra vive sobre el fondo oscuro del andamio: sus textos son los de fondo
  // oscuro, no los de tarjeta clara.
  barUnits: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  barTotal: {
    ...type.heading,
    color: colors.onDark,
    marginTop: 2,
  },
  barNote: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginTop: 2,
  },
  barButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
