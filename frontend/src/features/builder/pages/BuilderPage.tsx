import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { StickyActionBar } from '@components/ui/StickyActionBar';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem } from '@features/cart/cartSlice';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import {
  accountApi,
  type FoodPreferences,
} from '@features/account/services/account.service';
import { BuilderHero } from '../components/BuilderHero';
import { BuilderMobileOverview } from '../components/BuilderMobileOverview';
import { BUILDER_SCROLL_ANCHOR, BuilderProgress } from '../components/BuilderProgress';
import { BuilderStarters } from '../components/BuilderStarters';
import {
  BuilderSummary,
  type BuilderRecommendation,
} from '../components/BuilderSummary';
import { GroupStep } from '../components/GroupStep';
import { SaveBowlModal } from '../components/SaveBowlModal';
import { VariantSelector } from '../components/VariantSelector';
import { useBowlBuilder } from '../hooks/useBowlBuilder';
import { builderApi } from '../services/builder.service';
import type { BuilderOption, SavedBowl } from '../types';
import { exportBowlCard } from '../utils/exportBowlCard';

const EMPTY_PREFERENCES: FoodPreferences = {
  allergens: [],
  dietaryTags: [],
  dislikedOptionIds: [],
  calorieTarget: null,
  proteinTarget: null,
};

/** Constructor guiado: la UI orienta; el backend valida precio, nutrición y reglas. */
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
  const [preferences, setPreferences] =
    useState<FoodPreferences>(EMPTY_PREFERENCES);
  const sessionId = useRef(
    sessionStorage.getItem('verde-bowl:builder-session') ?? crypto.randomUUID(),
  );
  const viewedProduct = useRef<number | null>(null);
  const started = useRef(false);
  const completed = useRef(false);
  const addedToCart = useRef(false);
  const incomingApplied = useRef(false);
  const selectionCount = useRef(0);

  useEffect(() => {
    sessionStorage.setItem('verde-bowl:builder-session', sessionId.current);
  }, []);

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
    accountApi
      .getFoodPreferences()
      .then(setPreferences)
      .catch(() => setPreferences(EMPTY_PREFERENCES));
  }, [isAuthenticated]);

  useEffect(() => {
    if (config && activeGroupId === null) {
      setActiveGroupId(config.groups[0]?.id ?? null);
    }
  }, [config, activeGroupId]);

  useEffect(() => {
    if (!config || viewedProduct.current === config.product.id) return;
    viewedProduct.current = config.product.id;
    void builderApi.trackEvent({
      sessionId: sessionId.current,
      productId: config.product.id,
      eventType: 'VIEW',
    });
  }, [config]);

  useEffect(() => {
    const incoming = (location.state as { savedBowl?: SavedBowl } | null)?.savedBowl;
    if (!config || !incoming || incomingApplied.current) return;
    incomingApplied.current = true;
    applySelections(incoming.selections, incoming.variantId);
    toast.success(`${incoming.name} cargado para personalizar`);
    navigate(location.pathname, { replace: true, state: null });
  }, [
    config,
    location.pathname,
    location.state,
    applySelections,
    navigate,
  ]);

  useEffect(() => {
    if (!config || !isComplete || completed.current) return;
    completed.current = true;
    void builderApi.trackEvent({
      sessionId: sessionId.current,
      productId: config.product.id,
      eventType: 'COMPLETE',
      metadata: { total: quote?.lineTotal ?? 0 },
    });
  }, [config, isComplete, quote?.lineTotal]);

  useEffect(() => {
    if (
      !config ||
      !validationMessage ||
      missingGroups.length > 0 ||
      !isOnline
    ) {
      return;
    }
    void builderApi.trackEvent({
      sessionId: sessionId.current,
      productId: config.product.id,
      eventType: 'QUOTE_ERROR',
      metadata: { message: validationMessage.slice(0, 180) },
    });
  }, [
    config,
    validationMessage,
    missingGroups.length,
    isOnline,
  ]);

  useEffect(() => {
    selectionCount.current = selections.length;
  }, [selections.length]);

  useEffect(() => {
    if (!config) return undefined;
    const reportAbandonment = () => {
      if (addedToCart.current || !started.current) return;
      const endpoint = `${import.meta.env.VITE_API_URL || '/api/v1'}/customizations/events`;
      const payload = JSON.stringify({
        sessionId: sessionId.current,
        productId: config.product.id,
        eventType: 'ABANDON',
        metadata: { selections: selectionCount.current },
      });
      navigator.sendBeacon?.(
        endpoint,
        new Blob([payload], { type: 'application/json' }),
      );
    };
    window.addEventListener('pagehide', reportAbandonment);
    return () => window.removeEventListener('pagehide', reportAbandonment);
  }, [config]);

  if (isLoading) return <PageLoader />;

  if (loadError || !config) {
    return (
      <section className="bg-surface-muted px-4 py-20">
        <div className="mx-auto grid max-w-xl justify-items-center gap-4 rounded-card border border-line bg-white p-8 text-center shadow-e2 sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-card bg-red-50 text-red-600">
            <AlertCircle className="size-7" />
          </span>
          <h1 className="text-2xl font-black text-ink">
            No pudimos abrir el constructor
          </h1>
          <p className="mx-auto max-w-lg leading-7 text-ink-muted">
            {loadError ?? 'No se pudo cargar el constructor'}
          </p>
          <Button onClick={retryLoad} leftIcon={<RefreshCw className="size-4" />}>
            Intentar de nuevo
          </Button>
        </div>
      </section>
    );
  }

  const selectedIds = selections.map((selection) => selection.optionId);
  const selectedOptionNames = Object.fromEntries(
    config.groups.flatMap((group) =>
      group.options.map((option) => [option.id, option.name]),
    ),
  );
  const requiredGroups = config.groups.filter(
    (group) => group.minSelection > 0,
  );
  const completedGroups = requiredGroups.filter(
    (group) => unitsInGroup(group) >= group.minSelection,
  ).length;
  const progress = requiredGroups.length
    ? (completedGroups / requiredGroups.length) * 100
    : 100;
  const selectedVisualOptions = config.groups
    .flatMap((group) => group.options)
    .flatMap((option) => {
      const selection = selections.find(
        (entry) => entry.optionId === option.id,
      );
      return selection
        ? [{ ...option, quantity: selection.quantity }]
        : [];
    });
  const selectedAllergens = [
    ...new Set(
      selectedVisualOptions.flatMap((option) => option.allergens),
    ),
  ];
  const preferenceConflicts = selectedAllergens.filter((code) =>
    preferences.allergens.includes(code),
  );
  const liveNutrition =
    quote?.nutrition ??
    selectedVisualOptions.reduce(
      (total, option) => ({
        calories:
          total.calories + option.nutrition.calories * option.quantity,
        protein:
          total.protein + option.nutrition.protein * option.quantity,
        carbs: total.carbs + option.nutrition.carbs * option.quantity,
        fat: total.fat + option.nutrition.fat * option.quantity,
      }),
      {
        ...(variant?.nutrition ?? {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        }),
      },
    );

  const recommendation: BuilderRecommendation | null = (() => {
    if (quote && quote.extrasTotal >= 8) {
      const expensive = [...quote.selections]
        .filter((line) => line.lineExtra > 0)
        .sort((a, b) => b.lineExtra - a.lineExtra)[0];
      if (expensive) {
        const entry = config.groups
          .flatMap((group) =>
            group.options.map((option) => ({ group, option })),
          )
          .find(({ option }) => option.id === expensive.optionId);
        if (entry) {
          return {
            title: 'Hazlo más económico',
            description: `Retira ${entry.option.name} y ahorra ${formatCurrency(expensive.lineExtra)}.`,
            action: 'remove',
            ...entry,
          };
        }
      }
    }

    if (liveNutrition.protein < 25) {
      const selectedSet = new Set(selectedIds);
      const candidate = config.groups
        .flatMap((group) =>
          group.options.map((option) => ({ group, option })),
        )
        .filter(
          ({ option }) =>
            option.isAvailable &&
            !selectedSet.has(option.id) &&
            option.nutrition.protein >= 8,
        )
        .filter(
          ({ option }) =>
            !preferences.dislikedOptionIds.includes(option.id),
        )
        .filter(
          ({ option }) =>
            !option.allergens.some((code) =>
              preferences.allergens.includes(code),
            ),
        )
        .filter(
          ({ option }) =>
            !option.incompatibleWith.some((id) => selectedSet.has(id)),
        )
        .sort(
          (a, b) =>
            b.option.nutrition.protein -
            a.option.nutrition.protein,
        )[0];
      if (candidate) {
        return {
          title: 'Súmale proteína',
          description: `${candidate.option.name} aporta ${Math.round(candidate.option.nutrition.protein)} g adicionales.`,
          action: 'add',
          ...candidate,
        };
      }
    }
    return null;
  })();

  const openGroup = (groupId: number, shouldScroll = true) => {
    setActiveGroupId(groupId);
    if (!shouldScroll) return;
    requestAnimationFrame(() =>
      document
        .getElementById(`builder-group-${groupId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const nextMissingGroup =
    config.groups.find(
      (group) =>
        group.minSelection > 0 &&
        unitsInGroup(group) < group.minSelection,
    ) ?? null;

  const handleToggle = (
    groupIndex: number,
    option: BuilderOption,
  ) => {
    const group = config.groups[groupIndex];
    const wasSelected = selectedIds.includes(option.id);
    toggleOption(group, option.id);

    if (!started.current) {
      started.current = true;
      void builderApi.trackEvent({
        sessionId: sessionId.current,
        productId: config.product.id,
        eventType: 'START',
      });
    }
    if (!wasSelected) {
      void builderApi.trackEvent({
        sessionId: sessionId.current,
        productId: config.product.id,
        eventType: 'OPTION_SELECT',
        groupId: group.id,
        optionId: option.id,
      });
    }
  };

  const handleReset = () => {
    reset();
    openGroup(config.groups[0]?.id ?? 0);
  };

  const saveCurrentBowl = async () => {
    if (!variantId || !isComplete || !saveName.trim()) return;
    setSaving(true);
    try {
      await builderApi.saveBowl({
        name: saveName.trim(),
        productId: config.product.id,
        variantId,
        selections,
      });
      void builderApi.trackEvent({
        sessionId: sessionId.current,
        productId: config.product.id,
        eventType: 'SAVE_BOWL',
      });
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
    void builderApi.trackEvent({
      sessionId: sessionId.current,
      productId: config.product.id,
      eventType: 'ADD_TO_CART',
      metadata: {
        total: quote.lineTotal,
        extras: quote.extrasTotal,
      },
    });
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

  const total = quote?.lineTotal ?? variant?.basePrice ?? 0;

  return (
    <div className="bg-surface-muted pb-28 xl:pb-0">
      <BuilderHero product={config.product} variants={config.variants} />
      <BuilderProgress
        groups={config.groups}
        completedGroups={completedGroups}
        requiredGroups={requiredGroups.length}
        progress={progress}
        unitsInGroup={unitsInGroup}
        activeGroupId={activeGroupId}
        onStepSelect={(group) => setActiveGroupId(group.id)}
      />

      <main
        id="constructor"
        style={BUILDER_SCROLL_ANCHOR}
        className="bg-[linear-gradient(180deg,var(--color-surface-muted)_0%,var(--color-surface-muted)_45%,var(--color-surface)_100%)] pb-16 pt-8 sm:pt-10 lg:pb-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {restoredNotice && (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {restoredNotice}
            </div>
          )}

          {isAuthenticated &&
            (preferences.allergens.length > 0 ||
              preferences.dietaryTags.length > 0) && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-100 bg-brand-50/80 px-4 py-3.5 text-sm">
                <div>
                  <strong className="text-brand-800">
                    Perfil alimentario activo.
                  </strong>{' '}
                  <span className="text-ink-muted">
                    Evitamos recomendaciones con tus alérgenos y
                    respetamos tus metas.
                  </span>
                </div>
                <span className="rounded-pill bg-white px-3 py-1.5 text-xs font-extrabold text-brand-700 shadow-sm">
                  Personalizado para ti
                </span>
              </div>
            )}

          <div className="mb-7 flex flex-col justify-between gap-3 border-b border-line pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
                Personalización guiada
              </p>
              <h2 className="mt-1.5 text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Construye tu combinación paso a paso
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                Completa los pasos esenciales. Puedes volver y cambiar cualquier ingrediente antes de confirmar.
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-brand-700">
              {completedGroups} de {requiredGroups.length} esenciales listos
            </span>
          </div>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
            <div className="grid min-w-0 gap-7">
              <VariantSelector
                variants={config.variants}
                variantId={variantId}
                isQuoting={isQuoting}
                onChange={setVariantId}
              />

              <BuilderMobileOverview
                options={selectedVisualOptions}
                nutrition={liveNutrition}
                total={total}
                isQuoting={isQuoting}
              />

              <BuilderStarters
                savedBowls={savedBowls}
                presets={config.presets ?? []}
                onApplySaved={(bowl) => {
                  applySelections(bowl.selections, bowl.variantId);
                  void builderApi.trackEvent({
                    sessionId: sessionId.current,
                    productId: config.product.id,
                    eventType: 'PRESET_APPLY',
                    metadata: {
                      source: 'saved-bowl',
                      savedBowlId: bowl.id,
                    },
                  });
                }}
                onDeleteSaved={(bowl) => {
                  void builderApi
                    .deleteSavedBowl(bowl.id)
                    .then(() =>
                      setSavedBowls((current) =>
                        current.filter((item) => item.id !== bowl.id),
                      ),
                    )
                    .catch((error) =>
                      toast.error(getApiErrorMessage(error)),
                    );
                }}
                onApplyPreset={(preset) => {
                  applySelections(preset.selections);
                  void builderApi.trackEvent({
                    sessionId: sessionId.current,
                    productId: config.product.id,
                    eventType: 'PRESET_APPLY',
                    presetId: preset.id,
                  });
                  toast.success(`${preset.name} aplicado`);
                }}
              />

              <div className="grid gap-6">
                {config.groups.map((group, index) => (
                  <GroupStep
                    key={group.id}
                    group={group}
                    index={index + 1}
                    selectedIds={selectedIds}
                    unitsUsed={unitsInGroup(group)}
                    quoteLines={quote?.selections ?? []}
                    onToggle={(option) => handleToggle(index, option)}
                    onQuantityChange={(option, delta) =>
                      changeQuantity(group, option.id, delta)
                    }
                    onResolveConflict={(option) => {
                      resolveConflict(group, option.id);
                      void builderApi.trackEvent({
                        sessionId: sessionId.current,
                        productId: config.product.id,
                        eventType: 'CONFLICT_RESOLVE',
                        groupId: group.id,
                        optionId: option.id,
                      });
                      toast.success(
                        `${option.name} reemplazó la opción incompatible`,
                      );
                    }}
                    selectedOptionNames={selectedOptionNames}
                    isCollapsed={activeGroupId !== group.id}
                    onExpand={() => openGroup(group.id, false)}
                    previousLabel={config.groups[index - 1]?.name}
                    continueLabel={
                      config.groups[index + 1]
                        ? `Continuar a ${config.groups[index + 1].name}`
                        : 'Revisar mi bowl'
                    }
                    onBack={
                      config.groups[index - 1]
                        ? () => openGroup(config.groups[index - 1].id)
                        : undefined
                    }
                    onContinue={() => {
                      const next = config.groups[index + 1];
                      if (next) {
                        openGroup(next.id);
                        return;
                      }
                      document
                        .getElementById('builder-summary')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  />
                ))}
              </div>
            </div>

            <BuilderSummary
              productName={config.product.name}
              groups={config.groups}
              variant={variant}
              selectedOptions={selectedVisualOptions}
              quote={quote}
              nutrition={liveNutrition}
              preferences={preferences}
              recommendation={recommendation}
              selectedAllergens={selectedAllergens}
              preferenceConflicts={preferenceConflicts}
              missingGroups={missingGroups}
              validationMessage={validationMessage}
              isOnline={isOnline}
              isComplete={isComplete}
              isQuoting={isQuoting}
              hasBranch={Boolean(branchId)}
              nextStepLabel={nextMissingGroup?.name ?? null}
              saveLabel={
                isAuthenticated
                  ? 'Guardar este bowl'
                  : 'Inicia sesión para guardarlo'
              }
              onApplyRecommendation={() => {
                if (!recommendation) return;
                if (recommendation.action === 'remove') {
                  toggleOption(
                    recommendation.group,
                    recommendation.option.id,
                  );
                  return;
                }
                handleToggle(
                  config.groups.findIndex(
                    (group) => group.id === recommendation.group.id,
                  ),
                  recommendation.option,
                );
              }}
              onRetryQuote={retryQuote}
              onContinue={() => {
                if (nextMissingGroup) openGroup(nextMissingGroup.id);
              }}
              onAddToCart={handleAddToCart}
              onSave={() =>
                isAuthenticated
                  ? setSaveOpen(true)
                  : navigate(
                      `${ROUTES.login}?returnTo=${encodeURIComponent(ROUTES.builder)}`,
                    )
              }
              onReset={handleReset}
              onExport={() =>
                void exportBowlCard(
                  config.product.name,
                  selectedVisualOptions,
                  total,
                ).catch((error) => {
                  if ((error as Error)?.name !== 'AbortError') {
                    toast.error(getApiErrorMessage(error));
                  }
                })
              }
            />
          </div>
        </div>
      </main>

      <StickyActionBar
        hideFrom="xl"
        maxWidth="3xl"
        label={
          isComplete
            ? 'Tu bowl está listo'
            : nextMissingGroup
              ? `Siguiente: ${nextMissingGroup.name}`
              : 'Validando tu bowl'
        }
        value={formatCurrency(total)}
      >
        <Button
          disabled={!isComplete && !nextMissingGroup}
          isLoading={isQuoting && !nextMissingGroup}
          onClick={
            isComplete
              ? handleAddToCart
              : () => {
                  if (nextMissingGroup) openGroup(nextMissingGroup.id);
                }
          }
        >
          {isComplete
            ? 'Agregar al carrito'
            : nextMissingGroup
              ? `Continuar: ${nextMissingGroup.name}`
              : 'Validando'}
        </Button>
      </StickyActionBar>

      <SaveBowlModal
        isOpen={saveOpen}
        name={saveName}
        selectionCount={selections.length}
        variantName={variant?.name}
        total={quote?.lineTotal ?? 0}
        isSaving={saving}
        onNameChange={setSaveName}
        onClose={() => setSaveOpen(false)}
        onSave={() => void saveCurrentBowl()}
      />
    </div>
  );
};

export default BuilderPage;
