import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { BottomSheet } from '../../src/components/BottomSheet';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useCart } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { customizationApi } from '../../src/services/api/customization.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { BuilderConfig, BuilderOption, SavedBowl } from '../../src/types/domain';

/** Cómo ordena el cliente su colección. El backend siempre devuelve por fecha. */
type BowlSort = 'RECENT' | 'NAME' | 'PRICE';

const SORTS: Array<{ value: BowlSort; label: string }> = [
  { value: 'RECENT', label: 'Recientes' },
  { value: 'NAME', label: 'Nombre A–Z' },
  { value: 'PRICE', label: 'Menor precio' },
];

/** A partir de aquí la búsqueda deja de ser ruido y empieza a ayudar. */
const SEARCH_THRESHOLD = 4;

const money = (value: number | string): string => `S/ ${Number(value).toFixed(2)}`;

const normalize = (value: string): string => value.toLocaleLowerCase('es-PE');

/** Fecha en lenguaje de persona: lo importante es «hace cuánto», no el día exacto. */
const sinceText = (iso: string): string => {
  const moment = new Date(iso).getTime();
  if (Number.isNaN(moment)) return 'Guardado en tu cuenta';

  const days = Math.floor((Date.now() - moment) / 86_400_000);
  if (days <= 0) return 'Actualizado hoy';
  if (days === 1) return 'Actualizado ayer';
  if (days < 30) return `Actualizado hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Actualizado hace un mes' : `Actualizado hace ${months} meses`;
};

interface ResolvedLine {
  optionId: number;
  quantity: number;
  option: BuilderOption | null;
}

const resolveLines = (bowl: SavedBowl, config: BuilderConfig | undefined): ResolvedLine[] => {
  const index = new Map(
    (config?.groups ?? []).flatMap((group) => group.options.map((option) => [option.id, option] as const)),
  );
  return bowl.selections.map((selection) => ({
    optionId: selection.optionId,
    quantity: selection.quantity,
    option: index.get(selection.optionId) ?? null,
  }));
};

export default function SavedBowlsScreen() {
  const { status } = useSession();
  const { branch } = usePurchase();
  const branchId = branch?.id ?? null;
  const { addItem } = useCart();
  const toast = useToast();

  const authenticated = status === 'authenticated';

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BowlSort>('RECENT');
  const [menuFor, setMenuFor] = useState<SavedBowl | null>(null);
  const [renaming, setRenaming] = useState<SavedBowl | null>(null);
  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState('');
  /** Solo se bloquea la tarjeta sobre la que se está actuando, no la pantalla. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const bowls = useResource<SavedBowl[]>({
    key: authenticated ? 'account:saved-bowls' : null,
    fetcher: () => accountApi.savedBowls(),
  });

  const rows = useMemo(() => bowls.data ?? [], [bowls.data]);

  const productIds = useMemo(
    () => [...new Set(rows.map((bowl) => bowl.productId))].sort((first, second) => first - second),
    [rows],
  );

  /**
   * Las recetas guardan ids de ingrediente, no nombres. La configuración del
   * constructor los traduce y, de paso, dice cuáles ya no están en esta cocina.
   * Si falla, la receta sigue siendo usable: solo perdemos los nombres.
   */
  const configs = useResource<Record<number, BuilderConfig>>({
    key:
      productIds.length > 0
        ? `customizations:configs:${branchId ?? 'sin-local'}:${productIds.join('-')}`
        : null,
    fetcher: async () => {
      const loaded = await Promise.all(
        productIds.map((productId) =>
          customizationApi.config(productId, branchId).then(
            (config) => [productId, config] as const,
            () => null,
          ),
        ),
      );
      return Object.fromEntries(loaded.filter((entry): entry is readonly [number, BuilderConfig] => entry !== null));
    },
  });

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = rows.filter((bowl) => {
      if (needle === '') return true;
      const haystack = [
        bowl.name,
        bowl.product?.name ?? '',
        bowl.variant?.name ?? '',
        ...resolveLines(bowl, configs.data?.[bowl.productId]).map((line) => line.option?.name ?? ''),
      ];
      return haystack.some((value) => normalize(value).includes(needle));
    });

    return [...filtered].sort((first, second) => {
      if (sort === 'NAME') return first.name.localeCompare(second.name, 'es-PE');
      if (sort === 'PRICE') {
        return Number(first.variant?.basePrice ?? 0) - Number(second.variant?.basePrice ?? 0);
      }
      return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
    });
  }, [configs.data, query, rows, sort]);

  /* ---------------------------- acciones ----------------------------- */

  const openBuilder = useCallback((bowl: SavedBowl) => {
    router.push({
      pathname: '/builder/[productId]',
      params: {
        productId: String(bowl.productId),
        variantId: String(bowl.variantId),
        selections: JSON.stringify(bowl.selections),
        savedBowlId: String(bowl.id),
        savedName: bowl.name,
      },
    });
  }, []);

  const addToCart = useCallback(
    async (bowl: SavedBowl) => {
      setBusyId(bowl.id);
      try {
        // RN-007: el precio se recalcula ahora, con la carta y el stock de hoy.
        const quote = await customizationApi.quote({
          productId: bowl.productId,
          variantId: bowl.variantId,
          quantity: 1,
          branchId,
          selections: bowl.selections,
        });

        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addItem({
          productId: bowl.productId,
          variantId: bowl.variantId,
          productName: bowl.product?.name ?? bowl.name,
          variantName: bowl.variant?.name ?? quote.variantName ?? 'Bowl',
          imageUrl: bowl.product?.imageUrl ?? null,
          quantity: 1,
          unitPrice: quote.unitPrice,
          lineTotal: quote.lineTotal,
          description: quote.description,
          selections: quote.selections.map((line) => ({
            optionId: line.optionId,
            quantity: line.quantity,
            groupName: line.groupName,
            optionName: line.optionName,
          })),
        });

        toast.show({
          tone: 'success',
          message: `${bowl.name} está en el carrito.`,
          action: { label: 'Ver carrito', onPress: () => router.push('/(tabs)/cart' as Href) },
        });
      } catch (caught) {
        toast.show({
          tone: 'error',
          message: caught instanceof Error ? caught.message : 'No pudimos preparar esta receta.',
          action: { label: 'Ajustar', onPress: () => openBuilder(bowl) },
        });
      } finally {
        setBusyId(null);
      }
    },
    [addItem, branchId, openBuilder, toast],
  );

  const duplicate = useCallback(
    async (bowl: SavedBowl) => {
      setBusyId(bowl.id);
      try {
        await accountApi.createSavedBowl({
          name: `${bowl.name} (copia)`.slice(0, 80),
          productId: bowl.productId,
          variantId: bowl.variantId,
          selections: bowl.selections,
        });
        invalidateResource('account:saved-bowls');
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toast.show({ tone: 'success', message: 'Duplicamos la receta.' });
      } catch (caught) {
        toast.show({
          tone: 'error',
          message: caught instanceof Error ? caught.message : 'No pudimos duplicar la receta.',
        });
      } finally {
        setBusyId(null);
      }
    },
    [toast],
  );

  const rename = useCallback(async () => {
    if (!renaming) return;
    const name = draftName.trim();
    if (name.length < 2) {
      setNameError('Ponle un nombre de al menos 2 letras.');
      return;
    }

    setBusyId(renaming.id);
    try {
      await accountApi.updateSavedBowl(renaming.id, { name });
      invalidateResource('account:saved-bowls');
      setRenaming(null);
      toast.show({ tone: 'success', message: 'Nombre actualizado.' });
    } catch (caught) {
      setNameError(caught instanceof Error ? caught.message : 'No pudimos guardar el nombre.');
    } finally {
      setBusyId(null);
    }
  }, [draftName, renaming, toast]);

  const remove = useCallback(
    (bowl: SavedBowl) => {
      // Borrar es irreversible: aquí sí toca una confirmación bloqueante.
      Alert.alert(
        'Eliminar bowl guardado',
        `«${bowl.name}» dejará de aparecer en tu cuenta. Tus pedidos anteriores no cambian.`,
        [
          { text: 'Conservar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setBusyId(bowl.id);
                try {
                  await accountApi.deleteSavedBowl(bowl.id);
                  invalidateResource('account:saved-bowls');
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  toast.show({ tone: 'success', message: 'Receta eliminada.' });
                } catch (caught) {
                  toast.show({
                    tone: 'error',
                    message: caught instanceof Error ? caught.message : 'No pudimos eliminarla.',
                  });
                } finally {
                  setBusyId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [toast],
  );

  /* ------------------------------ vista ------------------------------ */

  if (!authenticated) {
    return (
      <ScreenScaffold title="Bowls guardados" padded>
        <EmptyState
          icon="shield-lock-outline"
          title="Tus recetas viven en tu cuenta"
          message="Inicia sesión para ver los bowls que guardaste y pedirlos en un toque."
          actionLabel="Iniciar sesión"
          onAction={() =>
            router.push({ pathname: '/(auth)/login', params: { returnTo: '/saved-bowls' } })
          }
          secondaryLabel="Armar un bowl"
          onSecondary={() => router.push('/(tabs)/menu')}
        />
      </ScreenScaffold>
    );
  }

  if (bowls.loading) {
    return (
      <ScreenScaffold title="Bowls guardados" padded>
        <View style={styles.skeleton}>
          <Skeleton height={44} rounded="md" />
          <Skeleton height={188} rounded="lg" count={3} gap={spacing.md} style={styles.skeletonGap} />
        </View>
      </ScreenScaffold>
    );
  }

  if (bowls.error && rows.length === 0) {
    return (
      <ScreenScaffold title="Bowls guardados" padded>
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos cargar tus recetas"
          message={bowls.error.message}
          actionLabel="Reintentar"
          onAction={() => void bowls.refetch()}
        />
      </ScreenScaffold>
    );
  }

  const totalIngredients = rows.reduce(
    (total, bowl) => total + bowl.selections.reduce((sum, line) => sum + line.quantity, 0),
    0,
  );

  const listHeader =
    rows.length === 0 ? null : (
      <View style={styles.header}>
        <View style={styles.stats}>
          <Stat value={rows.length} label={rows.length === 1 ? 'receta' : 'recetas'} highlighted />
          <Stat value={totalIngredients} label="ingredientes" />
          <Stat value={productIds.length} label={productIds.length === 1 ? 'base' : 'bases'} />
        </View>

        {rows.length >= SEARCH_THRESHOLD && (
          <View style={styles.search}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Busca por receta o ingrediente"
              placeholderTextColor={colors.inkMuted}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Limpiar búsqueda"
                hitSlop={layout.iconHitSlop}
                onPress={() => setQuery('')}
              >
                <MaterialCommunityIcons name="close-circle" size={20} color={colors.inkMuted} />
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.sorts}>
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              size="sm"
              label={option.label}
              selected={sort === option.value}
              onPress={() => setSort(option.value)}
            />
          ))}
        </View>

        <View style={styles.syncNote}>
          <MaterialCommunityIcons name="cloud-check-outline" size={19} color={colors.brand700} />
          <Text style={styles.syncText}>
            Antes de agregarlas volvemos a consultar precio y disponibilidad en tu local.
          </Text>
        </View>
      </View>
    );

  return (
    <ScreenScaffold
      title="Bowls guardados"
      subtitle="Tus combinaciones, listas para repetir"
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Armar un bowl nuevo"
          hitSlop={layout.iconHitSlop}
          onPress={() => router.push('/(tabs)/menu')}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="plus" size={22} color={colors.brand700} />
        </Pressable>
      }
    >
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={bowls.refreshing}
            onRefresh={() => void bowls.refresh()}
            tintColor={colors.brand600}
          />
        }
        ListEmptyComponent={
          query.trim() !== '' ? (
            <EmptyState
              icon="magnify"
              title="No encontramos esa receta"
              message="Prueba con el nombre del bowl, su base o alguno de sus ingredientes."
              actionLabel="Limpiar búsqueda"
              onAction={() => setQuery('')}
            />
          ) : (
            <EmptyState
              icon="bowl-mix-outline"
              title="Aún no guardaste bowls"
              message="Arma una combinación en el constructor y guárdala: la tendrás lista para pedir en un toque."
              actionLabel="Armar mi primer bowl"
              onAction={() => router.push('/(tabs)/menu')}
            />
          )
        }
        renderItem={({ item }) => (
          <BowlCard
            bowl={item}
            config={configs.data?.[item.productId]}
            busy={busyId === item.id}
            onAdd={() => void addToCart(item)}
            onCustomize={() => openBuilder(item)}
            onMenu={() => {
              void Haptics.selectionAsync();
              setMenuFor(item);
            }}
          />
        )}
      />

      <BottomSheet
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        subtitle="¿Qué quieres hacer con esta receta?"
      >
        <SheetAction
          icon="pencil-outline"
          label="Renombrar"
          onPress={() => {
            if (!menuFor) return;
            setDraftName(menuFor.name);
            setNameError('');
            setRenaming(menuFor);
            setMenuFor(null);
          }}
        />
        <SheetAction
          icon="content-duplicate"
          label="Duplicar"
          onPress={() => {
            const target = menuFor;
            setMenuFor(null);
            if (target) void duplicate(target);
          }}
        />
        <SheetAction
          icon="tune-variant"
          label="Personalizar en el constructor"
          onPress={() => {
            const target = menuFor;
            setMenuFor(null);
            if (target) openBuilder(target);
          }}
        />
        <SheetAction
          icon="trash-can-outline"
          label="Eliminar"
          tone="danger"
          onPress={() => {
            const target = menuFor;
            setMenuFor(null);
            if (target) remove(target);
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={renaming !== null}
        onClose={() => busyId === null && setRenaming(null)}
        title="Renombrar receta"
        subtitle="Usa un nombre que reconozcas de un vistazo."
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.fieldLabel}>Nombre de la receta</Text>
          <TextInput
            value={draftName}
            onChangeText={(value) => {
              setDraftName(value);
              setNameError('');
            }}
            maxLength={80}
            autoFocus
            placeholder="Mi bowl de los lunes"
            placeholderTextColor={colors.inkMuted}
            returnKeyType="done"
            onSubmitEditing={() => void rename()}
            style={styles.field}
          />
          <Text style={nameError ? styles.fieldError : styles.fieldHint}>
            {nameError || `${draftName.trim().length}/80 caracteres`}
          </Text>

          <PrimaryButton
            label="Guardar nombre"
            loading={renaming !== null && busyId === renaming.id}
            onPress={() => void rename()}
          />
        </KeyboardAvoidingView>
      </BottomSheet>
    </ScreenScaffold>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

function Stat({ value, label, highlighted = false }: { value: number; label: string; highlighted?: boolean }) {
  return (
    <View style={[styles.stat, highlighted && styles.statHighlighted]}>
      <Text style={[styles.statValue, highlighted && styles.statValueHighlighted]}>{value}</Text>
      <Text style={[styles.statLabel, highlighted && styles.statLabelHighlighted]}>{label}</Text>
    </View>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
  tone = 'brand',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'brand' | 'danger';
}) {
  const color = tone === 'danger' ? colors.danger : colors.brand700;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
    >
      <View style={[styles.sheetIcon, tone === 'danger' && styles.sheetIconDanger]}>
        <MaterialCommunityIcons name={icon} size={21} color={color} />
      </View>
      <Text style={[styles.sheetLabel, tone === 'danger' && styles.sheetLabelDanger]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkMuted} />
    </Pressable>
  );
}

interface BowlCardProps {
  bowl: SavedBowl;
  config: BuilderConfig | undefined;
  busy: boolean;
  onAdd: () => void;
  onCustomize: () => void;
  onMenu: () => void;
}

function BowlCard({ bowl, config, busy, onAdd, onCustomize, onMenu }: BowlCardProps) {
  const lines = resolveLines(bowl, config);
  const missing = lines.filter((line) => line.option !== null && !line.option.isAvailable);
  const shown = lines.slice(0, 4);
  const rest = lines.length - shown.length;

  return (
    <View style={[styles.card, shadow.sm, missing.length > 0 && styles.cardWarning]}>
      <View style={styles.cardTop}>
        <AppImage
          uri={bowl.product?.imageUrl}
          style={styles.cardImage}
          accessibilityLabel={bowl.product?.name ?? bowl.name}
        />

        <View style={styles.cardCopy}>
          <Text style={styles.cardEyebrow}>{bowl.product?.name ?? 'Tu combinación'}</Text>
          <Text numberOfLines={2} style={styles.cardTitle}>
            {bowl.name}
          </Text>
          <Text style={styles.cardMeta}>
            {bowl.variant?.name ?? 'Bowl personalizado'}
            {bowl.variant ? ` · desde ${money(bowl.variant.basePrice)}` : ''}
          </Text>
          <Text style={styles.cardDate}>{sinceText(bowl.updatedAt)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Más acciones para ${bowl.name}`}
          hitSlop={layout.iconHitSlop}
          onPress={onMenu}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.ingredients}>
        {shown.map((line) => {
          const unavailable = line.option !== null && !line.option.isAvailable;
          return (
            <View
              key={line.optionId}
              style={[styles.ingredient, unavailable && styles.ingredientMissing]}
            >
              <Text style={[styles.ingredientText, unavailable && styles.ingredientTextMissing]}>
                {line.quantity > 1 ? `${line.quantity}× ` : ''}
                {line.option?.name ?? `Ingrediente #${line.optionId}`}
              </Text>
            </View>
          );
        })}
        {rest > 0 && (
          <View style={styles.ingredientMore}>
            <Text style={styles.ingredientMoreText}>+{rest} más</Text>
          </View>
        )}
      </View>

      {missing.length > 0 && (
        <View style={styles.warning}>
          <MaterialCommunityIcons name="alert-outline" size={19} color={colors.warning} />
          <Text style={styles.warningText}>
            {missing.length === 1
              ? 'Un ingrediente no está disponible en tu local. Personaliza la receta para cambiarlo.'
              : `${missing.length} ingredientes no están disponibles en tu local. Personaliza la receta para cambiarlos.`}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton
          label="Agregar al carrito"
          loading={busy}
          disabled={missing.length > 0}
          onPress={onAdd}
          style={styles.actionPrimary}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Personalizar ${bowl.name}`}
          onPress={onCustomize}
          style={({ pressed }) => [styles.actionSecondary, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="tune-variant" size={20} color={colors.brand700} />
          <Text style={styles.actionSecondaryText}>Personalizar</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  skeleton: {
    paddingTop: spacing.sm,
  },
  skeletonGap: {
    marginTop: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  header: {
    paddingBottom: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: spacing.sm + spacing.xs,
  },
  statHighlighted: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand100,
  },
  statValue: {
    ...type.heading,
    color: colors.ink,
  },
  statValueHighlighted: {
    color: colors.brand700,
  },
  statLabel: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  statLabelHighlighted: {
    color: colors.brand700,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchInput: {
    ...type.body,
    flex: 1,
    color: colors.ink,
    paddingVertical: spacing.sm + spacing.xs,
  },
  sorts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  syncNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  syncText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cardWarning: {
    borderColor: '#f0d9a8',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
  },
  cardImage: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
  },
  cardCopy: {
    flex: 1,
  },
  cardEyebrow: {
    ...type.label,
    color: colors.brand700,
    textTransform: 'uppercase',
  },
  cardTitle: {
    ...type.heading,
    color: colors.ink,
    marginTop: 3,
  },
  cardMeta: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  cardDate: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  more: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  ingredients: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
  },
  ingredient: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  ingredientMissing: {
    backgroundColor: '#fff5e4',
    borderColor: '#f0d9a8',
  },
  ingredientText: {
    ...type.caption,
    color: colors.inkMuted,
  },
  ingredientTextMissing: {
    color: colors.warning,
  },
  ingredientMore: {
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  ingredientMoreText: {
    ...type.caption,
    color: colors.brand700,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#fff7e5',
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  warningText: {
    ...type.bodySm,
    flex: 1,
    color: '#7a5200',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionPrimary: {
    flex: 1,
  },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#b8d5c6',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  actionSecondaryText: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },
  headerButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  sheetIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  sheetIconDanger: {
    backgroundColor: '#ffeaea',
  },
  sheetLabel: {
    ...type.body,
    flex: 1,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetLabelDanger: {
    color: colors.danger,
  },
  fieldLabel: {
    ...type.label,
    color: colors.ink,
  },
  field: {
    ...type.body,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  fieldHint: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  fieldError: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
});
