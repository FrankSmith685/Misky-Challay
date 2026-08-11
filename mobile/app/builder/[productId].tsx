import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { BottomSheet } from '../../src/components/BottomSheet';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useCart } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { catalogApi } from '../../src/services/api/catalog.service';
import {
  customizationApi,
  type BuilderEventType,
  type CustomizationInput,
} from '../../src/services/api/customization.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type {
  Allergen,
  BuilderConfig,
  BuilderGroup,
  BuilderOption,
  CustomizationQuote,
  FoodPreferences,
  SavedBowlSelection,
} from '../../src/types/domain';

/* ------------------------------------------------------------------ */
/* Telemetría del embudo (POST /customizations/events)                 */
/* ------------------------------------------------------------------ */

interface BuilderEventDetail {
  groupId?: number | null;
  optionId?: number | null;
  presetId?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * El backend valida `sessionId` como UUID y React Native no trae
 * `crypto.randomUUID`. Es un identificador de sesión del constructor, no del
 * cliente: nace al abrir la pantalla y muere al cerrarla.
 */
const newSessionId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

/* ------------------------------------------------------------------ */
/* Utilidades de selección                                             */
/* ------------------------------------------------------------------ */

/** Cantidad elegida por opción. Cero significa «no está en el bowl». */
type SelectionMap = Record<number, number>;

interface Settled {
  variantId: number | null;
  map: SelectionMap;
}

type BuilderRow =
  | { kind: 'group'; key: string; group: BuilderGroup; step: number }
  | { kind: 'option'; key: string; group: BuilderGroup; option: BuilderOption };

const unitsInGroup = (group: BuilderGroup, map: SelectionMap): number =>
  group.options.reduce((total, option) => total + (map[option.id] ?? 0), 0);

/**
 * Se ordena por id a propósito: la clave de caché de la cotización se construye
 * con esta lista y dos bowls idénticos deben producir la misma clave aunque el
 * cliente los haya montado en distinto orden.
 */
const toSelectionList = (map: SelectionMap): SavedBowlSelection[] =>
  Object.entries(map)
    .filter(([, quantity]) => quantity > 0)
    .map(([optionId, quantity]) => ({ optionId: Number(optionId), quantity }))
    .sort((first, second) => first.optionId - second.optionId);

/** Pasos que aún no cumplen su mínimo o que se pasaron del máximo. */
const pendingSteps = (groups: BuilderGroup[], map: SelectionMap): string[] =>
  groups.flatMap((group) => {
    const units = unitsInGroup(group, map);
    if (units < group.minSelection) {
      const missing = group.minSelection - units;
      return [`${group.name}: falta${missing === 1 ? '' : 'n'} ${missing} ${missing === 1 ? 'opción' : 'opciones'}`];
    }
    if (units > group.maxSelection) {
      return [`${group.name}: quita ${units - group.maxSelection} para no pasar de ${group.maxSelection}`];
    }
    return [];
  });

/** Lee las selecciones que llegan por la ruta (un bowl guardado, por ejemplo). */
const parseIncomingSelections = (raw: string | undefined): SavedBowlSelection[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const row = entry as { optionId?: unknown; quantity?: unknown };
      return typeof row.optionId === 'number' && typeof row.quantity === 'number'
        ? [{ optionId: row.optionId, quantity: row.quantity }]
        : [];
    });
  } catch {
    return [];
  }
};

/**
 * Traduce una receta a la configuración de HOY: descarta lo que la cocina ya no
 * tiene y recorta lo que supera el tope por plato. Devuelve cuántas líneas se
 * cayeron para poder decírselo al cliente en lugar de cambiarle el bowl a
 * escondidas.
 */
const applyRecipe = (
  config: BuilderConfig,
  incoming: SavedBowlSelection[],
): { map: SelectionMap; dropped: number } => {
  const index = new Map(config.groups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
  const map: SelectionMap = {};
  let dropped = 0;

  for (const entry of incoming) {
    const option = index.get(entry.optionId);
    if (!option || !option.isAvailable) {
      dropped += 1;
      continue;
    }
    map[option.id] = Math.max(1, Math.min(entry.quantity, option.maxPerItem));
  }

  return { map, dropped };
};

const money = (value: number): string => `S/ ${value.toFixed(2)}`;

/* ------------------------------------------------------------------ */
/* Pantalla                                                            */
/* ------------------------------------------------------------------ */

export default function BuilderScreen() {
  const params = useLocalSearchParams<{
    productId: string;
    /** Los tres siguientes llegan desde «Personalizar» en Bowls guardados. */
    variantId?: string;
    selections?: string;
    savedBowlId?: string;
    savedName?: string;
    /** Llega desde «Editar» en el carrito: la línea que se está rehaciendo. */
    editItemId?: string;
  }>();

  const productId = Number(params.productId);
  const savedBowlId = params.savedBowlId ? Number(params.savedBowlId) : null;

  const { branch } = usePurchase();
  const branchId = branch?.id ?? null;
  const { addItem, editing, cancelEdit } = useCart();
  const { status } = useSession();
  const toast = useToast();

  const authenticated = status === 'authenticated';

  /*
   * Edición de una línea del carrito. La receta se lee del carrito, no de la
   * ruta: es la fuente viva y evita serializar el bowl entero en la URL. Se
   * congela en la primera lectura porque `addItem` limpia `editing` y, si no,
   * el constructor se quedaría a medias al confirmar.
   */
  const editingSource = useRef(
    editing && editing.productId === productId ? editing : null,
  ).current;
  const isEditing = editingSource !== null;

  const [variantId, setVariantId] = useState<number | null>(null);
  const [selections, setSelections] = useState<SelectionMap>({});
  /** Lo que ya se puede cotizar: el estado en vivo, pero calmado 260 ms. */
  const [settled, setSettled] = useState<Settled>({ variantId: null, map: {} });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const listRef = useRef<FlatList<BuilderRow>>(null);
  const sessionIdRef = useRef(newSessionId());
  const startedRef = useRef(false);
  const addedRef = useRef(false);
  const viewedRef = useRef(false);
  const completedKeyRef = useRef('');
  const initialisedRef = useRef('');
  const nameSeededRef = useRef(false);

  // Espejos del estado para el efecto de arranque: al cambiar de local necesita
  // leer lo que el cliente lleva elegido sin volver a ejecutarse en cada toque.
  const selectionsRef = useRef<SelectionMap>(selections);
  selectionsRef.current = selections;
  const variantRef = useRef<number | null>(variantId);
  variantRef.current = variantId;

  /* --------------------------- telemetría --------------------------- */

  const track = useCallback(
    (eventType: BuilderEventType, detail: BuilderEventDetail = {}) => {
      if (!Number.isFinite(productId) || productId <= 0) return;
      // Es medición: nunca debe interrumpir al cliente si falla.
      void customizationApi
        .event({
          sessionId: sessionIdRef.current,
          productId,
          eventType,
          groupId: detail.groupId ?? null,
          optionId: detail.optionId ?? null,
          presetId: detail.presetId ?? null,
          metadata: detail.metadata ?? null,
        })
        .catch(() => null);
    },
    [productId],
  );

  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('START');
  }, [track]);

  /* ----------------------------- datos ------------------------------ */

  const config = useResource<BuilderConfig>({
    key:
      Number.isFinite(productId) && productId > 0
        ? `customizations:config:${productId}:${branchId ?? 'sin-local'}`
        : null,
    fetcher: () => customizationApi.config(productId, branchId),
  });

  /** Nombres legibles de los alérgenos; las opciones solo traen el código. */
  const allergenCatalog = useResource<Allergen[]>({
    key: 'catalog:allergens',
    fetcher: () => catalogApi.allergens(),
    cacheMs: 30 * 60_000,
  });

  /** Alérgenos que el cliente declaró evitar: se avisan, no se ocultan (RN-009). */
  const preferences = useResource<FoodPreferences>({
    key: authenticated ? 'account:food-preferences' : null,
    fetcher: () => accountApi.foodPreferences(),
  });

  const allergenName = useMemo(() => {
    const names = new Map((allergenCatalog.data ?? []).map((row) => [row.code, row.name] as const));
    return (code: string): string => names.get(code) ?? code;
  }, [allergenCatalog.data]);

  const avoidedAllergens = useMemo(
    () => new Set(preferences.data?.allergens ?? []),
    [preferences.data],
  );

  const data = config.data;

  /* ------------------- arranque y recetas entrantes ------------------ */

  useEffect(() => {
    if (!data) return;

    // Cambiar de local cambia el catálogo disponible: hay que volver a proyectar
    // el bowl sobre lo que esa cocina tiene hoy, sin borrarle el trabajo hecho.
    const stamp = `${data.product.id}:${branchId ?? 'sin-local'}`;
    if (initialisedRef.current === stamp) return;
    const firstRun = initialisedRef.current === '';
    initialisedRef.current = stamp;

    /*
     * De dónde sale la receta de partida: la línea que se está editando manda
     * sobre los parámetros de la ruta, porque es lo que el cliente tiene delante
     * en el carrito. Fuera de la primera vuelta se conserva lo que lleve hecho.
     */
    const incoming = !firstRun
      ? toSelectionList(selectionsRef.current)
      : editingSource
        ? editingSource.selections.map((line) => ({
            optionId: line.optionId,
            quantity: line.quantity,
          }))
        : parseIncomingSelections(params.selections);

    const requested = firstRun
      ? editingSource
        ? editingSource.variantId
        : params.variantId
          ? Number(params.variantId)
          : null
      : variantRef.current;
    const fallback = data.variants.find((variant) => variant.isDefault) ?? data.variants[0] ?? null;
    setVariantId(
      requested !== null && data.variants.some((variant) => variant.id === requested)
        ? requested
        : fallback?.id ?? null,
    );

    const { map, dropped } = applyRecipe(data, incoming);
    setSelections(map);
    if (incoming.length > 0) startedRef.current = true;

    if (dropped > 0) {
      toast.show({
        tone: 'warning',
        message:
          dropped === 1
            ? 'Quitamos un ingrediente que hoy no está disponible aquí. Elige otro para completar tu bowl.'
            : `Quitamos ${dropped} ingredientes que hoy no están disponibles aquí. Elige otros para completar tu bowl.`,
      });
    }

    if (!viewedRef.current) {
      viewedRef.current = true;
      track('VIEW', { metadata: { branchId, desdeReceta: incoming.length > 0 } });
    }
  }, [branchId, data, editingSource, params.selections, params.variantId, toast, track]);

  /**
   * Nombre propuesto para guardar la receta. Se siembra una sola vez: si el
   * cliente borra el campo, no se lo volvemos a rellenar por debajo.
   */
  useEffect(() => {
    if (nameSeededRef.current || !data) return;
    nameSeededRef.current = true;
    setRecipeName(params.savedName ?? `${data.product.name} a mi manera`);
  }, [data, params.savedName]);

  /* ------------------------- cotización real ------------------------- */

  // Sin este respiro, cada toque en un ingrediente dispararía su propia
  // petición y el precio parpadearía mientras el cliente todavía elige.
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ variantId, map: selections }), 260);
    return () => clearTimeout(timer);
  }, [selections, variantId]);

  const settledList = useMemo(() => toSelectionList(settled.map), [settled.map]);

  const quoteRequest = useMemo<CustomizationInput | null>(() => {
    if (!data || settled.variantId === null) return null;
    if (pendingSteps(data.groups, settled.map).length > 0) return null;
    return {
      productId: data.product.id,
      variantId: settled.variantId,
      quantity: 1,
      branchId,
      selections: settledList,
    };
  }, [branchId, data, settled.map, settled.variantId, settledList]);

  const quote = useResource<CustomizationQuote>({
    key: quoteRequest
      ? `customizations:quote:${quoteRequest.productId}:${quoteRequest.variantId}:${branchId ?? 'sin-local'}:${JSON.stringify(settledList)}`
      : null,
    // RN-007: el precio y la nutrición válidos son SIEMPRE los del backend.
    // Es una lectura por POST: ni se reintenta a ciegas ni se repite al enfocar.
    method: 'POST',
    refetchOnFocus: false,
    fetcher: () =>
      quoteRequest
        ? customizationApi.quote(quoteRequest)
        : Promise.reject(new Error('Completa los pasos obligatorios de tu bowl.')),
  });

  const quoted = quote.data;
  const quoteError = quote.error;

  useEffect(() => {
    if (!quoted) return;
    const key = `${quoted.variantId}:${JSON.stringify(quoted.selections.map((line) => line.optionId))}`;
    if (completedKeyRef.current === key) return;
    completedKeyRef.current = key;
    track('COMPLETE', { metadata: { unitPrice: quoted.unitPrice, calorias: Math.round(quoted.nutrition.calories) } });
  }, [quoted, track]);

  useEffect(() => {
    if (!quoteError) return;
    track('QUOTE_ERROR', { metadata: { motivo: quoteError.message } });
  }, [quoteError, track]);

  // Si la cotización deja de ser válida (cambió la sucursal, caducó el dato) el
  // resumen ya no describe nada: se cierra en vez de quedarse vacío.
  useEffect(() => {
    if (!quoted && summaryOpen) setSummaryOpen(false);
  }, [quoted, summaryOpen]);

  /**
   * El cliente se fue sin llevarse el bowl: eso también es información. Y si se
   * fue en mitad de una edición, la línea del carrito se queda como estaba: hay
   * que soltar la marca o el próximo bowl que agregue la reemplazaría.
   */
  useEffect(
    () => () => {
      if (startedRef.current && !addedRef.current) track('ABANDON');
      if (!addedRef.current) cancelEdit();
    },
    [cancelEdit, track],
  );

  /* -------------------------- interacción ---------------------------- */

  const optionIndex = useMemo(
    () => new Map((data?.groups ?? []).flatMap((group) => group.options.map((option) => [option.id, option] as const))),
    [data],
  );

  const selectedIds = useMemo(
    () => new Set(Object.entries(selections).filter(([, quantity]) => quantity > 0).map(([id]) => Number(id))),
    [selections],
  );

  /** Opción ya elegida que impide añadir esta otra, si la hay. */
  const conflictFor = useCallback(
    (option: BuilderOption): BuilderOption | null => {
      const clash = option.incompatibleWith.find((other) => selectedIds.has(other));
      return clash === undefined ? null : optionIndex.get(clash) ?? null;
    },
    [optionIndex, selectedIds],
  );

  const setQuantity = useCallback(
    (group: BuilderGroup, option: BuilderOption, next: number) => {
      markStarted();
      setSelections((current) => {
        if (next <= 0) {
          const rest = { ...current };
          delete rest[option.id];
          return rest;
        }
        if (group.selectionType === 'SINGLE') {
          // Un paso SINGLE se reemplaza entero: la nueva opción desplaza a la anterior.
          const cleaned = { ...current };
          group.options.forEach((row) => delete cleaned[row.id]);
          return { ...cleaned, [option.id]: 1 };
        }
        return { ...current, [option.id]: Math.min(next, option.maxPerItem) };
      });
    },
    [markStarted],
  );

  const addOption = useCallback(
    (group: BuilderGroup, option: BuilderOption) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuantity(group, option, 1);
      track('OPTION_SELECT', { groupId: group.id, optionId: option.id });
    },
    [setQuantity, track],
  );

  const removeOption = useCallback(
    (group: BuilderGroup, option: BuilderOption) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setQuantity(group, option, 0);
    },
    [setQuantity],
  );

  /** Quita lo que estorba y pone la opción nueva en un solo gesto. */
  const resolveConflict = useCallback(
    (group: BuilderGroup, option: BuilderOption, blocker: BuilderOption) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      markStarted();
      setSelections((current) => {
        const cleaned = { ...current };
        option.incompatibleWith.forEach((other) => delete cleaned[other]);
        if (group.selectionType === 'SINGLE') group.options.forEach((row) => delete cleaned[row.id]);
        return { ...cleaned, [option.id]: 1 };
      });
      track('CONFLICT_RESOLVE', { groupId: group.id, optionId: option.id });
      toast.show({ tone: 'info', message: `Cambiamos ${blocker.name} por ${option.name}.` });
    },
    [markStarted, toast, track],
  );

  const applyPreset = useCallback(
    (preset: BuilderConfig['presets'][number]) => {
      if (!data) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      markStarted();
      const { map, dropped } = applyRecipe(data, preset.selections);
      setSelections(map);
      track('PRESET_APPLY', { presetId: preset.id });
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      toast.show({
        tone: dropped > 0 ? 'warning' : 'success',
        message:
          dropped > 0
            ? `Aplicamos ${preset.name}, pero faltan ${dropped} ingredientes en esta cocina.`
            : `Listo: armamos ${preset.name}. Cámbialo a tu gusto.`,
      });
    },
    [data, markStarted, toast, track],
  );

  const chooseVariant = useCallback((id: number) => {
    void Haptics.selectionAsync();
    setVariantId(id);
  }, []);

  /* ---------------------------- acciones ----------------------------- */

  const confirmAdd = useCallback(() => {
    if (!data || !quoted) return;
    const variant = data.variants.find((row) => row.id === quoted.variantId);

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addItem({
      productId: data.product.id,
      variantId: quoted.variantId,
      productName: data.product.name,
      variantName: variant?.name ?? quoted.variantName ?? 'Bowl',
      imageUrl: data.product.imageUrl,
      quantity: 1,
      unitPrice: quoted.unitPrice,
      lineTotal: quoted.lineTotal,
      description: quoted.description,
      selections: quoted.selections.map((line) => ({
        optionId: line.optionId,
        quantity: line.quantity,
        groupName: line.groupName,
        optionName: line.optionName,
      })),
    });

    addedRef.current = true;
    track('ADD_TO_CART', { metadata: { unitPrice: quoted.unitPrice, edicion: isEditing } });
    setSummaryOpen(false);

    // Editando se vuelve al carrito, que es de donde vino y donde está la línea
    // que acaba de cambiar. Armando de cero se queda aquí: puede montar otro bowl
    // sin salir del constructor.
    if (isEditing) {
      toast.show({ tone: 'success', message: 'Actualizamos tu bowl en el carrito.' });
      router.back();
      return;
    }

    toast.show({
      tone: 'success',
      message: 'Tu bowl está en el carrito.',
      action: { label: 'Ver carrito', onPress: () => router.push('/(tabs)/cart' as Href) },
    });
  }, [addItem, data, isEditing, quoted, toast, track]);

  const openSave = useCallback(() => {
    if (!authenticated) {
      toast.show({
        tone: 'info',
        message: 'Inicia sesión para guardar tus recetas y pedirlas en un toque.',
        action: {
          label: 'Entrar',
          onPress: () =>
            router.push({
              pathname: '/(auth)/login',
              params: { returnTo: `/builder/${productId}` },
            }),
        },
      });
      return;
    }
    setSaveError('');
    setSaveOpen(true);
  }, [authenticated, productId, toast]);

  const persistRecipe = useCallback(
    async (mode: 'create' | 'update') => {
      if (!data || settled.variantId === null) return;
      const name = recipeName.trim();
      if (name.length < 2) {
        setSaveError('Ponle un nombre de al menos 2 letras.');
        return;
      }

      setSaving(true);
      setSaveError('');
      try {
        const payload = {
          name,
          productId: data.product.id,
          variantId: settled.variantId,
          selections: settledList,
        };

        if (mode === 'update' && savedBowlId !== null) {
          await accountApi.updateSavedBowl(savedBowlId, payload);
        } else {
          await accountApi.createSavedBowl(payload);
        }

        invalidateResource('account:saved-bowls');
        track('SAVE_BOWL', { metadata: { modo: mode } });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSaveOpen(false);
        toast.show({
          tone: 'success',
          message: mode === 'update' ? 'Actualizamos tu receta.' : 'Guardamos tu receta.',
          action: { label: 'Ver mis bowls', onPress: () => router.push('/saved-bowls' as Href) },
        });
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'No pudimos guardar la receta.');
      } finally {
        setSaving(false);
      }
    },
    [data, recipeName, savedBowlId, settled.variantId, settledList, toast, track],
  );

  /* ------------------------------ vista ------------------------------ */

  const rows = useMemo<BuilderRow[]>(() => {
    if (!data) return [];
    return data.groups.flatMap((group, index) => [
      { kind: 'group' as const, key: `g-${group.id}`, group, step: index + 1 },
      ...group.options.map((option) => ({
        kind: 'option' as const,
        key: `o-${option.id}`,
        group,
        option,
      })),
    ]);
  }, [data]);

  const missing = useMemo(() => (data ? pendingSteps(data.groups, selections) : []), [data, selections]);

  const completedGroups = useMemo(
    () => (data?.groups ?? []).filter((group) => unitsInGroup(group, selections) >= group.minSelection).length,
    [data, selections],
  );

  /** Alérgenos presentes en lo que el cliente lleva elegido ahora mismo. */
  const bowlAllergens = useMemo(() => {
    const codes = new Set<string>();
    selectedIds.forEach((id) => optionIndex.get(id)?.allergens.forEach((code) => codes.add(code)));
    return [...codes];
  }, [optionIndex, selectedIds]);

  if (config.loading) {
    return (
      <ScreenScaffold title="Arma tu bowl" padded>
        <View style={styles.skeleton}>
          <Skeleton height={150} rounded="lg" />
          <Skeleton height={22} width="55%" style={styles.skeletonGap} />
          <Skeleton height={76} rounded="md" count={5} gap={spacing.sm} style={styles.skeletonGap} />
        </View>
      </ScreenScaffold>
    );
  }

  if (!data) {
    return (
      <ScreenScaffold title="Arma tu bowl" padded>
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos abrir el constructor"
          message={config.error?.message ?? 'Vuelve a intentarlo en unos segundos.'}
          actionLabel="Reintentar"
          onAction={() => void config.refetch()}
          secondaryLabel="Ver el menú"
          onSecondary={() => router.replace('/(tabs)/menu')}
        />
      </ScreenScaffold>
    );
  }

  const totalSteps = data.groups.length;
  const ready = missing.length === 0;
  // Entre el último toque y la respuesta del servidor hay un hueco (el respiro
  // de 260 ms más la petición): durante ese rato el precio se está calculando,
  // aunque el hook todavía no tenga clave que pedir.
  const calculating = quote.loading || quote.refreshing || (ready && !quoted && quoteError === null);

  const footerLabel = !ready
    ? `Faltan ${missing.length} de ${totalSteps} pasos`
    : quoteError
      ? 'Revisa tus ingredientes'
      : quoted
        ? 'Precio validado'
        : 'Calculando tu precio…';

  const header = (
    <View>
      <View style={[styles.hero, shadow.md]}>
        <AppImage
          uri={data.product.imageUrl}
          style={styles.heroImage}
          priority="high"
          accessibilityLabel={data.product.name}
        />
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>CONSTRUCTOR VERDE BOWL</Text>
          <Text style={styles.heroTitle}>{data.product.name}</Text>
          <Text style={styles.heroText}>
            Elige paso a paso. El precio y la nutrición los calcula nuestra cocina, no la app.
          </Text>
        </View>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${totalSteps === 0 ? 100 : (completedGroups / totalSteps) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {completedGroups} de {totalSteps} pasos listos
        </Text>
      </View>

      <Text style={styles.step}>TAMAÑO</Text>
      <View style={styles.variants}>
        {data.variants.map((variant) => {
          const active = variant.id === variantId;
          return (
            <Pressable
              key={variant.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${variant.name}, ${money(variant.basePrice)}`}
              onPress={() => chooseVariant(variant.id)}
              style={({ pressed }) => [
                styles.variant,
                active && styles.variantActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.variantName, active && styles.onBrand]}>{variant.name}</Text>
              <Text style={[styles.variantPrice, active && styles.onBrandMuted]}>
                {money(variant.basePrice)}
              </Text>
              <Text style={[styles.variantMacro, active && styles.onBrandMuted]}>
                {Math.round(variant.nutrition.calories)} kcal base
              </Text>
            </Pressable>
          );
        })}
      </View>

      {data.presets.length > 0 && (
        <View>
          <Text style={styles.step}>ATAJOS DEL CHEF</Text>
          <FlatList
            horizontal
            data={data.presets}
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetRow}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Aplicar ${item.name}`}
                onPress={() => applyPreset(item)}
                style={({ pressed }) => [styles.preset, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="chef-hat" size={24} color={colors.accent500} />
                <Text numberOfLines={1} style={styles.presetName}>
                  {item.name}
                </Text>
                <Text numberOfLines={3} style={styles.presetCopy}>
                  {item.description || 'Combinación recomendada por la cocina.'}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );

  const footer = (
    <View>
      {missing.length > 0 && (
        <View style={styles.notice}>
          <MaterialCommunityIcons name="progress-check" size={22} color={colors.warning} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Te falta poco</Text>
            {missing.map((line) => (
              <Text key={line} style={styles.noticeText}>
                • {line}
              </Text>
            ))}
          </View>
        </View>
      )}

      {quoteError && missing.length === 0 ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.danger} />
          <View style={styles.noticeCopy}>
            <Text style={styles.errorTitle}>La cocina no aceptó esta combinación</Text>
            <Text style={styles.errorText}>{quoteError.message}</Text>
          </View>
        </View>
      ) : null}

      {quoted && (
        <View style={styles.macroCard}>
          <Text style={styles.macroLabel}>NUTRICIÓN DE TU BOWL</Text>
          <View style={styles.macroRow}>
            <Macro value={`${Math.round(quoted.nutrition.calories)}`} unit="kcal" />
            <Macro value={`${Math.round(quoted.nutrition.protein)} g`} unit="proteína" />
            <Macro value={`${Math.round(quoted.nutrition.carbs)} g`} unit="carbos" />
            <Macro value={`${Math.round(quoted.nutrition.fat)} g`} unit="grasas" />
          </View>
        </View>
      )}

      {bowlAllergens.length > 0 && (
        <View style={styles.allergenCard}>
          <Text style={styles.allergenTitle}>Tu bowl contiene</Text>
          <View style={styles.allergenChips}>
            {bowlAllergens.map((code) => (
              <Chip
                key={code}
                size="sm"
                icon="alert-outline"
                tone="danger"
                label={allergenName(code)}
                selected={avoidedAllergens.has(code)}
              />
            ))}
          </View>
          <Text style={styles.allergenNote}>
            Preparamos en una cocina compartida: informamos los alérgenos de cada ingrediente, pero
            no podemos garantizar la ausencia de trazas.
          </Text>
        </View>
      )}

      <PrimaryButton
        label={savedBowlId === null ? 'Guardar esta receta' : 'Guardar o actualizar receta'}
        variant="secondary"
        disabled={!quoted}
        onPress={openSave}
        style={styles.saveButton}
      />
      <Text style={styles.legal}>
        Los precios ya incluyen IGV. Los calcula el servidor con la carta vigente de tu local.
      </Text>
    </View>
  );

  return (
    <ScreenScaffold
      title={data.product.name}
      subtitle="Arma tu bowl paso a paso"
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mis bowls guardados"
          hitSlop={layout.iconHitSlop}
          onPress={() => router.push('/saved-bowls' as Href)}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bookmark-multiple-outline" size={22} color={colors.brand700} />
        </Pressable>
      }
      footer={
        <View style={styles.bar}>
          <View style={styles.barCopy}>
            <Text style={styles.barLabel}>{footerLabel}</Text>
            <Text style={styles.barPrice}>{quoted ? money(quoted.lineTotal) : '—'}</Text>
          </View>
          <PrimaryButton
            label={isEditing ? 'Revisar cambios' : 'Revisar y agregar'}
            loading={calculating}
            disabled={!quoted}
            onPress={() => {
              void Haptics.selectionAsync();
              setSummaryOpen(true);
            }}
            style={styles.barButton}
          />
        </View>
      }
    >
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === 'group') {
            return (
              <GroupHeader
                group={item.group}
                step={item.step}
                units={unitsInGroup(item.group, selections)}
              />
            );
          }

          const quantity = selections[item.option.id] ?? 0;
          const used = unitsInGroup(item.group, selections);
          const blocker = quantity > 0 ? null : conflictFor(item.option);

          return (
            <OptionRow
              group={item.group}
              option={item.option}
              quantity={quantity}
              groupRemaining={item.group.maxSelection - used}
              blocker={blocker}
              allergenName={allergenName}
              avoided={avoidedAllergens}
              onAdd={() => addOption(item.group, item.option)}
              onRemove={() => removeOption(item.group, item.option)}
              onQuantity={(next) => setQuantity(item.group, item.option, next)}
              onResolve={(other) => resolveConflict(item.group, item.option, other)}
            />
          );
        }}
      />

      <BottomSheet
        visible={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Así queda tu bowl"
        subtitle={quoted?.description}
      >
        {quoted && (
          <View>
            {/* El backend limita la receta a 30 líneas: cabe sin virtualizar. */}
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {quoted.selections.map((line) => (
                <View key={`${line.groupId}-${line.optionId}`} style={styles.sheetLine}>
                  <View style={styles.sheetLineCopy}>
                    <Text style={styles.sheetGroup}>{line.groupName}</Text>
                    <Text style={styles.sheetOption}>
                      {line.quantity > 1 ? `${line.quantity}× ` : ''}
                      {line.optionName}
                    </Text>
                  </View>
                  <Text style={styles.sheetExtra}>
                    {line.lineExtra > 0 ? `+ ${money(line.lineExtra)}` : 'Incluido'}
                  </Text>
                </View>
              ))}

              {bowlAllergens.length > 0 && (
                <View style={styles.sheetAllergens}>
                  <Text style={styles.allergenTitle}>Alérgenos declarados</Text>
                  <View style={styles.allergenChips}>
                    {bowlAllergens.map((code) => (
                      <Chip
                        key={code}
                        size="sm"
                        tone="danger"
                        icon="alert-outline"
                        label={allergenName(code)}
                        selected={avoidedAllergens.has(code)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.sheetTotals}>
              <View style={styles.sheetTotalRow}>
                <Text style={styles.sheetTotalLabel}>Base {quoted.variantName ?? ''}</Text>
                <Text style={styles.sheetTotalValue}>{money(quoted.basePrice)}</Text>
              </View>
              <View style={styles.sheetTotalRow}>
                <Text style={styles.sheetTotalLabel}>Extras</Text>
                <Text style={styles.sheetTotalValue}>{money(quoted.extrasTotal)}</Text>
              </View>
              <View style={[styles.sheetTotalRow, styles.sheetGrand]}>
                <Text style={styles.sheetGrandLabel}>Total</Text>
                <Text style={styles.sheetGrandValue}>{money(quoted.lineTotal)}</Text>
              </View>
              <Text style={styles.sheetMacros}>
                {Math.round(quoted.nutrition.calories)} kcal ·{' '}
                {Math.round(quoted.nutrition.protein)} g proteína ·{' '}
                {Math.round(quoted.nutrition.carbs)} g carbos · {Math.round(quoted.nutrition.fat)} g
                grasas
              </Text>
            </View>

            <PrimaryButton
              label={isEditing ? 'Guardar cambios' : 'Agregar al carrito'}
              onPress={confirmAdd}
              style={styles.sheetCta}
            />
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={saveOpen}
        onClose={() => !saving && setSaveOpen(false)}
        title="Guardar esta receta"
        subtitle="La encontrarás en Mi cuenta › Bowls guardados, lista para repetir."
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={styles.fieldLabel}>Nombre de la receta</Text>
          <TextInput
            value={recipeName}
            onChangeText={(value) => {
              setRecipeName(value);
              setSaveError('');
            }}
            maxLength={80}
            autoFocus
            placeholder="Mi bowl de los lunes"
            placeholderTextColor={colors.inkMuted}
            returnKeyType="done"
            style={styles.field}
          />
          <Text style={saveError ? styles.fieldError : styles.fieldHint}>
            {saveError || `${recipeName.trim().length}/80 caracteres`}
          </Text>

          {savedBowlId !== null && (
            <PrimaryButton
              label="Actualizar la receta abierta"
              loading={saving}
              onPress={() => void persistRecipe('update')}
              style={styles.sheetCta}
            />
          )}
          <PrimaryButton
            label={savedBowlId === null ? 'Guardar receta' : 'Guardar como una nueva'}
            variant={savedBowlId === null ? 'primary' : 'secondary'}
            loading={saving}
            onPress={() => void persistRecipe('create')}
            style={styles.sheetCta}
          />
        </KeyboardAvoidingView>
      </BottomSheet>
    </ScreenScaffold>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas de la lista                                                  */
/* ------------------------------------------------------------------ */

function Macro({ value, unit }: { value: string; unit: string }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
    </View>
  );
}

function GroupHeader({ group, step, units }: { group: BuilderGroup; step: number; units: number }) {
  const done = units >= group.minSelection && units <= group.maxSelection;
  const optional = group.minSelection === 0;

  return (
    <View style={styles.groupHeader}>
      <View style={styles.groupCopy}>
        <Text style={styles.step}>
          PASO {step} · {group.name.toUpperCase()}
        </Text>
        <Text style={styles.groupText}>
          {group.description ||
            (optional
              ? `Opcional, hasta ${group.maxSelection}`
              : `Elige entre ${group.minSelection} y ${group.maxSelection}`)}
        </Text>
        {group.freeQuantity > 0 && (
          <Text style={styles.groupFree}>
            {group.freeQuantity} {group.freeQuantity === 1 ? 'incluida' : 'incluidas'} sin costo; lo
            demás suma al precio.
          </Text>
        )}
      </View>

      <View style={[styles.counter, done && styles.counterDone]}>
        <MaterialCommunityIcons
          name={done ? 'check' : 'dots-horizontal'}
          size={15}
          color={done ? colors.brand700 : colors.warning}
        />
        <Text style={[styles.counterText, done && styles.counterTextDone]}>
          {units}/{group.maxSelection}
        </Text>
      </View>
    </View>
  );
}

interface OptionRowProps {
  group: BuilderGroup;
  option: BuilderOption;
  quantity: number;
  /** Unidades que todavía caben en el paso. */
  groupRemaining: number;
  /** Opción ya elegida que impide esta; null si no hay choque. */
  blocker: BuilderOption | null;
  allergenName: (code: string) => string;
  avoided: Set<string>;
  onAdd: () => void;
  onRemove: () => void;
  onQuantity: (next: number) => void;
  onResolve: (blocker: BuilderOption) => void;
}

function OptionRow({
  group,
  option,
  quantity,
  groupRemaining,
  blocker,
  allergenName,
  avoided,
  onAdd,
  onRemove,
  onQuantity,
  onResolve,
}: OptionRowProps) {
  const selected = quantity > 0;
  const soldOut = !option.isAvailable;
  const single = group.selectionType === 'SINGLE';
  const full = !selected && groupRemaining <= 0;
  const risky = option.allergens.filter((code) => avoided.has(code));

  const reason = soldOut
    ? 'Hoy no lo tenemos en esta cocina'
    : blocker
      ? `No combina con ${blocker.name}`
      : full && !single
        ? `Ya llegaste al máximo de este paso (${group.maxSelection})`
        : null;

  const priceText =
    option.priceDelta > 0
      ? option.chargeAlways
        ? `Suplemento + ${money(option.priceDelta)}`
        : `+ ${money(option.priceDelta)} al pasarte de lo incluido`
      : 'Sin costo extra';

  const blocked = soldOut || (blocker !== null && !selected) || (full && !single);

  const press = () => {
    if (soldOut) return;
    if (blocker && !selected) {
      onResolve(blocker);
      return;
    }
    if (selected) {
      // Un paso obligatorio de una sola opción no se puede dejar vacío: se
      // cambia eligiendo otra, no quitando la que ya está.
      if (single && group.minSelection > 0) return;
      onRemove();
      return;
    }
    if (full && !single) return;
    onAdd();
  };

  return (
    <Pressable
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled: soldOut }}
      accessibilityLabel={`${option.name}. ${reason ?? priceText}`}
      onPress={press}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        soldOut && styles.optionSoldOut,
        pressed && !soldOut && styles.pressed,
      ]}
    >
      <AppImage
        uri={option.imageUrl}
        style={styles.optionImage}
        fallbackIcon="food-apple-outline"
        fallbackIconSize={26}
        accessibilityLabel={option.name}
      />

      <View style={styles.optionCopy}>
        <Text numberOfLines={1} style={[styles.optionName, soldOut && styles.mutedText]}>
          {option.name}
        </Text>

        {option.description ? (
          <Text numberOfLines={2} style={styles.optionText}>
            {option.description}
          </Text>
        ) : null}

        <Text style={[styles.optionPrice, option.priceDelta > 0 && styles.optionPriceExtra]}>
          {priceText}
        </Text>

        {option.allergens.length > 0 && (
          <View style={styles.optionTags}>
            {option.allergens.map((code) => (
              <View
                key={code}
                style={[styles.allergenTag, avoided.has(code) && styles.allergenTagAvoided]}
              >
                <MaterialCommunityIcons
                  name="alert-outline"
                  size={12}
                  color={avoided.has(code) ? colors.danger : colors.warning}
                />
                <Text
                  style={[styles.allergenTagText, avoided.has(code) && styles.allergenTagTextAvoided]}
                >
                  {allergenName(code)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {risky.length > 0 && (
          <Text style={styles.avoidWarning}>
            Marcaste {risky.map(allergenName).join(' y ')} como alérgeno a evitar.
          </Text>
        )}

        {reason ? <Text style={styles.optionReason}>{reason}</Text> : null}
      </View>

      <View style={styles.optionAction}>
        {selected && !single ? (
          <QuantityStepper
            size="sm"
            value={quantity}
            min={1}
            minBehavior="remove"
            onRemove={onRemove}
            max={Math.min(option.maxPerItem, quantity + Math.max(0, groupRemaining))}
            label={option.name}
            onChange={onQuantity}
          />
        ) : selected ? (
          <View style={styles.check}>
            <MaterialCommunityIcons name="check" size={20} color={colors.surface} />
          </View>
        ) : blocker && !soldOut ? (
          <View style={styles.swap}>
            <MaterialCommunityIcons name="swap-horizontal" size={18} color={colors.brand700} />
            <Text style={styles.swapText}>Cambiar</Text>
          </View>
        ) : (
          <View style={[styles.add, blocked && styles.addBlocked]}>
            <MaterialCommunityIcons
              name={soldOut ? 'clock-outline' : 'plus'}
              size={20}
              color={blocked ? colors.inkMuted : colors.surface}
            />
          </View>
        )}
      </View>
    </Pressable>
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
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  heroImage: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    ...type.label,
    color: colors.onDarkMuted,
  },
  heroTitle: {
    ...type.title,
    color: colors.onDark,
    marginTop: spacing.xs,
  },
  heroText: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: spacing.xs + 2,
  },
  progressCard: {
    marginTop: spacing.md,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brand600,
  },
  progressText: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs + 2,
  },
  step: {
    ...type.label,
    color: colors.brand700,
    textTransform: 'uppercase',
  },
  variants: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  variant: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm + spacing.xs,
  },
  variantActive: {
    backgroundColor: colors.brand700,
    borderColor: colors.brand700,
  },
  variantName: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  variantPrice: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
    marginTop: 3,
  },
  variantMacro: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  onBrand: {
    color: colors.onDark,
  },
  onBrandMuted: {
    color: colors.onDarkMuted,
  },
  presetRow: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.md,
  },
  preset: {
    width: 196,
    minHeight: 132,
    backgroundColor: '#fff8e8',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f4e0bb',
    padding: spacing.md,
  },
  presetName: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.sm,
  },
  presetCopy: {
    ...type.bodySm,
    color: '#7a6538',
    marginTop: spacing.xs,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  groupCopy: {
    flex: 1,
  },
  groupText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  groupFree: {
    ...type.caption,
    color: colors.brand700,
    marginTop: 3,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    backgroundColor: '#fff0df',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  counterDone: {
    backgroundColor: colors.brand100,
  },
  counterText: {
    ...type.label,
    color: colors.warning,
  },
  counterTextDone: {
    color: colors.brand700,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 84,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.sm,
  },
  optionSelected: {
    borderColor: colors.brand600,
    backgroundColor: colors.brand50,
  },
  optionSoldOut: {
    backgroundColor: colors.surfaceMuted,
    borderStyle: 'dashed',
  },
  optionImage: {
    width: 58,
    height: 58,
    borderRadius: radius.sm + 2,
  },
  optionCopy: {
    flex: 1,
  },
  optionName: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  mutedText: {
    color: colors.inkMuted,
  },
  optionText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  optionPrice: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  optionPriceExtra: {
    color: colors.brand700,
  },
  optionTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs + 2,
  },
  allergenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    backgroundColor: '#fff5e4',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  allergenTagAvoided: {
    backgroundColor: '#ffeaea',
  },
  allergenTagText: {
    ...type.caption,
    color: colors.warning,
  },
  allergenTagTextAvoided: {
    color: colors.danger,
  },
  avoidWarning: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  optionReason: {
    ...type.caption,
    color: colors.warning,
    marginTop: spacing.xs,
  },
  optionAction: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  add: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  addBlocked: {
    backgroundColor: colors.line,
  },
  check: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  swap: {
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm + 4,
    backgroundColor: colors.brand50,
  },
  swapText: {
    ...type.caption,
    color: colors.brand700,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#fff7e5',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    ...type.body,
    fontWeight: '800',
    color: '#7a5200',
  },
  noticeText: {
    ...type.bodySm,
    color: '#7a5200',
    marginTop: 2,
  },
  errorCard: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#fff2f2',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.danger,
  },
  errorText: {
    ...type.bodySm,
    color: colors.danger,
    marginTop: 2,
  },
  macroCard: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  macroLabel: {
    ...type.label,
    color: colors.onDarkMuted,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  macro: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceDarkRaised,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  macroValue: {
    ...type.body,
    fontWeight: '800',
    color: colors.onDark,
  },
  macroUnit: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginTop: 2,
  },
  allergenCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  allergenTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  allergenChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  allergenNote: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  legal: {
    ...type.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm + spacing.xs,
  },
  barCopy: {
    flex: 1,
  },
  barLabel: {
    ...type.caption,
    color: colors.inkMuted,
  },
  barPrice: {
    ...type.heading,
    color: colors.ink,
    marginTop: 2,
  },
  barButton: {
    minWidth: 176,
  },
  sheetScroll: {
    maxHeight: 300,
  },
  sheetLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  sheetLineCopy: {
    flex: 1,
  },
  sheetGroup: {
    ...type.caption,
    color: colors.inkMuted,
  },
  sheetOption: {
    ...type.body,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 2,
  },
  sheetExtra: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },
  sheetAllergens: {
    marginTop: spacing.md,
  },
  sheetTotals: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  sheetTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sheetTotalLabel: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  sheetTotalValue: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  sheetGrand: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  sheetGrandLabel: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  sheetGrandValue: {
    ...type.heading,
    color: colors.brand700,
  },
  sheetMacros: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  sheetCta: {
    marginTop: spacing.md,
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
  },
  fieldError: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.xs + 2,
  },
  pressed: {
    opacity: 0.75,
  },
});
