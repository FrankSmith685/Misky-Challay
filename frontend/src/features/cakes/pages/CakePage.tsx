import { useDesignRepeat } from '../hooks/useDesignRepeat';
import { allergenLabel } from '@lib/allergens';
import { Input } from '@components/ui/Input';
import { CakeAvailabilityNotice } from '../components/CakeAvailabilityNotice';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ChevronUp,
  Clock3,
  Loader2,
  MessageSquareText,
  Package,
  ShoppingBag,
} from 'lucide-react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem } from '@features/cart/cartSlice';
import { catalogApi } from '@features/catalog/services/catalog.service';
import type { ProductDetail } from '@features/catalog/types';
import type { DeliverySlot } from '@features/geo/types';
import { geoApi } from '@features/geo/services/geo.service';
import { Button } from '@components/ui/Button';
import { Textarea } from '@components/ui/Textarea';
import { formatCurrency } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import type { CartItem } from '@/types/domain';
import {
  cakesApi,
  type CakeProfile,
  type CakeVisualPreviewInput,
  type DesignBrief,
} from '../cakes.service';
import { CakeBuilderSummary } from '../components/CakeBuilderSummary';
import { CakeReferenceUpload } from '../components/CakeReferenceUpload';
import { compactCakeReference, prepareCakeReference } from '../utils/prepareCakeReference';
import CakeDesignWizard from '../components/CakeDesignWizard';
import { CakeFreeformRequest } from '../components/CakeFreeformRequest';
import { CakeQuoteSummary } from '../components/CakeQuoteSummary';
import { CakeInspirationGallery } from '../components/CakeInspirationGallery';
import { CakeSizeSelector, cakeSizeName } from '../components/CakeSizeSelector';
import { CakeOptionsPanel } from '../components/CakeOptionsPanel';
import { useCakeBuilder } from '../hooks/useCakeBuilder';
import { useCakeVisualPreview } from '../hooks/useCakeVisualPreview';
import { cakeThemesApi, type CakeTheme } from '../cakeThemes.service';
import { CakeThemeBanner } from '../components/CakeThemeBanner';
import { cakePreviewApi, type CakePreviewSnapshot } from '../cakePreview.service';
import {
  cakeDesignForNewReference,
  cakePreviewDesign,
  defaultCakeVisualDesign,
  type CakeVisualDesign,
} from '../utils/cakeVisualDesign';
import {
  cakeVisualDraftKey,
  readCakeVisualDraft,
  writeCakeVisualDraft,
  writeCakeDetailsDraft,
} from '../utils/cakeVisualDraft';
import { previewCakePrice } from '../utils/cakePricePreview';
import '../cake-configurator.css';

const STEPS = ['Tamaño', 'Personalización', 'Detalles'] as const;
const selectionKey = (selections: Array<{ optionId: number; quantity: number }>) =>
  selections
    .map((entry) => `${entry.optionId}:${entry.quantity}`)
    .sort()
    .join('|');

const CakePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const themeSlug = searchParams.get('diseno');
  const specialRequest = searchParams.get('solicitud') === 'especial';
  const previewToken = searchParams.get('vista');
  const repeatRequestId = searchParams.get('repetirSolicitud');
  const actorId = useAppSelector((state) => state.auth.user?.id);
  const [theme, setTheme] = useState<CakeTheme | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const authenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const editing = (location.state as { editItem?: CartItem } | null)?.editItem;
  const editingSlotId = editing?.preferredSlotId;
  const [sharedImport, setSharedImport] = useState<{
    token: string;
    snapshot: CakePreviewSnapshot | null;
    error: string;
  }>({ token: '', snapshot: null, error: '' });
  const [sharedRetry, setSharedRetry] = useState(0);
  const [sharedNotice, setSharedNotice] = useState<{ token: string; message: string } | null>(null);
  const sharedPending = Boolean(previewToken && !editing && sharedImport.token !== previewToken);
  const sharedSnapshot =
    !editing && previewToken && sharedImport.token === previewToken ? sharedImport.snapshot : null;
  const sharedConfiguration = sharedSnapshot?.configuration;
  const restoredServingsRef = useRef('');
  const { branchId, address, pickupBranch, deliveryType, openLocationModal } = useAppState();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const repeat = useDesignRepeat(repeatRequestId, actorId, product?.id);
  const [profile, setProfile] = useState<CakeProfile | null>(null);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [slotId, setSlotId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [designDetails, setDesignDetails] = useState(
    editing?.designDetails ?? { inscription: '', occasion: '', finish: '' },
  );
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(
    editing?.referenceDataUrl ?? null,
  );
  const [visualDesign, setVisualDesign] = useState<CakeVisualDesign>(() =>
    cakePreviewDesign(editing?.cakeVisualDesign),
  );
  const importedVisualToken = useRef('');
  const visualDraftKey = cakeVisualDraftKey(slug ?? '', themeSlug, previewToken, editing?.id);
  const visualDraftState = useRef({ design: visualDesign, reference: referenceDataUrl });
  visualDraftState.current = { design: visualDesign, reference: referenceDataUrl };
  useEffect(() => {
    const timer = setTimeout(
      () =>
        writeCakeDetailsDraft(
          visualDraftKey,
          message,
          designDetails,
          visualDraftState.current.design,
          visualDraftState.current.reference,
        ),
      400,
    );
    return () => clearTimeout(timer);
  }, [visualDraftKey, message, designDetails]);
  useEffect(() => {
    const restore = () => {
      const draft = readCakeVisualDraft(visualDraftKey);
      if (!draft) return;
      setMessage(draft.description ?? '');
      setDesignDetails(draft.details ?? { inscription: '', occasion: '', finish: '' });
      setReferenceDataUrl(draft.reference);
      setVisualDesign(draft.design);
    };
    window.addEventListener('dulceflow:drafts-restored', restore);
    return () => window.removeEventListener('dulceflow:drafts-restored', restore);
  }, [visualDraftKey]);
  const changeVisualDesign = (design: CakeVisualDesign) => {
    visualDraftState.current = { ...visualDraftState.current, design };
    setVisualDesign(design);
    writeCakeVisualDraft(visualDraftKey, design, visualDraftState.current.reference);
  };
  const changeVisualReference = (reference: string | null) => {
    const currentDesign = visualDraftState.current.design;
    const design = reference
      ? cakeDesignForNewReference(currentDesign)
      : { ...currentDesign, reconstruction: undefined };
    visualDraftState.current = { design, reference };
    setVisualDesign(design);
    setReferenceDataUrl(reference);
    writeCakeVisualDraft(visualDraftKey, design, reference);
  };
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const referenceChange = useRef(0);
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [error, setError] = useState('');
  const [legacyRedirect, setLegacyRedirect] = useState<'SEMI_CUSTOM' | 'ADVANCED' | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingLock = useRef(false);
  const [step, setStep] = useState(0);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [manualQuoteOpen, setManualQuoteOpen] = useState(specialRequest);
  const [manualQuoteServings, setManualQuoteServings] = useState<number | undefined>();
  const [customSelected, setCustomSelected] = useState(Boolean(editing?.requestedServings));
  const [customServings, setCustomServings] = useState(
    editing?.requestedServings ? String(editing.requestedServings) : '',
  );
  const requestedServings = customSelected ? Number(customServings) : undefined;
  const initialSelections = useMemo(
    () =>
      editing?.selections.map((entry) => ({
        optionId: entry.optionId,
        quantity: entry.quantity,
      })) ??
      repeat.value?.request.selectionsJson ??
      sharedConfiguration?.selections ??
      [],
    [editing, sharedConfiguration, repeat.value],
  );
  const builder = useCakeBuilder({
    productId: product?.id ?? 0,
    branchId,
    enabled:
      !sharedPending &&
      !repeat.pending &&
      product?.type === 'CUSTOMIZABLE' &&
      (!themeSlug || Boolean(theme)) &&
      theme?.saleMode !== 'QUOTE',
    initialVariantId:
      editing?.variantId ?? repeat.value?.request.variantId ?? sharedSnapshot?.variantId,
    initialSelections,
    initialConfigurationKey: repeat.value
      ? `repeat:${repeat.value.request.id}`
      : sharedSnapshot && previewToken
        ? previewToken
        : 'default',
    initialRequestedServings: sharedConfiguration?.requestedServings,
    requestedServings,
    quantity,
    theme,
  });
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? null;
  const allowedVariants =
    product?.variants.filter(
      (variant) =>
        !theme ||
        theme.saleMode !== 'CONFIGURED' ||
        theme.variantRules.some((rule) => rule.variantId === variant.id),
    ) ?? [];
  const effectiveVariantId = allowedVariants.some((variant) => variant.id === builder.variantId)
    ? builder.variantId
    : (allowedVariants.find((variant) => variant.isDefault)?.id ?? allowedVariants[0]?.id ?? null);
  const selectedVariant =
    allowedVariants.find((variant) => variant.id === effectiveVariantId) ?? null;
  const customRule = profile?.customServingsJson;
  const customValid =
    !customSelected ||
    Boolean(
      customRule?.enabled &&
      Number.isSafeInteger(requestedServings) &&
      requestedServings! >= customRule.minServings &&
      requestedServings! <= customRule.maxServings &&
      selectedVariant?.id === customRule.baseVariantId,
    );
  const validatedQuote =
    builder.quote?.variantId === effectiveVariantId &&
    builder.quote.quantity === quantity &&
    (builder.quote.requestedServings ?? undefined) === requestedServings &&
    (builder.quote.theme?.id ?? null) === (theme?.id ?? null) &&
    builder.quote.theme?.version === theme?.version &&
    selectionKey(builder.quote.selections) === selectionKey(builder.selections)
      ? builder.quote
      : null;
  const isAdvanced = profile?.saleMode === 'ADVANCED';
  const businessEntry =
    Boolean(themeSlug) || isAdvanced || searchParams.get('canal') === 'empresas';
  const isCustom = product?.type === 'CUSTOMIZABLE';
  const isCake = !product?.family || product.family === 'CAKE';
  const hasAlternativeServingOption =
    isCake &&
    ((!theme && profile?.saleMode === 'SEMI_CUSTOM' && Boolean(customRule)) ||
      theme?.saleMode === 'CONFIGURED');
  const singlePresentation =
    !isCustom && allowedVariants.length === 1 && !hasAlternativeServingOption
      ? selectedVariant
      : null;
  const quantityValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 20;
  const visibleSteps = isCustom
    ? STEPS.map((label, index) => ({ label, index }))
    : [
        { label: 'Presentación', index: 0 },
        { label: 'Detalles', index: 2 },
      ];
  const builderReady = !isCustom || builder.missingGroups.length === 0;
  const groups = builder.config?.groups ?? [];
  const selectedGroupNames = (pattern: RegExp) =>
    groups
      .filter((group) => pattern.test(group.name))
      .flatMap((group) =>
        group.options
          .filter((option) => builder.getQuantity(option.id) > 0)
          .map((option) => option.name),
      )
      .join(', ');
  const visualFlavor = selectedGroupNames(/sabor|bizcocho|masa/i);
  const visualFilling = selectedGroupNames(/relleno/i);
  const visualAddons = selectedGroupNames(/adicional|complemento/i);
  const selectedSizeGuide = customRule?.sizeGuides?.find(
    (guide) => guide.variantId === selectedVariant?.id,
  );
  const sizeLabel = customSelected
    ? 'Más porciones'
    : selectedSizeGuide
      ? `${selectedSizeGuide.diameterCm} cm · ${selectedSizeGuide.minServings}–${selectedSizeGuide.maxServings} porciones`
      : cakeSizeName(selectedVariant?.name ?? 'Elige un tamaño');
  const servings = customSelected
    ? Number.isSafeInteger(requestedServings) && requestedServings! > 0
      ? requestedServings!
      : null
    : selectedSizeGuide
      ? null
      : (selectedVariant?.servingSize ?? null);
  const visualOptions = groups.flatMap((group) =>
    group.options.flatMap((option) => {
      const count = builder.getQuantity(option.id);
      return count ? [{ groupName: group.name, optionName: option.name, quantity: count }] : [];
    }),
  );
  const previewInput = {
    flavor: visualFlavor,
    filling: visualFilling,
    addons: visualAddons,
    description: [
      message.trim(),
      designDetails.inscription ? 'Texto exacto: ' + designDetails.inscription : '',
      designDetails.occasion ? 'Ocasión: ' + designDetails.occasion : '',
      designDetails.finish ? 'Acabado: ' + designDetails.finish : '',
    ]
      .filter(Boolean)
      .join('\n'),
    sizeLabel,
    diameterCm: customSelected ? null : (selectedSizeGuide?.diameterCm ?? null),
    servings: customSelected
      ? customValid
        ? requestedServings
        : null
      : Number(selectedVariant?.servingSize) || null,
    options: visualOptions,
    referenceDataUrl: referenceDataUrl ?? undefined,
  };
  const preview = useCakeVisualPreview(
    previewInput,
    Boolean(isCake && isCustom && selectedVariant && customValid && !referenceBusy),
    editing?.cakeAiProposal
      ? {
          dataUrl: editing.cakeAiProposal.dataUrl,
          input: { ...editing.cakeAiProposal.recipe, referenceDataUrl: editing.referenceDataUrl },
        }
      : undefined,
  );
  const selectReference = async (file: File | null) => {
    const change = ++referenceChange.current;
    setReferenceError('');
    if (!file) {
      setReferenceFile(null);
      changeVisualReference(null);
      setReferenceBusy(false);
      return;
    }
    setReferenceBusy(true);
    try {
      const dataUrl = await prepareCakeReference(file);
      if (change === referenceChange.current) {
        setReferenceFile(file);
        changeVisualReference(dataUrl);
      }
    } catch (cause) {
      if (change === referenceChange.current) {
        setReferenceError(cause instanceof Error ? cause.message : 'No se pudo leer la imagen.');
      }
    } finally {
      if (change === referenceChange.current) setReferenceBusy(false);
    }
  };
  const availableOptionIds = new Set(
    groups.flatMap((group) =>
      group.options.filter((option) => option.isAvailable).map((option) => option.id),
    ),
  );
  const visiblePresets = (builder.config?.presets ?? []).filter(
    (preset) =>
      preset.selections.length > 0 &&
      preset.selections.every((selection) => availableOptionIds.has(selection.optionId)),
  );

  useEffect(() => {
    if (!previewToken || editing) return;
    let active = true;
    cakePreviewApi
      .get(previewToken)
      .then(({ snapshot }) => {
        if (
          snapshot.productSlug !== slug ||
          (snapshot.themeSlug ?? null) !== themeSlug ||
          !snapshot.configuration
        ) {
          throw new Error(
            'Este enlace no permite recuperar opciones para esta torta. Abre la vista compartida original.',
          );
        }
        if (active) setSharedImport({ token: previewToken, snapshot, error: '' });
      })
      .catch((cause) => {
        if (active)
          setSharedImport({
            token: previewToken,
            snapshot: null,
            error: getApiErrorMessage(cause),
          });
      });
    return () => {
      active = false;
    };
  }, [editing, previewToken, sharedRetry, slug, themeSlug]);

  useEffect(() => {
    referenceChange.current += 1;
    setStep(0);
    setSlotId(null);
    setReferenceFile(null);
    const draft = readCakeVisualDraft(
      cakeVisualDraftKey(slug ?? '', themeSlug, previewToken, editing?.id),
    );
    setMessage(
      draft?.description ??
        editing?.specialInstructions?.replace(
          /^(Descripción del diseño|Mensaje en la torta|Indicaciones): /,
          '',
        ) ??
        '',
    );
    setDesignDetails(
      draft?.details ?? editing?.designDetails ?? { inscription: '', occasion: '', finish: '' },
    );
    setReferenceDataUrl(draft ? draft.reference : (editing?.referenceDataUrl ?? null));
    setVisualDesign(cakePreviewDesign(draft?.design ?? editing?.cakeVisualDesign));
    importedVisualToken.current = '';
    setReferenceBusy(false);
    setReferenceError('');
    setQuantity(editing?.quantity ?? 1);
    setCustomSelected(Boolean(editing?.requestedServings));
    setCustomServings(editing?.requestedServings ? String(editing.requestedServings) : '');
    setManualQuoteOpen(false);
    setActiveGroupId(null);
    setThreeDOpen(false);
  }, [slug, editing, themeSlug, previewToken]);

  useEffect(() => {
    if (!sharedSnapshot || !previewToken || importedVisualToken.current === previewToken) return;
    importedVisualToken.current = previewToken;
    const draft = readCakeVisualDraft(cakeVisualDraftKey(slug ?? '', themeSlug, previewToken));
    setVisualDesign(cakePreviewDesign(draft?.design ?? sharedSnapshot.visualDesign));
    setReferenceDataUrl(draft ? draft.reference : (sharedSnapshot.referenceImageDataUrl ?? null));
  }, [sharedSnapshot, previewToken, slug, themeSlug]);

  useEffect(() => {
    if (!slug) return undefined;
    let active = true;
    setError('');
    setLegacyRedirect(null);
    setTheme(null);
    setProduct((current) => (current?.slug === slug ? current : null));
    Promise.all([
      catalogApi.getProduct(slug, branchId),
      themeSlug ? cakeThemesApi.get(themeSlug, branchId) : Promise.resolve(null),
    ])
      .then(async ([detail, selectedTheme]) => {
        const cakeProfile = await cakesApi.profile(detail.id);
        if (!active) return;
        if (selectedTheme && selectedTheme.productId !== detail.id)
          throw new Error(
            'Este diseño pertenece a otra torta. Vuelve a elegirlo desde Para empresas.',
          );
        setTheme(selectedTheme);
        setManualQuoteOpen(specialRequest || selectedTheme?.saleMode === 'QUOTE');
        setProduct(
          selectedTheme?.saleMode === 'CONFIGURED'
            ? {
                ...detail,
                variants: detail.variants.filter((variant) =>
                  selectedTheme.variantRules.some((rule) => rule.variantId === variant.id),
                ),
              }
            : detail,
        );
        setProfile({
          ...cakeProfile,
          minLeadHours: Math.max(cakeProfile.minLeadHours, selectedTheme?.minLeadHours ?? 0),
        });
      })
      .catch((cause) => {
        if (!active) return;
        setProduct(null);
        if (!themeSlug && axios.isAxiosError(cause) && cause.response?.status === 404) {
          if (slug === 'torta-a-tu-gusto') setLegacyRedirect('SEMI_CUSTOM');
          else if (slug === 'torta-diseno-especial') setLegacyRedirect('ADVANCED');
        }
        setError(getApiErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [branchId, editing, slug, themeSlug, specialRequest]);

  useEffect(() => {
    if (
      !previewToken ||
      !sharedSnapshot ||
      !profile ||
      profile.productId !== sharedSnapshot.productId ||
      builder.restoration?.sourceKey !== previewToken ||
      restoredServingsRef.current === previewToken
    )
      return;
    restoredServingsRef.current = previewToken;
    const count = builder.restoration.requestedServings;
    const rule = profile.customServingsJson;
    const allowed = Boolean(
      count &&
      rule.enabled &&
      count >= rule.minServings &&
      count <= rule.maxServings &&
      sharedSnapshot.variantId === rule.baseVariantId,
    );
    setCustomSelected(allowed);
    setCustomServings(allowed ? String(count) : '');
  }, [builder.restoration, previewToken, profile, sharedSnapshot]);

  useEffect(() => {
    if (
      !previewToken ||
      !sharedSnapshot?.configuration ||
      builder.isLoading ||
      !builder.config ||
      builder.restoration?.sourceKey !== previewToken ||
      sharedNotice?.token === previewToken
    )
      return;
    const count = sharedSnapshot.configuration.requestedServings;
    const rule = profile?.customServingsJson;
    const servingsChanged = Boolean(
      count &&
      (!rule?.enabled ||
        count < rule.minServings ||
        count > rule.maxServings ||
        sharedSnapshot.variantId !== rule.baseVariantId),
    );
    const changed =
      builder.variantId !== sharedSnapshot.variantId ||
      selectionKey(builder.selections) !== selectionKey(sharedSnapshot.configuration.selections) ||
      Boolean(
        sharedSnapshot.configuration.themeVersion &&
        theme?.version !== sharedSnapshot.configuration.themeVersion,
      ) ||
      servingsChanged;
    setSharedNotice({
      token: previewToken,
      message: builder.restoration.fromDraft
        ? 'Recuperamos tus últimos cambios en este dispositivo. Revisa la combinación y el precio actual antes de continuar.'
        : changed
          ? 'Recuperamos el diseño. Algunas opciones o medidas cambiaron en el catálogo; revisa la presentación y tu combinación antes de continuar.'
          : 'Recuperamos la presentación y las opciones de la vista compartida. Revisa el precio actual y elige tu entrega.',
    });
    setSummaryExpanded(true);
    setStep(1);
  }, [
    builder.config,
    builder.isLoading,
    builder.restoration,
    builder.selections,
    builder.variantId,
    previewToken,
    profile,
    sharedNotice,
    sharedSnapshot,
    theme?.version,
  ]);

  useEffect(() => {
    setSlots([]);
    setSlotsError('');
    if (!branchId || !profile || product?.preparationMode === 'READY_STOCK') {
      setSlotsLoading(false);
      return undefined;
    }
    let active = true;
    setSlotsLoading(true);
    geoApi
      .getSlots(branchId, 45)
      .then((nextSlots) => {
        if (!active) return;
        const valid = nextSlots.filter(
          (slot) =>
            new Date(slot.startsAt).getTime() >= Date.now() + profile.minLeadHours * 3_600_000 &&
            slot.available > 0,
        );
        setSlots(valid);
        setSlotId((current) =>
          valid.some((slot) => slot.id === current)
            ? current
            : valid.some((slot) => slot.id === editingSlotId)
              ? (editingSlotId ?? null)
              : null,
        );
      })
      .catch((cause) => {
        if (active) setSlotsError(getApiErrorMessage(cause));
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, product?.preparationMode, profile, editingSlotId]);

  useEffect(() => {
    if (product)
      document.title = specialRequest
        ? 'Solicitar diseño especial | Misky Challay'
        : `${theme?.name ?? product.name} | Misky Challay`;
  }, [product, theme, specialRequest]);

  useEffect(() => {
    if (
      activeGroupId !== null &&
      activeGroupId !== -1 &&
      builder.config &&
      !builder.config.groups.some((group) => group.id === activeGroupId)
    )
      setActiveGroupId(null);
  }, [activeGroupId, builder.config]);

  const canAdd = Boolean(
    product?.isAvailable &&
    quantityValid &&
    selectedVariant &&
    customValid &&
    builderReady &&
    !builder.isQuoting &&
    !referenceBusy &&
    !adding &&
    !preview.generating &&
    (!isCustom || validatedQuote),
  );

  const addToCart = async () => {
    if (!product || !selectedVariant || !profile || !canAdd || addingLock.current) return;
    const quote = validatedQuote;
    const cartItem: CartItem = {
      id: crypto.randomUUID(),
      productId: product.id,
      slug: product.slug,
      variantId: selectedVariant.id,
      name: theme?.name ?? product.name,
      variantName:
        quote?.variantName ??
        (selectedVariant.servingSize
          ? `${cakeSizeName(selectedVariant.name)} · ${selectedVariant.servingSize} ${selectedVariant.servingUnit ?? 'unidades'}`
          : selectedVariant.name),
      imageUrl: theme?.imageUrls[0] ?? product.imageUrl,
      quantity,
      theme: quote?.theme ?? undefined,
      requestedServings: customSelected ? requestedServings : undefined,
      unitPrice: quote?.basePrice ?? selectedVariant.basePrice,
      extrasTotal: quote?.extrasTotal ?? 0,
      lineTotal: quote?.lineTotal ?? selectedVariant.basePrice * quantity,
      selections:
        quote?.selections.map((entry) => ({
          groupId: entry.groupId,
          groupName: entry.groupName,
          optionId: entry.optionId,
          optionName: entry.optionName,
          quantity: entry.quantity,
          priceDelta: entry.priceDelta,
        })) ?? [],
      designDetails,
      specialInstructions: message.trim()
        ? `${isCake ? 'Descripción del diseño' : 'Indicaciones'}: ${message.trim()}`
        : undefined,
      referenceDataUrl: isCake ? (referenceDataUrl ?? undefined) : undefined,
      cakeVisualDesign:
        isCake &&
        (referenceDataUrl ||
          JSON.stringify(visualDesign) !== JSON.stringify(defaultCakeVisualDesign()))
          ? visualDesign
          : undefined,
      preparationMode: product.preparationMode,
      requiresScheduledDelivery: product.preparationMode !== 'READY_STOCK',
      requiresCarDelivery: product.family === 'CAKE',
      minLeadHours: product.preparationMode === 'READY_STOCK' ? 0 : Math.max(profile.minLeadHours, theme?.minLeadHours ?? 0),
    };
    addingLock.current = true;
    setAdding(true);
    try {
      if (isCake && preview.generatedDataUrl) {
        const recipe: CakeVisualPreviewInput = { ...previewInput };
        delete recipe.referenceDataUrl;
        cartItem.cakeAiProposal = {
          dataUrl: await compactCakeReference(preview.generatedDataUrl),
          recipe,
        };
      }
      dispatch(addItem(cartItem));
      toast.success('Producto agregado al carrito');
      navigate(ROUTES.cart);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      addingLock.current = false;
      setAdding(false);
    }
  };

  const submitDesign = async (input: {
    description: string;
    brief: DesignBrief;
    referenceDataUrl: string;
    referenceDataUrls: string[];
  }) => {
    if (!product || !selectedVariant || !branchId || !selectedSlot) return;
    setBusy(true);
    setError('');
    try {
      await cakesApi.submitDesign({
        branchId,
        productId: product.id,
        variantId: selectedVariant.id,
        desiredAt: selectedSlot.startsAt,
        selections: builder.selections,
        ...input,
      });
      toast.success('Solicitud enviada al equipo de diseño');
      navigate(ROUTES.designRequests);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const goToStep = (next: number) => {
    setStep(next);
    setError('');
    window.requestAnimationFrame(() => {
      document
        .getElementById('cake-configurator')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document
        .querySelector<HTMLElement>('[data-cake-step-heading]')
        ?.focus({ preventScroll: true });
    });
  };

  const focusGroup = (id: number) => {
    window.requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(`[data-cake-group-id="${id}"]`);
      section?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      section
        ?.querySelector<HTMLButtonElement>('[data-cake-group-toggle]')
        ?.focus({ preventScroll: true });
    });
  };

  const editGroup = (id: number) => {
    setActiveGroupId(id);
    setStep(1);
    setError('');
    focusGroup(id);
  };

  const changeGroup = (id: number | null) => {
    setActiveGroupId(id);
    if (id !== null && id > 0) focusGroup(id);
  };

  const continueToNext = () => {
    if (!customValid) {
      goToStep(0);
      return;
    }
    if (step === 0) {
      goToStep(groups.length ? 1 : 2);
      return;
    }
    if (!builderReady) {
      const first = groups.find((group) => builder.missingGroups.includes(group.name));
      if (first) editGroup(first.id);
      return;
    }
    if (step === 1) {
      goToStep(2);
      return;
    }
    if (canAdd) {
      addToCart();
      return;
    }
    setError('Completa las opciones del producto antes de agregarlo al carrito.');
  };

  const requestManualQuote = () => {
    setManualQuoteServings(
      requestedServings && Number.isSafeInteger(requestedServings)
        ? requestedServings
        : Number(selectedVariant?.servingSize) || undefined,
    );
    setManualQuoteOpen(true);
    window.requestAnimationFrame(() =>
      document
        .getElementById('cake-freeform')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const reset = () => {
    builder.reset();
    setCustomSelected(false);
    setCustomServings('');
    setMessage('');
    referenceChange.current += 1;
    setReferenceFile(null);
    setReferenceDataUrl(null);
    setVisualDesign(defaultCakeVisualDesign());
    writeCakeVisualDraft(visualDraftKey, defaultCakeVisualDesign(), null);
    setReferenceBusy(false);
    setReferenceError('');
    setQuantity(1);
    setSlotId(null);
    setActiveGroupId(null);
    goToStep(0);
  };

  const showSummary = () => {
    setSummaryExpanded(true);
  };

  if (
    legacyRedirect &&
    ((legacyRedirect === 'SEMI_CUSTOM' && slug === 'torta-a-tu-gusto') ||
      (legacyRedirect === 'ADVANCED' && slug === 'torta-diseno-especial'))
  )
    return <Navigate replace to={ROUTES.menuMode(legacyRedirect)} />;
  if (repeatRequestId && !authenticated)
    return (
      <div className="container-shell py-12">
        <p>Ingresa a tu cuenta para recuperar el dise?o original.</p>
        <Button
          onClick={() =>
            navigate(ROUTES.login, { state: { from: location.pathname + location.search } })
          }
        >
          Ingresar
        </Button>
      </div>
    );
  if (repeat.error)
    return (
      <div className="container-shell py-12" role="alert">
        {repeat.error}
        <Link className="block underline" to={ROUTES.designRequests}>
          Ver mis solicitudes
        </Link>
      </div>
    );
  if (error && !product)
    return (
      <div className="container-shell py-16" role="alert">
        <p>{error}</p>
        <Link
          className="mt-4 inline-flex font-semibold text-brand-700"
          to={businessEntry ? ROUTES.business : ROUTES.menu}
        >
          {businessEntry ? 'Volver a Para empresas' : 'Volver al catálogo'}
        </Link>
      </div>
    );
  if (repeat.pending || !product || !profile || (themeSlug && theme?.slug !== themeSlug))
    return (
      <div className="container-shell space-y-6 py-10" role="status">
        <span className="sr-only">Cargando el configurador de tortas…</span>
        <div className="h-6 w-36 animate-pulse rounded-lg bg-brand-50" />
        <div className="h-24 max-w-2xl animate-pulse rounded-xl bg-brand-50" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="h-96 animate-pulse rounded-2xl bg-brand-50" />
          <div className="h-96 animate-pulse rounded-2xl bg-brand-50" />
        </div>
      </div>
    );

  const themeRule = theme?.variantRules.find((rule) => rule.variantId === effectiveVariantId);
  const basePrice = customSelected
    ? customValid && selectedVariant && customRule
      ? selectedVariant.basePrice +
        Math.round(
          (requestedServings! - Number(selectedVariant.servingSize)) *
            customRule.pricePerExtraServing *
            100,
        ) /
          100
      : null
    : (selectedVariant?.basePrice ?? null);
  const priceScale =
    customSelected && customValid && selectedVariant?.servingSize
      ? requestedServings! / Number(selectedVariant.servingSize)
      : 1;
  const pricePreview = previewCakePrice({
    basePrice,
    groups,
    selections: builder.selections,
    quantity,
    priceScale,
    theme: theme && themeRule ? { name: theme.name, priceDelta: themeRule.priceDelta } : null,
  });
  const summaryGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    optional: group.minSelection === 0,
    complete:
      builder.unitsInGroup(group) > 0 &&
      builder.unitsInGroup(group) >= group.minSelection &&
      builder.unitsInGroup(group) <= group.maxSelection,
    label:
      group.options
        .filter((option) => builder.getQuantity(option.id) > 0)
        .map(
          (option) =>
            `${option.name}${builder.getQuantity(option.id) > 1 ? ` ×${builder.getQuantity(option.id)}` : ''}`,
        )
        .join(', ') || (group.minSelection === 0 ? 'Opcional' : ''),
  }));
  const threeD =
    isCake && isCustom && selectedVariant
      ? {
          visualDesign,
          onDesignChange: changeVisualDesign,
          referenceDataUrl,
          onReferenceChange: (dataUrl: string | null) => {
            referenceChange.current += 1;
            setReferenceFile(null);
            changeVisualReference(dataUrl);
            setReferenceBusy(false);
            setReferenceError('');
          },
          config: {
            productId: product.id,
            productSlug: product.slug,
            productName: product.name,
            variantId: selectedVariant.id,
            variantName: selectedVariant.name,
            servings:
              requestedServings ??
              (selectedVariant.servingSize ? Number(selectedVariant.servingSize) : null),
            diameterCm: customSelected ? null : (selectedSizeGuide?.diameterCm ?? null),
            themeName: theme?.name ?? null,
            themeSlug: theme?.slug ?? null,
            options: groups.flatMap((group) =>
              group.options.flatMap((option) => {
                const count = builder.getQuantity(option.id);
                return count
                  ? [{ groupName: group.name, optionName: option.name, quantity: count }]
                  : [];
              }),
            ),
          },
          shareInput: customValid
            ? {
                source: 'CONFIGURATOR' as const,
                productId: product.id,
                variantId: selectedVariant.id,
                ...(customSelected && requestedServings ? { requestedServings } : {}),
                ...(theme ? { themeId: theme.id, themeVersion: theme.version } : {}),
                selections: builder.selections,
              }
            : undefined,
        }
      : undefined;
  const requiredGroups = groups.filter((group) => group.minSelection > 0);
  const completedGroups = requiredGroups.filter(
    (group) =>
      builder.unitsInGroup(group) >= group.minSelection &&
      builder.unitsInGroup(group) <= group.maxSelection,
  ).length;
  const continueLabel =
    step === 0
      ? isCustom
        ? 'Elegir sabores'
        : 'Continuar'
      : step === 1
        ? builderReady
          ? 'Continuar a detalles'
          : `Elegir ${(builder.missingGroups[0] ?? 'opciones').toLocaleLowerCase('es')}`
        : 'Agregar al carrito';
  const continueDisabled =
    !selectedVariant ||
    !customValid ||
    !quantityValid ||
    referenceBusy ||
    (isCustom && builder.isLoading);
  const mobileContinueLabel = continueLabel;
  const deliveryLabel = deliveryType === 'PICKUP' ? pickupBranch?.name : address?.line1;
  const servingUnit = singlePresentation?.servingUnit ?? 'porciones';
  const servingLabel = singlePresentation?.servingSize
    ? `${singlePresentation.servingSize} ${singlePresentation.servingSize === 1 ? ({ porciones: 'porción', unidades: 'unidad' }[servingUnit] ?? servingUnit) : servingUnit}`
    : 'Formato único';
  const servingsHighlight = customSelected && requestedServings
    ? `${requestedServings} porciones`
    : selectedSizeGuide
      ? `${selectedSizeGuide.minServings}–${selectedSizeGuide.maxServings} porciones`
      : selectedVariant?.servingSize
        ? `${selectedVariant.servingSize} ${selectedVariant.servingUnit ?? 'porciones'}`
        : null;
  const quantityField = (
    <Input
      id="cake-quantity"
      label={singlePresentation ? 'Cantidad' : 'Cantidad de presentaciones'}
      type="number"
      min="1"
      max="20"
      step="1"
      inputMode="numeric"
      value={quantity || ''}
      onChange={(event) => setQuantity(Number(event.target.value))}
      error={!quantityValid ? 'Elige entre 1 y 20 presentaciones.' : undefined}
    />
  );

  return (
    <div
      className={`cake-page container-shell pb-28 pt-5 sm:pt-6 ${singlePresentation ? 'lg:pb-8' : 'lg:pb-16'}`}
    >
      {previewToken && !editing && (
        <div
          role={sharedImport.error && !sharedPending ? 'alert' : 'status'}
          className={`mb-5 rounded-xl border p-4 text-sm leading-6 ${sharedImport.error && !sharedPending ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-brand-200 bg-brand-50 text-brand-900'}`}
        >
          {sharedPending ? (
            'Cargando las opciones de la vista compartida…'
          ) : sharedImport.error ? (
            <>
              <p>{sharedImport.error}</p>
              <button
                type="button"
                onClick={() => {
                  setSharedImport({ token: '', snapshot: null, error: '' });
                  setSharedRetry((current) => current + 1);
                }}
                className="mt-2 font-semibold underline"
              >
                Volver a intentar
              </button>
            </>
          ) : sharedNotice?.token === previewToken ? (
            sharedNotice.message
          ) : (
            'Recuperando tu combinación…'
          )}
        </div>
      )}
      <nav
        aria-label="Ruta de navegación"
        className="mb-5 flex items-center gap-2 text-[11px] text-ink-muted"
      >
        <Link
          to={businessEntry ? ROUTES.business : specialRequest ? ROUTES.cake(product.slug) : ROUTES.menu}
          state={specialRequest ? { customCakeEntry: true } : undefined}
          className="inline-flex items-center gap-1.5 hover:text-brand-700"
        >
          <ArrowLeft className="size-3.5" /> {businessEntry ? 'Para empresas' : specialRequest ? 'Crea tu torta' : 'Catálogo'}
        </Link>
        <ChevronRight className="size-3" />
        <span className="font-medium text-ink">{specialRequest ? 'Diseño especial' : theme?.name ?? product.name}</span>
      </nav>

      <header className="cake-page-header mb-6 grid gap-5 sm:mb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="cake-eyebrow">
            {isCustom ? 'Pastelería a tu medida' : 'Pastelería Misky Challay'}
          </p>
          <h1 className="cake-page-title mt-1 text-ink">{specialRequest ? 'Solicita un diseño especial' : theme?.name ?? product.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            {specialRequest
              ? 'Cuéntanos una forma, tamaño o acabado diferente y prepararemos una propuesta para ti.'
              : theme?.saleMode === 'QUOTE'
              ? 'Cuéntanos las porciones y los detalles que imaginas. Revisaremos tu solicitud antes de confirmar el precio y la fecha.'
              : isAdvanced
                ? 'Comparte tu idea y diseñemos una torta para tu ocasión especial.'
                : isCustom
                  ? 'Elige tus sabores, personaliza cada detalle y reserva tu entrega.'
                  : product.description || 'Elige una presentación y reserva tu entrega.'}
          </p>
          {!isAdvanced && !specialRequest && (basePrice !== null || servingsHighlight) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-muted" aria-label="Información rápida de la torta">
              {basePrice !== null && <span className="font-semibold text-brand-800">Desde {formatCurrency(basePrice)}</span>}
              {servingsHighlight && <span>{servingsHighlight}</span>}
            </div>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3 sm:justify-end">
          <img
            src={theme?.imageUrls[0] ?? product.imageUrl ?? '/images/cakes/custom.svg'}
            alt={theme?.name ?? 'Torta de referencia'}
            className="size-14 shrink-0 rounded-xl object-cover sm:hidden"
          />
          <div className="cake-lead-card flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Clock3 className="size-4" strokeWidth={1.5} />
            </span>
            <p className="text-xs font-semibold text-ink">
              {product.preparationMode === 'READY_STOCK'
                ? 'Entrega lo antes posible'
                : 'Preparada por encargo'}
              <span className="mt-0.5 block text-[11px] font-normal text-ink-muted">
                {product.preparationMode === 'READY_STOCK'
                  ? 'Sujeto a existencias del taller'
                  : `${profile.minLeadHours} horas de anticipación`}
              </span>
            </p>
          </div>
        </div>
      </header>
      {repeat.value && (
        <p role="status" className="mb-4 rounded-xl bg-brand-50 p-4 text-sm">
          Recuperamos tu idea y referencias. Revisa el texto y elige una nueva fecha. El equipo
          publicar? una nueva cotizaci?n; el precio anterior no se reutiliza.
        </p>
      )}
      {!isAdvanced && !specialRequest && (
        <CakeAvailabilityNotice
          item={
            selectedVariant
              ? {
                  productId: product.id,
                  variantId: selectedVariant.id,
                  quantity,
                  selections: builder.selections,
                  requestedServings: requestedServings ?? undefined,
                  themeId: theme?.id,
                  themeVersion: theme?.version,
                }
              : null
          }
        />
      )}
      {!product.isAvailable && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Este producto no está disponible en el taller seleccionado. Puedes revisar otra ubicación
          o volver al catálogo.
        </p>
      )}

      {isAdvanced ? (
        <CakeDesignWizard
          key={repeat.value?.request.id ?? 'new'}
          prefill={repeat.value}
          product={product}
          profile={profile}
          builder={builder}
          slots={slots}
          slotId={slotId}
          onSlotChange={setSlotId}
          branchId={branchId}
          onChooseBranch={openLocationModal}
          authenticated={authenticated}
          onLogin={() =>
            navigate(ROUTES.login, {
              state: { from: `${ROUTES.cake(product.slug)}${location.search}` },
            })
          }
          onSubmit={submitDesign}
          busy={busy}
          error={error}
        />
      ) : (
        <div
          className={`grid items-start gap-6 lg:gap-8 ${threeD && !manualQuoteOpen ? 'lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]' : 'lg:grid-cols-[minmax(0,1fr)_340px]'}`}
        >
          <div className="min-w-0 space-y-5">
            {!specialRequest && theme && <CakeThemeBanner theme={theme} onAdapt={requestManualQuote} />}
            {!specialRequest && theme?.saleMode !== 'QUOTE' && (
              <section
                id="cake-configurator"
                className="cake-surface scroll-mt-24 overflow-hidden"
                aria-label="Configura tu pedido"
              >
                <nav
                  aria-label="Pasos de personalización"
                  className={`cake-steps grid border-b border-line ${isCustom ? 'grid-cols-3' : 'grid-cols-2'}`}
                >
                  {visibleSteps.map(({ label, index }, stepNumber) => {
                    const completed =
                      index === 0
                        ? customValid && Boolean(selectedVariant) && step > 0
                        : index === 1
                          ? builderReady && step > 1
                          : canAdd;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-current={step === index ? 'step' : undefined}
                        data-complete={completed}
                        onClick={() => goToStep(index)}
                        className="cake-step-button flex min-h-18 min-w-0 flex-col items-center justify-center gap-1.5 px-2 py-3 text-[11px] sm:flex-row sm:gap-3 sm:px-4 sm:text-sm"
                      >
                        <span className="cake-step-number grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold">
                          {completed ? <Check className="size-3.5" /> : `0${stepNumber + 1}`}
                        </span>
                        <span className="min-w-0 text-center sm:text-left">
                          <span className="block font-semibold">{label}</span>
                          <span className="mt-0.5 hidden text-[10px] font-normal text-ink-muted md:block">
                            {index === 0 && singlePresentation
                              ? 'Revisa la cantidad'
                              : [
                                  isCake ? 'Elige las porciones' : 'Elige el formato',
                                  'Combina tus opciones',
                                  'Indicaciones del pedido',
                                ][index]}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <div key={step} className="cake-step-panel p-5 sm:p-7">
                  <div className="mb-6">
                    <p className="cake-section-eyebrow">
                      Paso {visibleSteps.findIndex((entry) => entry.index === step) + 1} de{' '}
                      {visibleSteps.length}
                    </p>
                    <h2
                      data-cake-step-heading
                      tabIndex={-1}
                      className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-ink outline-none sm:text-2xl"
                    >
                      {step === 0
                        ? singlePresentation
                          ? 'Revisa tu pedido'
                          : isCake
                            ? '¿Para cuántas personas?'
                            : 'Elige tu presentación'
                        : step === 1
                          ? 'Dale tu toque personal'
                          : 'Los últimos detalles'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-ink-muted">
                      {step === 0
                        ? singlePresentation
                          ? 'Esta presentación ya está seleccionada. Ajusta la cantidad antes de continuar.'
                          : isCake
                            ? 'Encuentra el tamaño ideal para compartir.'
                            : 'Revisa el contenido, el precio y la cantidad de presentaciones.'
                        : step === 1
                          ? 'Completa las opciones obligatorias. Los adicionales son opcionales.'
                          : 'Añade tus indicaciones. Elegirás la dirección, fecha y horario al finalizar la compra.'}
                    </p>
                  </div>

                  {step === 0 &&
                    (singlePresentation ? (
                      <section
                        className="cake-quantity-card p-4 sm:p-5"
                        aria-label="Presentación de tu pedido"
                      >
                        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(170px,220px)] sm:items-center sm:gap-6">
                          <div className="min-w-0">
                            <p className="cake-section-eyebrow">Presentación incluida</p>
                            <div className="mt-2 flex items-center gap-3">
                              <span className="cake-size-art shrink-0">
                                <Package className="size-5" strokeWidth={1.5} />
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold text-ink">
                                  {singlePresentation.name}
                                </h3>
                                <p className="mt-0.5 text-sm text-ink-muted">{servingLabel}</p>
                              </div>
                            </div>
                          </div>
                          <div className="min-w-0">{quantityField}</div>
                        </div>
                        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
                          <div>
                            <p className="text-xs text-ink-muted">Precio por presentación</p>
                            <p className="cake-price mt-0.5 text-xl font-semibold text-ink">
                              {formatCurrency(basePrice ?? singlePresentation.basePrice)}
                            </p>
                          </div>
                          <Button
                            onClick={continueToNext}
                            disabled={continueDisabled}
                            className="w-full sm:w-auto"
                          >
                            Continuar <ArrowRight className="ml-2 size-4" />
                          </Button>
                        </div>
                      </section>
                    ) : (
                      <>
                        <CakeSizeSelector
                          isCake={isCake}
                          variants={allowedVariants.map((variant) => ({
                            ...variant,
                            basePrice:
                              variant.basePrice +
                              (theme?.variantRules.find((rule) => rule.variantId === variant.id)
                                ?.priceDelta ?? 0),
                          }))}
                          variantId={effectiveVariantId}
                          rule={
                            isCake && !theme && profile.saleMode === 'SEMI_CUSTOM'
                              ? customRule
                              : null
                          }
                          sizeGuides={isCake ? customRule?.sizeGuides : undefined}
                          quoteRange={
                            theme?.saleMode === 'CONFIGURED'
                              ? { min: theme.minServings, max: theme.maxServings }
                              : undefined
                          }
                          customSelected={customSelected}
                          customServings={customServings}
                          customValid={customValid}
                          onVariantChange={(id) => {
                            setCustomSelected(false);
                            builder.setVariantId(id);
                          }}
                          onCustomSelect={() => {
                            if (!customRule?.baseVariantId) return;
                            setCustomSelected(true);
                            setCustomServings(customServings || String(customRule.minServings));
                            builder.setVariantId(customRule.baseVariantId);
                          }}
                          onServingsChange={(value) => {
                            if (!customRule?.baseVariantId) return;
                            setCustomServings(value);
                            setCustomSelected(true);
                            builder.setVariantId(customRule.baseVariantId);
                          }}
                          onRequestQuote={requestManualQuote}
                        />
                        <div className="cake-quantity-card mt-5 grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(170px,220px)] sm:items-center sm:gap-6 sm:p-5">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-ink">Tu pedido</h3>
                            <p className="mt-1 text-sm leading-6 text-ink-muted">
                              Cada unidad corresponde a la presentación seleccionada.{' '}
                              {theme?.saleMode === 'CONFIGURED'
                                ? 'Si necesitas otras porciones, solicita una cotización para este diseño.'
                                : isCustom
                                  ? 'En el siguiente paso podrás elegir las opciones y ver sus precios.'
                                  : 'Confirmaremos la disponibilidad y la fecha en el checkout.'}
                            </p>
                          </div>
                          <div className="min-w-0">{quantityField}</div>
                        </div>
                      </>
                    ))}

                  {step === 1 && (
                    <>
                      {builder.isLoading ? (
                        <div
                          role="status"
                          className="flex min-h-40 items-center justify-center gap-2 text-sm text-ink-muted"
                        >
                          <Loader2 className="size-4 animate-spin" /> Cargando tus opciones…
                        </div>
                      ) : builder.loadError ? (
                        <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                          <p>{builder.loadError}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={builder.retryLoad}
                          >
                            Volver a cargar
                          </Button>
                        </div>
                      ) : groups.length ? (
                        <>
                          <div className="mb-4 flex items-center justify-between text-xs">
                            <span className="font-medium text-ink-muted">Tu combinación</span>
                            <span className="font-semibold text-brand-700">
                              {completedGroups} de {requiredGroups.length} obligatorios listos
                            </span>
                          </div>
                          <CakeOptionsPanel
                            builder={builder}
                            activeGroupId={activeGroupId}
                            onGroupChange={changeGroup}
                            priceScale={priceScale}
                          />
                        </>
                      ) : (
                        <p className="rounded-xl bg-surface-muted p-4 text-sm text-ink-muted">
                          Esta torta ya tiene su receta lista. Continúa para añadir indicaciones.
                        </p>
                      )}
                      {visiblePresets.length > 0 && (
                        <CakeInspirationGallery
                          presets={visiblePresets}
                          onApply={(preset) => {
                            builder.applySelections(preset.selections);
                            toast.success(`Combinación «${preset.name}» aplicada`);
                          }}
                        />
                      )}
                    </>
                  )}

                  {step === 2 && (
                    <div className="space-y-6">
                      <p className="rounded-card border border-brand-100 bg-brand-50/50 p-4 text-sm leading-6 text-ink-muted">
                        La dirección, el costo de delivery y la fecha disponible se confirmarán en
                        el checkout antes de pagar.
                      </p>
                      <section className="border-t border-line pt-5">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                          <MessageSquareText className="size-4 text-brand-700" />{' '}
                          {isCake
                            ? 'Describe el diseño que imaginas'
                            : 'Indicaciones para el pedido'}
                        </h3>
                        <p className="mb-4 text-xs leading-5 text-ink-muted">
                          {isCake
                            ? 'Indica la ocasión, el nombre, la edad, los colores y el texto que quieres sobre la torta. Al generar con IA, usaremos esta descripción junto con tu foto y tus sabores.'
                            : 'Agrega cualquier detalle importante para preparar tu pedido.'}
                        </p>
                        {isCake && (
                          <div className="mb-4 grid gap-3">
                            <Input
                              label="Texto exacto sobre la torta"
                              maxLength={150}
                              value={designDetails.inscription}
                              onChange={(event) =>
                                setDesignDetails({
                                  ...designDetails,
                                  inscription: event.target.value,
                                })
                              }
                            />
                            <Input
                              label="Ocasión"
                              maxLength={100}
                              value={designDetails.occasion}
                              onChange={(event) =>
                                setDesignDetails({ ...designDetails, occasion: event.target.value })
                              }
                            />
                            <Input
                              label="Colores y acabado"
                              maxLength={300}
                              value={designDetails.finish}
                              onChange={(event) =>
                                setDesignDetails({ ...designDetails, finish: event.target.value })
                              }
                            />
                          </div>
                        )}
                        <Textarea
                          id="cake-message"
                          label={
                            isCake
                              ? 'Descripción de tu torta (opcional)'
                              : 'Indicaciones (opcional)'
                          }
                          rows={4}
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          maxLength={isCake ? 500 : 255}
                          placeholder={
                            isCake
                              ? 'Ej. Cumpleaños de Pepe, 15 años. Escribir «Feliz cumpleaños, Pepe», añadir velas con el número 15 y detalles dorados.'
                              : 'Ej. Empacar las unidades por separado'
                          }
                          hint={`${message.length}/${isCake ? 500 : 255} caracteres${isCake ? ' · Después de editar, pulsa Generar o Actualizar propuesta con IA.' : ''}`}
                        />
                        {isCake && (
                          <div className="mt-5">
                            <h4 className="mb-2 text-sm font-semibold text-ink">
                              Imagen de referencia{' '}
                              <span className="font-normal text-ink-muted">(opcional)</span>
                            </h4>
                            <p className="mb-3 text-xs leading-5 text-ink-muted">
                              Sube una foto de la torta que imaginas. La IA conservará su estilo y
                              aplicará tu descripción, tus sabores y tu relleno. La vista 3D es
                              opcional.
                            </p>
                            <CakeReferenceUpload
                              file={referenceFile}
                              existingDataUrl={referenceDataUrl}
                              onChange={selectReference}
                              disabled={referenceBusy}
                            />
                            {referenceBusy && (
                              <p role="status" className="mt-2 text-xs text-ink-muted">
                                Preparando imagen…
                              </p>
                            )}
                            {referenceError && (
                              <p role="alert" className="mt-2 text-xs text-red-700">
                                {referenceError}
                              </p>
                            )}
                          </div>
                        )}
                      </section>
                    </div>
                  )}

                  {error && (
                    <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                      {error}
                    </p>
                  )}
                  {!(step === 0 && singlePresentation) && (
                    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                      {step > 0 ? (
                        <button
                          type="button"
                          onClick={() => goToStep(isCustom ? step - 1 : 0)}
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand-700"
                        >
                          <ArrowLeft className="size-4" /> Volver
                        </button>
                      ) : (
                        <span className="text-[11px] text-ink-muted">
                          Puedes cambiarlo en el siguiente paso.
                        </span>
                      )}
                      {step !== 1 && (
                        <Button onClick={continueToNext} disabled={continueDisabled}>
                          {step === 0
                            ? isCustom
                              ? 'Continuar con los sabores'
                              : 'Continuar'
                            : continueLabel}
                          {step === 2 && canAdd ? (
                            <ShoppingBag className="ml-2 size-4" />
                          ) : (
                            <ArrowRight className="ml-2 size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {isCake && profile.saleMode === 'SEMI_CUSTOM' && !specialRequest && !theme && !repeat.value && (
              <section className="cake-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7" aria-labelledby="special-cake-request-title">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
                    <MessageSquareText className="size-5" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="special-cake-request-title" className="text-base font-semibold leading-6 text-ink">
                      ¿Necesitas una torta fuera de estas opciones?
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-ink-muted">
                      Solicita un diseño especial para otra forma, tamaño o acabado.
                    </p>
                  </div>
                </div>
                <Button
                  component={Link}
                  to={`${ROUTES.cake(product.slug)}?solicitud=especial`}
                  variant="outline"
                  className="w-full shrink-0 sm:w-auto"
                  endIcon={<ArrowRight className="size-4" />}
                >
                  Solicitar diseño especial
                </Button>
              </section>
            )}

            {(specialRequest || manualQuoteOpen || Boolean(repeat.value) || (isCake && profile.saleMode === 'SEMI_CUSTOM' && theme?.saleMode === 'QUOTE')) && (
              <CakeFreeformRequest
                key={repeat.value?.request.id ?? 'new'}
                prefill={repeat.value}
                theme={theme}
                alwaysOpen={specialRequest || theme?.saleMode === 'QUOTE' || Boolean(repeat.value)}
                product={product}
                dedicated={specialRequest}
                slots={slots}
                branchId={branchId}
                deliveryType={deliveryType}
                deliveryLabel={deliveryLabel}
                slotsLoading={slotsLoading}
                slotsError={slotsError}
                minLeadHours={profile.minLeadHours}
                onChooseBranch={openLocationModal}
                authenticated={authenticated}
                onLogin={() =>
                  navigate(ROUTES.login, {
                    state: { from: `${ROUTES.cake(product.slug)}${location.search}` },
                  })
                }
                isOpen={manualQuoteOpen}
                onOpenChange={setManualQuoteOpen}
                initialServings={
                  manualQuoteServings ??
                  (theme
                    ? Math.max(theme.minServings, Number(selectedVariant?.servingSize) || 0)
                    : undefined)
                }
              />
            )}
          </div>

          {manualQuoteOpen ? (
            <CakeQuoteSummary
              productName={theme?.name ?? product.name}
              productImage={theme?.imageUrls[0] ?? product.imageUrl}
              onReturn={() => {
                if (specialRequest)
                  navigate(ROUTES.cake(product.slug), { replace: true, state: { customCakeEntry: true } });
                else if (theme?.saleMode === 'QUOTE')
                  navigate(ROUTES.cake(product.slug), { state: { customCakeEntry: true } });
                else {
                  setManualQuoteOpen(false);
                  goToStep(step);
                }
              }}
            />
          ) : (
            <CakeBuilderSummary
              isCake={isCake}
              quantity={quantity}
              servingUnit={selectedVariant?.servingUnit ?? 'unidades'}
              hasSinglePresentation={Boolean(singlePresentation)}
              productName={theme?.name ?? product.name}
              productImage={theme?.imageUrls[0] ?? product.imageUrl}
              sizeLabel={sizeLabel}
              servings={servings}
              groups={summaryGroups}
              visual={
                isCake && isCustom
                  ? {
                      flavor: visualFlavor,
                      filling: visualFilling,
                      addons: visualAddons,
                      description: message,
                      referenceDataUrl,
                      generatedDataUrl: preview.generatedDataUrl,
                      generating: preview.generating,
                      canGenerate: preview.canGenerate,
                      generationError: preview.generationError,
                      phase: preview.phase,
                      finishingPrevious: preview.finishingPrevious,
                      proposalOutdated: preview.proposalOutdated,
                      onGenerate: preview.generate,
                    }
                  : undefined
              }
              threeD={threeD}
              threeDOpen={threeDOpen}
              onThreeDOpenChange={setThreeDOpen}
              possibleAllergens={[
                ...new Set([
                  ...product.allergens.map((allergen) => allergen.name),
                  ...(theme?.allergenNames ?? []),
                  ...groups.flatMap((group) =>
                    group.options
                      .filter((option) =>
                        (builder.selections ?? []).some(
                          (selection) => selection.optionId === option.id,
                        ),
                      )
                      .flatMap((option) => option.allergens)
                      .map(allergenLabel),
                  ),
                ]),
              ]}
              quote={validatedQuote}
              pricePreview={pricePreview}
              isQuoting={builder.isQuoting}
              validationMessage={builder.validationMessage}
              selectedSlot={null}
              readyToAdd={canAdd}
              finalStep={step === 2}
              personalizing={step === 1}
              mobileExpanded={summaryExpanded}
              onToggleMobile={() => setSummaryExpanded((current) => !current)}
              deliveryType={deliveryType}
              continueLabel={continueLabel}
              continueDisabled={continueDisabled}
              onAddToCart={addToCart}
              onReset={reset}
              onContinue={continueToNext}
              onEditSize={() => goToStep(0)}
              onEditGroup={editGroup}
            />
          )}
        </div>
      )}

      {!isAdvanced && !manualQuoteOpen && (
        <div
          data-cake-mobile-actions
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-e3 backdrop-blur lg:hidden"
        >
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={showSummary}
              aria-label={isCake ? 'Ver el detalle de tu torta' : 'Ver el detalle de tu pedido'}
              className="min-w-0 text-left"
            >
              <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                {validatedQuote ? 'Total de tu pedido' : 'Precio actual'}
                <ChevronUp className="size-3" />
              </span>
              <span className="cake-price mt-0.5 block text-xl font-semibold text-ink">
                {validatedQuote
                  ? formatCurrency(validatedQuote.lineTotal)
                  : pricePreview
                    ? formatCurrency(pricePreview.lineTotal)
                    : 'Por calcular'}
              </span>
            </button>
            <Button
              size="sm"
              sx={{ whiteSpace: 'normal', maxWidth: '65%' }}
              aria-label={continueLabel}
              disabled={continueDisabled || builder.isQuoting}
              onClick={continueToNext}
            >
              {mobileContinueLabel}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CakePage;
