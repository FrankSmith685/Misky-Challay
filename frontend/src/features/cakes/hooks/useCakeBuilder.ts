import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage } from '@services/api/client';
import { builderApi } from '@features/builder/services/builder.service';
import type { BuilderConfig, BuilderGroup, BuilderOption, QuoteResult } from '@features/builder/types';
import type { CakeTheme } from '../cakeThemes.service';

export interface CakeSelection {
  optionId: number;
  quantity: number;
}

interface StoredCakeState {
  variantId?: number;
  selections?: CakeSelection[];
  configurationKey?: string;
  requestedServings?: number;
}

interface UseCakeBuilderInput {
  productId: number;
  branchId: number | null;
  enabled?: boolean;
  initialVariantId?: number | null;
  initialSelections?: CakeSelection[];
  initialConfigurationKey?: string;
  initialRequestedServings?: number;
  requestedServings?: number;
  quantity?: number;
  theme?: CakeTheme | null;
}

const selectionFor = (value: CakeSelection[], config: BuilderConfig): CakeSelection[] => {
  const optionIndex = new Map(config.groups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
  return value.flatMap((entry) => {
    const option = optionIndex.get(entry.optionId);
    if (!option?.isAvailable) return [];
    return [{ optionId: option.id, quantity: Math.max(1, Math.min(entry.quantity, option.maxPerItem)) }];
  });
};

const configForVariant = (config: BuilderConfig, variantId: number | null, theme?: CakeTheme | null): BuilderConfig => {
  const rule = theme?.variantRules.find((entry) => entry.variantId === variantId);
  return { ...config, groups: config.groups.filter((group) => (group.variantId === null || group.variantId === variantId) && !rule?.hiddenGroupIds?.includes(group.id))
    .map((group) => ({ ...group, options: group.options.filter((option) => !rule?.excludedOptionIds.includes(option.id)) })) };
};

/** Estado del configurador de tortas. El servidor sigue siendo la fuente del precio. */
export const useCakeBuilder = ({ productId, branchId, enabled = true, initialVariantId, initialSelections = [], initialConfigurationKey = 'default', initialRequestedServings, requestedServings, quantity = 1, theme }: UseCakeBuilderInput) => {
  const [config, setConfig] = useState<BuilderConfig | null>(null);
  const [variantId, setVariantId] = useState<number | null>(initialVariantId ?? null);
  const [selections, setSelections] = useState<CakeSelection[]>(initialSelections);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryLoadNonce, setRetryLoadNonce] = useState(0);
  const [retryQuoteNonce, setRetryQuoteNonce] = useState(0);
  const [restoration, setRestoration] = useState<{ sourceKey: string; fromDraft: boolean; requestedServings?: number } | null>(null);
  const initializedKey = useRef<string | null>(null);
  const quoteRequestId = useRef(0);
  const storageKey = `dulceflow:cake-builder:${productId}:v1${theme ? `:theme:${theme.id}:${theme.version}` : ''}`;
  const visibleConfig = useMemo(() => {
    if (!config) return null;
    return configForVariant(config, variantId, theme);
  }, [config, variantId, theme]);

  useEffect(() => {
    if (!enabled || productId <= 0) {
      setIsLoading(false);
      setConfig(null);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setConfig(null);
    builderApi.getConfig(productId, branchId)
      .then((next) => {
        if (cancelled) return;
        if (theme?.saleMode === 'CONFIGURED') next = { ...next, variants: next.variants.filter((variant) => theme.variantRules.some((rule) => rule.variantId === variant.id)) };
        setConfig(next);
        const key = `${storageKey}:${initialConfigurationKey}`;
        if (initializedKey.current === key) return;
        initializedKey.current = key;
        let stored: StoredCakeState | null = null;
        try {
          const raw = localStorage.getItem(storageKey);
          stored = raw ? JSON.parse(raw) as StoredCakeState : null;
        } catch {
          localStorage.removeItem(storageKey);
        }
        const fromDraft = initialConfigurationKey !== 'default' && stored?.configurationKey === initialConfigurationKey;
        const initialId = fromDraft ? stored?.variantId : initialVariantId;
        const preferred = next.variants.find((variant) => variant.isDefault) ?? next.variants[0];
        const preferredId = next.variants.some((variant) => variant.id === initialId)
          ? initialId
          : next.variants.some((variant) => variant.id === stored?.variantId)
            ? stored?.variantId
            : preferred?.id ?? null;
        setVariantId(preferredId ?? null);
        const source = fromDraft ? stored?.selections ?? [] : initialConfigurationKey !== 'default' || initialSelections.length ? initialSelections : stored?.selections ?? [];
        setSelections(selectionFor(source, configForVariant(next, preferredId ?? null, theme)));
        setRestoration({ sourceKey: initialConfigurationKey, fromDraft, requestedServings: fromDraft ? stored?.requestedServings : initialRequestedServings });
      })
      .catch((cause) => { if (!cancelled) setLoadError(getApiErrorMessage(cause)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [branchId, enabled, initialConfigurationKey, initialRequestedServings, initialSelections, initialVariantId, productId, retryLoadNonce, storageKey, theme]);

  useEffect(() => {
    if (!config || !variantId || initializedKey.current !== `${storageKey}:${initialConfigurationKey}`) return;
    localStorage.setItem(storageKey, JSON.stringify({ variantId, selections, requestedServings, configurationKey: initialConfigurationKey, savedAt: new Date().toISOString() }));
  }, [config, initialConfigurationKey, requestedServings, selections, storageKey, variantId]);

  useEffect(() => {
    if (!visibleConfig || !variantId) return;
    setSelections((current) => {
      const next = selectionFor(current, visibleConfig);
      const unchanged = next.length === current.length && next.every((entry, index) => entry.optionId === current[index]?.optionId && entry.quantity === current[index]?.quantity);
      return unchanged ? current : next;
    });
  }, [variantId, visibleConfig]);

  const requiredIncomplete = useMemo(() => visibleConfig?.groups.some((group) => {
    const ids = new Set(group.options.map((option) => option.id));
    const units = selections.filter((entry) => ids.has(entry.optionId)).reduce((sum, entry) => sum + entry.quantity, 0);
    return units < group.minSelection;
  }) ?? true, [visibleConfig, selections]);
  const servingRule = config?.customServings;
  const invalidServings = requestedServings !== undefined && (!Number.isSafeInteger(requestedServings)
    || !servingRule?.enabled || variantId !== servingRule.baseVariantId
    || requestedServings < servingRule.minServings || requestedServings > servingRule.maxServings);

  useEffect(() => {
    if (!enabled || !visibleConfig || !variantId || requiredIncomplete || invalidServings || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      quoteRequestId.current += 1;
      setQuote(null);
      setIsQuoting(false);
      setValidationMessage(null);
      return;
    }
    const requestId = ++quoteRequestId.current;
    const controller = new AbortController();
    setQuote(null);
    setIsQuoting(true);
    setValidationMessage(null);
    const timer = window.setTimeout(async () => {
      try {
        const result = await builderApi.quote({ productId, variantId, quantity, branchId, selections, requestedServings, themeId: theme?.id, themeVersion: theme?.version }, controller.signal);
        if (requestId !== quoteRequestId.current) return;
        setQuote(result);
      } catch (cause) {
        if (controller.signal.aborted || requestId !== quoteRequestId.current) return;
        setQuote(null);
        setValidationMessage(getApiErrorMessage(cause));
      } finally {
        if (requestId === quoteRequestId.current) setIsQuoting(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [branchId, enabled, productId, quantity, requestedServings, requiredIncomplete, invalidServings, retryQuoteNonce, selections, variantId, visibleConfig, theme]);

  const getQuantity = useCallback((optionId: number) => selections.find((entry) => entry.optionId === optionId)?.quantity ?? 0, [selections]);
  const unitsInGroup = useCallback((group: BuilderGroup) => group.options.reduce((sum, option) => sum + getQuantity(option.id), 0), [getQuantity]);

  const toggleOption = useCallback((group: BuilderGroup, optionId: number) => {
    setSelections((current) => {
      const selected = current.some((entry) => entry.optionId === optionId);
      if (selected) return current.filter((entry) => entry.optionId !== optionId);
      const groupIds = new Set(group.options.map((option) => option.id));
      const cleaned = group.selectionType === 'SINGLE' ? current.filter((entry) => !groupIds.has(entry.optionId)) : current;
      const used = cleaned.filter((entry) => groupIds.has(entry.optionId)).reduce((sum, entry) => sum + entry.quantity, 0);
      if (used >= group.maxSelection) return current;
      return [...cleaned, { optionId, quantity: 1 }];
    });
  }, []);

  const changeQuantity = useCallback((group: BuilderGroup, optionId: number, delta: number) => {
    setSelections((current) => {
      const option = group.options.find((entry) => entry.id === optionId);
      if (!option) return current;
      const existing = current.find((entry) => entry.optionId === optionId);
      const groupIds = new Set(group.options.map((entry) => entry.id));
      const used = current.filter((entry) => groupIds.has(entry.optionId)).reduce((sum, entry) => sum + entry.quantity, 0);
      const next = (existing?.quantity ?? 0) + delta;
      if (next <= 0) return current.filter((entry) => entry.optionId !== optionId);
      if (next > option.maxPerItem || (delta > 0 && used >= group.maxSelection)) return current;
      return existing
        ? current.map((entry) => entry.optionId === optionId ? { ...entry, quantity: next } : entry)
        : [...current, { optionId, quantity: 1 }];
    });
  }, []);

  const resolveConflict = useCallback((group: BuilderGroup, optionId: number) => {
    const option = group.options.find((entry) => entry.id === optionId);
    if (!option) return;
    setSelections((current) => {
      const groupIds = new Set(group.options.map((entry) => entry.id));
      const cleaned = current.filter((entry) => !option.incompatibleWith.includes(entry.optionId) && !(group.selectionType === 'SINGLE' && groupIds.has(entry.optionId)));
      return [...cleaned, { optionId, quantity: 1 }];
    });
  }, []);

  const applySelections = useCallback((incoming: CakeSelection[], nextVariantId?: number) => {
    if (!config) return;
    const targetVariantId = nextVariantId && config.variants.some((variant) => variant.id === nextVariantId) ? nextVariantId : variantId;
    setSelections(selectionFor(incoming, configForVariant(config, targetVariantId, theme)));
    if (targetVariantId) setVariantId(targetVariantId);
  }, [config, theme, variantId]);

  const reset = useCallback(() => {
    setSelections([]);
    setQuote(null);
    setValidationMessage(null);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const variant = useMemo(() => visibleConfig?.variants.find((entry) => entry.id === variantId) ?? null, [visibleConfig, variantId]);
  const missingGroups = useMemo(() => (visibleConfig?.groups ?? []).filter((group) => unitsInGroup(group) < group.minSelection).map((group) => group.name), [visibleConfig, unitsInGroup]);
  const selectedOptions = useMemo(() => (visibleConfig?.groups ?? []).flatMap((group) => group.options.flatMap((option) => {
    const quantity = getQuantity(option.id);
    return quantity ? [{ ...option, quantity }] : [];
  })), [visibleConfig, getQuantity]);

  return {
    config: visibleConfig,
    variant,
    variantId,
    setVariantId,
    selections,
    selectedOptions,
    toggleOption,
    changeQuantity,
    resolveConflict,
    applySelections,
    getQuantity,
    unitsInGroup,
    quote,
    validationMessage,
    missingGroups,
    isComplete: missingGroups.length === 0 && quote !== null,
    isLoading,
    isQuoting,
    loadError,
    restoration,
    retryQuote: () => setRetryQuoteNonce((value) => value + 1),
    retryLoad: () => setRetryLoadNonce((value) => value + 1),
    reset,
  };
};

export type CakeBuilderState = ReturnType<typeof useCakeBuilder>;
export type CakeBuilderOption = BuilderOption & { quantity: number };
