import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Loader2,
  RotateCcw,
  Save,
  WifiOff,
  RefreshCw,
  BookmarkCheck,
  Trash2,
  ShieldCheck,
  Sparkles,
  Lightbulb,
  ShieldAlert,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { CardDescription } from '@components/ui/Card';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem } from '@features/cart/cartSlice';
import { NutritionPanel } from '@features/catalog/components/NutritionPanel';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { useBowlBuilder } from '../hooks/useBowlBuilder';
import { GroupStep } from '../components/GroupStep';
import { BowlPreview } from '../components/BowlPreview';
import { builderApi } from '../services/builder.service';
import type { BuilderOption, SavedBowl } from '../types';
import { getApiErrorMessage } from '@services/api/client';
import { accountApi, type FoodPreferences } from '@features/account/services/account.service';

const EMPTY_PREFERENCES: FoodPreferences = { allergens: [], dietaryTags: [], dislikedOptionIds: [], calorieTarget: null, proteinTarget: null };

const exportBowlCard = async (name: string, options: Array<BuilderOption & { quantity: number }>, total: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no permite crear la imagen');
  const gradient = context.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#eaf7ef');
  gradient.addColorStop(1, '#fff6e5');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = '#174f35';
  context.font = '700 34px Arial';
  context.fillText('VERDE BOWL', 70, 90);
  context.font = '900 68px Arial';
  context.fillText(name, 70, 175);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(540, 540, 330, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#c9e6d4';
  context.lineWidth = 28;
  context.stroke();
  const visible = options.slice(0, 10);
  await Promise.all(visible.map(async (option, index) => {
    if (!option.imageUrl) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = option.imageUrl;
    try { await image.decode(); } catch { return; }
    const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2;
    const radius = visible.length > 6 ? 205 : 165;
    const x = 540 + Math.cos(angle) * radius;
    const y = 540 + Math.sin(angle) * radius;
    const size = visible.length > 6 ? 150 : 190;
    context.save();
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, x - size / 2, y - size / 2, size, size);
    context.restore();
  }));
  context.fillStyle = '#14201a';
  context.font = '700 30px Arial';
  context.fillText(options.slice(0, 6).map((option) => option.name).join(' · ').slice(0, 62), 70, 950);
  context.fillStyle = '#1c6243';
  context.font = '900 42px Arial';
  context.fillText(formatCurrency(total), 70, 1010);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No pudimos crear la imagen');
  const file = new File([blob], 'mi-verde-bowl.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Mi Verde Bowl', text: 'Este es el bowl que armé', files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** Constructor guiado: las selecciones se recotizan siempre en el backend. */
const BuilderPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { branchId } = useAppState();
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [savedBowls, setSavedBowls] = useState<SavedBowl[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('Mi bowl favorito');
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const sessionId = useRef(sessionStorage.getItem('verde-bowl:builder-session') ?? crypto.randomUUID());
  const viewedProduct = useRef<number | null>(null);
  const started = useRef(false);
  const completed = useRef(false);
  const addedToCart = useRef(false);
  const incomingApplied = useRef(false);
  const selectionCount = useRef(0);

  useEffect(() => { sessionStorage.setItem('verde-bowl:builder-session', sessionId.current); }, []);

  const {
    config,
    variant,
    variantId,
    setVariantId,
    selections,
    toggleOption,
    changeQuantity,
    resolveConflict,
    applySelections,
    unitsInGroup,
    quote,
    validationMessage,
    missingGroups,
    isComplete,
    isLoading,
    isQuoting,
    loadError,
    isOnline,
    retryQuote,
    retryLoad,
    reset,
    restoredNotice,
  } = useBowlBuilder(branchId);

  useEffect(() => {
    if (!isAuthenticated) return;
    builderApi.savedBowls().then(setSavedBowls).catch(() => setSavedBowls([]));
    accountApi.getFoodPreferences().then(setPreferences).catch(() => setPreferences(EMPTY_PREFERENCES));
  }, [isAuthenticated]);

  useEffect(() => {
    if (config && activeGroupId === null) setActiveGroupId(config.groups[0]?.id ?? null);
  }, [config, activeGroupId]);

  useEffect(() => {
    if (!config || viewedProduct.current === config.product.id) return;
    viewedProduct.current = config.product.id;
    void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'VIEW' });
  }, [config]);

  useEffect(() => {
    const incoming = (location.state as { savedBowl?: SavedBowl } | null)?.savedBowl;
    if (!config || !incoming || incomingApplied.current) return;
    incomingApplied.current = true;
    applySelections(incoming.selections, incoming.variantId);
    toast.success(`${incoming.name} cargado para personalizar`);
    navigate(location.pathname, { replace: true, state: null });
  }, [config, location.pathname, location.state, applySelections, navigate]);

  useEffect(() => {
    if (!config || !isComplete || completed.current) return;
    completed.current = true;
    void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'COMPLETE', metadata: { total: quote?.lineTotal ?? 0 } });
  }, [config, isComplete, quote?.lineTotal]);

  useEffect(() => {
    if (!config || !validationMessage || missingGroups.length > 0 || !isOnline) return;
    void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'QUOTE_ERROR', metadata: { message: validationMessage.slice(0, 180) } });
  }, [config, validationMessage, missingGroups.length, isOnline]);

  useEffect(() => { selectionCount.current = selections.length; }, [selections.length]);

  useEffect(() => {
    if (!config) return undefined;
    const reportAbandonment = () => {
      if (addedToCart.current || !started.current) return;
      const endpoint = `${import.meta.env.VITE_API_URL || '/api/v1'}/customizations/events`;
      const payload = JSON.stringify({ sessionId: sessionId.current, productId: config.product.id, eventType: 'ABANDON', metadata: { selections: selectionCount.current } });
      navigator.sendBeacon?.(endpoint, new Blob([payload], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', reportAbandonment);
    return () => window.removeEventListener('pagehide', reportAbandonment);
  }, [config]);

  if (isLoading) return <PageLoader />;

  if (loadError || !config) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto size-10 text-red-500" />
        <h1 className="mt-4 text-2xl font-black text-ink">No pudimos abrir el constructor</h1>
        <p className="mx-auto mt-2 max-w-lg text-ink-muted">{loadError ?? 'No se pudo cargar el constructor'}</p>
        <Button className="mt-5" onClick={retryLoad}><RefreshCw className="size-4" /> Intentar de nuevo</Button>
      </div>
    );
  }

  const selectedIds = selections.map((selection) => selection.optionId);
  const selectedOptionNames = Object.fromEntries(
    config.groups.flatMap((group) => group.options.map((option) => [option.id, option.name])),
  );
  const requiredGroups = config.groups.filter((group) => group.minSelection > 0);
  const completedGroups = requiredGroups.filter(
    (group) => unitsInGroup(group) >= group.minSelection,
  ).length;
  const progress = requiredGroups.length ? (completedGroups / requiredGroups.length) * 100 : 100;
  const selectedVisualOptions = config.groups.flatMap((group) => group.options)
    .flatMap((option) => {
      const selection = selections.find((entry) => entry.optionId === option.id);
      return selection ? [{ ...option, quantity: selection.quantity }] : [];
    });
  const selectedAllergens = [...new Set(selectedVisualOptions.flatMap((option) => option.allergens))];
  const preferenceConflicts = selectedAllergens.filter((code) => preferences.allergens.includes(code));
  const liveNutrition = quote?.nutrition ?? selectedVisualOptions.reduce(
    (total, option) => ({
      calories: total.calories + option.nutrition.calories * option.quantity,
      protein: total.protein + option.nutrition.protein * option.quantity,
      carbs: total.carbs + option.nutrition.carbs * option.quantity,
      fat: total.fat + option.nutrition.fat * option.quantity,
    }),
    { ...(variant?.nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }) },
  );
  const recommendation = (() => {
    if (quote && quote.extrasTotal >= 8) {
      const expensive = [...quote.selections].filter((line) => line.lineExtra > 0).sort((a, b) => b.lineExtra - a.lineExtra)[0];
      if (expensive) {
        const entry = config.groups.flatMap((group) => group.options.map((option) => ({ group, option }))).find(({ option }) => option.id === expensive.optionId);
        if (entry) return { title: 'Hazlo más económico', description: `Retira ${entry.option.name} y ahorra ${formatCurrency(expensive.lineExtra)}.`, action: 'remove' as const, ...entry };
      }
    }
    if (liveNutrition.protein < 25) {
      const selectedSet = new Set(selectedIds);
      const candidate = config.groups
        .flatMap((group) => group.options.map((option) => ({ group, option })))
        .filter(({ option }) => option.isAvailable && !selectedSet.has(option.id) && option.nutrition.protein >= 8)
        .filter(({ option }) => !preferences.dislikedOptionIds.includes(option.id))
        .filter(({ option }) => !option.allergens.some((code) => preferences.allergens.includes(code)))
        .filter(({ option }) => !option.incompatibleWith.some((id) => selectedSet.has(id)))
        .sort((a, b) => b.option.nutrition.protein - a.option.nutrition.protein)[0];
      if (candidate) return { title: 'Súmale proteína', description: `${candidate.option.name} aporta ${Math.round(candidate.option.nutrition.protein)} g adicionales.`, action: 'add' as const, ...candidate };
    }
    return null;
  })();

  const handleToggle = (groupIndex: number, option: BuilderOption) => {
    const group = config.groups[groupIndex];
    const wasSelected = selectedIds.includes(option.id);
    const completesStep = !wasSelected && unitsInGroup(group) + 1 >= group.minSelection;
    toggleOption(group, option.id);
    if (!started.current) {
      started.current = true;
      void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'START' });
    }
    if (!wasSelected) void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'OPTION_SELECT', groupId: group.id, optionId: option.id });
    if (completesStep) {
      const next = config.groups[groupIndex + 1];
      if (next) {
        setActiveGroupId(next.id);
        window.setTimeout(() => document.getElementById(`builder-group-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
      }
    }
  };

  const saveCurrentBowl = async () => {
    if (!variantId || !isComplete || !saveName.trim()) return;
    setSaving(true);
    try {
      await builderApi.saveBowl({ name: saveName.trim(), productId: config.product.id, variantId, selections });
      void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'SAVE_BOWL' });
      setSavedBowls(await builderApi.savedBowls());
      setSaveOpen(false);
      toast.success('Bowl guardado en tus favoritos');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCart = () => {
    if (!quote || !variant) return;

    addedToCart.current = true;
    void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'ADD_TO_CART', metadata: { total: quote.lineTotal, extras: quote.extrasTotal } });
    dispatch(
      addItem({
        id: crypto.randomUUID(),
        productId: quote.productId,
        variantId: quote.variantId,
        name: config.product.name,
        variantName: quote.description,
        imageUrl: config.product.imageUrl,
        quantity: 1,
        unitPrice: quote.basePrice,
        extrasTotal: quote.extrasTotal,
        lineTotal: quote.lineTotal,
        selections: quote.selections.map((line) => ({
          groupId: line.groupId,
          groupName: line.groupName,
          optionId: line.optionId,
          optionName: line.optionName,
          quantity: line.quantity,
          priceDelta: line.priceDelta,
        })),
        nutrition: quote.nutrition,
      }),
    );

    toast.success('Tu bowl está listo y ya está en el carrito');
    reset();
    navigate(ROUTES.cart);
  };

  return (
    <div className="pb-28 xl:pb-16">
      <section className="border-b border-line bg-[linear-gradient(135deg,#f4fbf7_0%,#fffaf0_100%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-9 lg:grid-cols-[1fr_470px] lg:py-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-brand-700 shadow-sm ring-1 ring-brand-100">
              <Sparkles className="size-3.5" /> Hecho a tu manera
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-ink sm:text-5xl">
              Tu bowl perfecto,
              <span className="block text-brand-700">ingrediente por ingrediente.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Elige tu tamaño, combina sabores y revisa el precio y la nutrición en tiempo real.
              Nosotros validamos cada combinación antes de agregarla al carrito.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-brand-600" /> Ingredientes frescos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-brand-600" /> Precio transparente
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-brand-600" /> Combinaciones validadas
              </span>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute -inset-4 rotate-3 rounded-[36px] bg-brand-200/45" />
            <img
              src={config.product.imageUrl ?? '/images/builder/bowl-signature.jpg'}
              alt={config.product.imageAlt ?? 'Bowl fresco personalizable'}
              width={940}
              height={705}
              fetchPriority="high"
              className="relative aspect-[4/3] w-full rounded-[30px] object-cover shadow-[0_24px_70px_rgba(24,79,51,0.2)]"
              style={{ objectPosition: config.product.imagePosition }}
            />
            <div className="absolute -bottom-4 -left-5 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-black/5">
              <p className="text-xs text-ink-muted">Desde</p>
              <p className="text-xl font-black text-brand-700">
                {formatCurrency(Math.min(...config.variants.map((entry) => entry.basePrice)))}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-20 border-b border-line bg-white/95 shadow-sm backdrop-blur md:top-[72px]">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">Tu progreso</span>
            <span className="text-ink-muted">
              {completedGroups} de {requiredGroups.length} pasos esenciales
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Pasos del constructor">
            {config.groups.map((group, index) => {
              const done =
                group.minSelection === 0
                  ? unitsInGroup(group) > 0
                  : unitsInGroup(group) >= group.minSelection;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`builder-group-${group.id}`)
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    done
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-surface-muted text-ink-muted hover:text-ink',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : <span>{index + 1}</span>}
                  {group.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {restoredNotice && (
          <div role="status" className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {restoredNotice}
          </div>
        )}
        {isAuthenticated && (preferences.allergens.length > 0 || preferences.dietaryTags.length > 0) && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm">
            <div>
              <strong className="text-brand-800">Personalizado para ti.</strong>{' '}
              <span className="text-ink-muted">Evitamos recomendaciones con tus alergenos y respetamos tus metas guardadas.</span>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-700 shadow-sm">Perfil alimentario activo</span>
          </div>
        )}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(25,70,48,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
                    Antes de empezar
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-ink">Elige el tamaño de tu bowl</h2>
                </div>
                {isQuoting && (
                  <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                    <Loader2 className="size-4 animate-spin" /> Actualizando
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {config.variants.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setVariantId(entry.id)}
                    className={cn(
                      'flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition-all',
                      entry.id === variantId
                        ? 'border-brand-600 bg-brand-50 shadow-sm ring-1 ring-brand-600'
                        : 'border-line hover:border-brand-300 hover:bg-surface-muted/40',
                    )}
                  >
                    <span>
                      <span className="block font-bold text-ink">{entry.name}</span>
                      <span className="text-xs text-ink-muted">
                        Desde {Math.round(entry.nutrition.calories)} kcal
                      </span>
                    </span>
                    <span className="text-base font-black text-brand-700">
                      {formatCurrency(entry.basePrice)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {(config.presets?.length > 0 || savedBowls.length > 0) && (
              <section className="rounded-[24px] border border-line bg-white p-5 shadow-[0_12px_36px_rgba(25,70,48,0.06)]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">Empieza más rápido</p>
                    <h2 className="mt-1 text-xl font-bold text-ink">Combinaciones recomendadas</h2>
                  </div>
                  <span className="text-xs text-ink-muted">Puedes personalizarlas después</span>
                </div>
                <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
                  {savedBowls.map((bowl) => (
                    <div key={`saved-${bowl.id}`} className="group relative w-52 shrink-0 snap-start overflow-hidden rounded-2xl border border-brand-200 bg-brand-50/40">
                      <button type="button" onClick={() => { applySelections(bowl.selections, bowl.variantId); void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'PRESET_APPLY', metadata: { source: 'saved-bowl', savedBowlId: bowl.id } }); }} className="w-full p-3 text-left">
                        <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-brand-700"><BookmarkCheck className="size-3" /> Tu favorito</span>
                        <span className="block font-bold text-ink">{bowl.name}</span>
                        <span className="mt-1 block text-xs text-ink-muted">{bowl.selections.length} ingredientes · volver a pedir</span>
                      </button>
                      <button type="button" aria-label={`Eliminar ${bowl.name}`} onClick={() => void builderApi.deleteSavedBowl(bowl.id).then(() => setSavedBowls((current) => current.filter((item) => item.id !== bowl.id))).catch((error) => toast.error(getApiErrorMessage(error)))} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-ink-muted opacity-0 shadow-sm transition hover:text-red-600 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  {(config.presets ?? []).map((preset) => (
                    <button key={preset.id} type="button" onClick={() => { applySelections(preset.selections); void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'PRESET_APPLY', presetId: preset.id }); toast.success(`${preset.name} aplicado`); }} className="relative w-60 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface-muted text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg">
                      {preset.imageUrl && <img src={preset.imageUrl} alt="" width={480} height={192} className="h-24 w-full object-cover" loading="lazy" />}
                      <span className="block p-3">
                        {preset.badge && <span className="mb-1 inline-flex rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-bold text-accent-700">{preset.badge}</span>}
                        <span className="block font-bold text-ink">{preset.name}</span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-ink-muted">{preset.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {config.groups.map((group, index) => (
              <GroupStep
                key={group.id}
                group={group}
                index={index + 1}
                selectedIds={selectedIds}
                unitsUsed={unitsInGroup(group)}
                quoteLines={quote?.selections ?? []}
                onToggle={(option) => handleToggle(index, option)}
                onQuantityChange={(option, delta) => changeQuantity(group, option.id, delta)}
                onResolveConflict={(option) => {
                  resolveConflict(group, option.id);
                  void builderApi.trackEvent({ sessionId: sessionId.current, productId: config.product.id, eventType: 'CONFLICT_RESOLVE', groupId: group.id, optionId: option.id });
                  toast.success(`${option.name} reemplazó la opción incompatible`);
                }}
                selectedOptionNames={selectedOptionNames}
                isCollapsed={activeGroupId !== group.id}
                onExpand={() => setActiveGroupId(group.id)}
              />
            ))}
          </div>

          <aside className="xl:sticky xl:top-44 xl:h-fit">
            <div className="overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_18px_55px_rgba(25,70,48,0.12)]">
              <div className="border-b border-line bg-[linear-gradient(135deg,#edf9f2,#fff)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
                      Resumen
                    </p>
                    <h2 className="mt-1 text-xl font-black text-ink">Tu bowl</h2>
                  </div>
                  <div className="flex items-center gap-2">
                  {selectedVisualOptions.length > 0 && (
                    <button type="button" aria-label="Compartir o descargar mi bowl" title="Compartir mi bowl" onClick={() => void exportBowlCard(config.product.name, selectedVisualOptions, quote?.lineTotal ?? variant?.basePrice ?? 0).catch((error) => { if ((error as Error)?.name !== 'AbortError') toast.error(getApiErrorMessage(error)); })} className="flex size-9 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm transition hover:-translate-y-0.5">
                      <Download className="size-4" />
                    </button>
                  )}
                  {isQuoting ? (
                    <Loader2 className="size-5 animate-spin text-brand-600" />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
                      <Sparkles className="size-4" />
                    </span>
                  )}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-5 rounded-2xl bg-[linear-gradient(145deg,#f4fbf7,#fff8ec)] p-3 ring-1 ring-brand-100">
                  <BowlPreview options={selectedVisualOptions} isUpdating={isQuoting} />
                </div>

                {recommendation && (
                  <div className="mb-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-black text-brand-800"><Lightbulb className="size-4" /> {recommendation.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{recommendation.description}</p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-bold text-brand-700 underline underline-offset-2"
                      onClick={() => recommendation.action === 'remove'
                        ? toggleOption(recommendation.group, recommendation.option.id)
                        : handleToggle(config.groups.findIndex((group) => group.id === recommendation.group.id), recommendation.option)}
                    >
                      {recommendation.action === 'remove' ? 'Aplicar ahorro' : `Agregar ${recommendation.option.name}`}
                    </button>
                  </div>
                )}

                {quote?.selections.length ? (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {config.groups.map((group) => {
                      const lines = quote.selections.filter((line) => line.groupId === group.id);
                      if (!lines.length) return null;
                      return (
                        <div
                          key={group.id}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <span className="text-ink-muted">{group.name}</span>
                          <span className="max-w-[220px] text-right font-medium text-ink">
                            {lines.map((line) => line.optionName).join(', ')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-surface-muted/40 px-4 py-5 text-center text-sm text-ink-muted">
                    Tus ingredientes aparecerán aquí mientras construyes.
                  </div>
                )}

                <div className="mt-5 rounded-2xl bg-surface-muted/55 p-3">
                  <NutritionPanel
                    nutrition={liveNutrition}
                    showGoals
                  />
                </div>

                {(preferences.calorieTarget || preferences.proteinTarget) && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    {preferences.calorieTarget && <span className={cn('rounded-xl px-3 py-2 font-semibold', liveNutrition.calories <= preferences.calorieTarget ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900')}>Meta: ≤ {preferences.calorieTarget} kcal</span>}
                    {preferences.proteinTarget && <span className={cn('rounded-xl px-3 py-2 font-semibold', liveNutrition.protein >= preferences.proteinTarget ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900')}>Meta: ≥ {preferences.proteinTarget} g proteína</span>}
                  </div>
                )}

                {preferenceConflicts.length > 0 && (
                  <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span><strong>Revisa antes de continuar:</strong> seleccionaste ingredientes con {preferenceConflicts.join(', ')}, marcado en tu perfil como alergeno.</span>
                  </p>
                )}

                {selectedAllergens.length > 0 && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span><strong>Alérgenos declarados:</strong> {selectedAllergens.join(', ')}. Si tienes una alergia severa, consulta al local antes de pedir.</span>
                  </p>
                )}

                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between text-ink-muted">
                    <dt>Bowl {variant?.name}</dt>
                    <dd>{formatCurrency(quote?.basePrice ?? variant?.basePrice ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between text-ink-muted">
                    <dt>Extras y suplementos</dt>
                    <dd>{formatCurrency(quote?.extrasTotal ?? 0)}</dd>
                  </div>
                  {quote?.selections.some((line) => line.lineExtra > 0) && (
                    <div className="space-y-1 border-l-2 border-brand-100 pl-3 text-xs text-ink-muted">
                      {quote.selections.filter((line) => line.lineExtra > 0).map((line) => (
                        <div key={line.optionId} className="flex justify-between gap-3">
                          <span>{line.optionName}{line.chargedQuantity > 1 ? ` × ${line.chargedQuantity}` : ''}</span>
                          <span className="font-semibold text-ink">+{formatCurrency(line.lineExtra)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end justify-between border-t border-line pt-3">
                    <dt className="font-bold text-ink">Total</dt>
                    <dd className="text-2xl font-black text-brand-700">
                      {formatCurrency(quote?.lineTotal ?? variant?.basePrice ?? 0)}
                    </dd>
                  </div>
                </dl>

                {missingGroups.length > 0 && (
                  <p aria-live="polite" className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    Completa: {missingGroups.join(', ')}
                  </p>
                )}
                {validationMessage && missingGroups.length === 0 && (
                  <div role="alert" aria-live="assertive" className={cn('mt-4 rounded-xl p-3 text-xs', isOnline ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>
                    <p className="flex items-start gap-2">
                      {isOnline ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <WifiOff className="mt-0.5 size-4 shrink-0" />}
                      {validationMessage}
                    </p>
                    <button type="button" onClick={retryQuote} className="mt-2 inline-flex items-center gap-1 font-bold underline underline-offset-2"><RefreshCw className="size-3" /> Reintentar cotización</button>
                  </div>
                )}

                <Button
                  className="mt-5 w-full"
                  size="lg"
                  disabled={!isComplete}
                  isLoading={isQuoting}
                  onClick={handleAddToCart}
                >
                  {isComplete ? (
                    <span className="inline-flex items-center gap-1">
                      Agregar al carrito <ChevronRight className="size-4" />
                    </span>
                  ) : (
                    'Completa tu bowl'
                  )}
                </Button>
                <Button
                  className="mt-2 w-full"
                  variant="secondary"
                  disabled={!isComplete}
                  onClick={() => isAuthenticated ? setSaveOpen(true) : navigate(`${ROUTES.login}?returnTo=${encodeURIComponent(ROUTES.builder)}`)}
                >
                  <Save className="size-4" /> {isAuthenticated ? 'Guardar este bowl' : 'Inicia sesión para guardarlo'}
                </Button>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1 text-xs text-ink-muted transition-colors hover:text-brand-700"
                >
                  <RotateCcw className="size-3.5" /> Empezar de nuevo
                </button>

                {!branchId && (
                  <CardDescription className="mt-4 rounded-xl bg-surface-muted p-3 text-xs">
                    Elige tu dirección para confirmar la disponibilidad en tu sucursal.
                  </CardDescription>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(20,50,34,.12)] backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-muted">
              {isComplete ? 'Tu bowl está listo' : `Faltan ${missingGroups.length} pasos`}
            </p>
            <p className="truncate text-xl font-black text-brand-700">
              {formatCurrency(quote?.lineTotal ?? variant?.basePrice ?? 0)}
            </p>
          </div>
          <Button
            disabled={!isComplete}
            isLoading={isQuoting}
            onClick={handleAddToCart}
            className="shrink-0"
          >
            {isComplete ? 'Agregar al carrito' : 'Completa tu bowl'}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Guarda tu combinación"
        description="La encontrarás aquí la próxima vez y podrás volver a pedirla con un toque."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <Input label="Nombre de tu bowl" value={saveName} onChange={(event) => setSaveName(event.target.value)} maxLength={80} autoFocus />
          <div className="rounded-xl bg-surface-muted p-3 text-sm text-ink-muted">
            {selections.length} ingredientes · {variant?.name} · {formatCurrency(quote?.lineTotal ?? 0)}
          </div>
          <Button className="w-full" isLoading={saving} disabled={!saveName.trim()} onClick={() => void saveCurrentBowl()}>
            <BookmarkCheck className="size-4" /> Guardar en favoritos
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default BuilderPage;
