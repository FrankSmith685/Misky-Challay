import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage } from '@services/api/client';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { builderApi } from '../services/builder.service';
import type { BuilderConfig, BuilderGroup, QuoteResult } from '../types';

const BUILDER_SLUG = 'arma-tu-bowl';
const BUILDER_STORAGE_KEY = 'verde-bowl:builder:v2';

export interface Selection {
  optionId: number;
  quantity: number;
}

export const useBowlBuilder = (branchId: number | null) => {
  const [config, setConfig] = useState<BuilderConfig | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadNonce, setLoadNonce] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const quoteRequestId = useRef(0);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // 1) Cargar la configuracion del producto personalizable
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    catalogApi
      .getProduct(BUILDER_SLUG, branchId)
      .then((product) => builderApi.getConfig(product.id, branchId))
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        const preferred = data.variants.find((variant) => variant.isDefault) ?? data.variants[0];
        let restoredVariant = preferred?.id ?? null;
        let restoredSelections: Selection[] = [];
        setRestoredNotice(null);
        try {
          const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
          const saved = raw ? JSON.parse(raw) as { productId?: number; variantId?: number; selections?: Selection[] } : null;
          if (saved?.productId === data.product.id) {
            if (data.variants.some((variant) => variant.id === saved.variantId)) restoredVariant = saved.variantId ?? restoredVariant;
            const optionIndex = new Map(data.groups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
            restoredSelections = (saved.selections ?? []).flatMap((entry) => {
              const option = optionIndex.get(entry.optionId);
              return option?.isAvailable
                ? [{ optionId: option.id, quantity: Math.max(1, Math.min(entry.quantity, option.maxPerItem)) }]
                : [];
            });
            if (restoredSelections.length < (saved.selections ?? []).length) {
              setRestoredNotice('Actualizamos tu bowl guardado porque uno o más ingredientes ya no están disponibles. Revisa las alternativas sugeridas.');
            }
          }
        } catch {
          localStorage.removeItem(BUILDER_STORAGE_KEY);
        }
        setVariantId(restoredVariant);
        setSelections(restoredSelections);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, loadNonce]);

  useEffect(() => {
    if (!config || !variantId) return;
    localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({
      productId: config.product.id,
      variantId,
      selections,
      savedAt: new Date().toISOString(),
    }));
  }, [config, variantId, selections]);

  // 2) Cotizar en el backend solo cuando ya se cumplieron los minimos.
  useEffect(() => {
    if (!config || !variantId) return;
    const hasMissingRequiredGroup = config.groups.some((group) => {
      const optionIds = new Set(group.options.map((option) => option.id));
      const units = selections
        .filter((selection) => optionIds.has(selection.optionId))
        .reduce((total, selection) => total + selection.quantity, 0);
      return units < group.minSelection;
    });
    if (hasMissingRequiredGroup) {
      quoteRequestId.current += 1;
      setQuote(null);
      setIsQuoting(false);
      setValidationMessage(null);
      return;
    }
    if (!isOnline) {
      setQuote(null);
      setIsQuoting(false);
      setValidationMessage('Sin conexión. Conservamos tu bowl y actualizaremos el precio cuando vuelvas.');
      return;
    }

    const requestId = ++quoteRequestId.current;
    const controller = new AbortController();
    setQuote(null);
    setValidationMessage(null);
    setIsQuoting(true);

    const timer = setTimeout(async () => {
      try {
        const result = await builderApi.quote(
          {
            productId: config.product.id,
            variantId,
            quantity: 1,
            branchId,
            selections,
          },
          controller.signal,
        );
        if (requestId !== quoteRequestId.current) return;
        setQuote(result);
        setValidationMessage(null);
      } catch (error) {
        if (controller.signal.aborted || requestId !== quoteRequestId.current) return;
        // 422 = falta un paso obligatorio o hay una combinacion no permitida.
        setQuote(null);
        setValidationMessage(getApiErrorMessage(error));
      } finally {
        if (requestId === quoteRequestId.current) setIsQuoting(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [config, variantId, selections, branchId, retryNonce, isOnline]);

  const getQuantity = useCallback(
    (optionId: number): number =>
      selections.find((selection) => selection.optionId === optionId)?.quantity ?? 0,
    [selections],
  );

  const unitsInGroup = useCallback(
    (group: BuilderGroup): number =>
      group.options.reduce((total, option) => total + getQuantity(option.id), 0),
    [getQuantity],
  );

  /** Alterna una opcion respetando el tipo de paso y el maximo del grupo. */
  const toggleOption = useCallback((group: BuilderGroup, optionId: number) => {
    setSelections((current) => {
      const isSelected = current.some((selection) => selection.optionId === optionId);
      const groupOptionIds = new Set(group.options.map((option) => option.id));

      if (isSelected) {
        return current.filter((selection) => selection.optionId !== optionId);
      }

      // En un paso SINGLE la nueva opcion reemplaza a la anterior.
      const cleaned =
        group.selectionType === 'SINGLE'
          ? current.filter((selection) => !groupOptionIds.has(selection.optionId))
          : current;

      const used = cleaned
        .filter((selection) => groupOptionIds.has(selection.optionId))
        .reduce((total, selection) => total + selection.quantity, 0);

      if (used >= group.maxSelection) return current; // el maximo lo bloquea la UI

      return [...cleaned, { optionId, quantity: 1 }];
    });
  }, []);

  const changeQuantity = useCallback((group: BuilderGroup, optionId: number, delta: number) => {
    setSelections((current) => {
      const option = group.options.find((entry) => entry.id === optionId);
      if (!option) return current;
      const existing = current.find((entry) => entry.optionId === optionId);
      const currentQuantity = existing?.quantity ?? 0;
      const used = current
        .filter((entry) => group.options.some((candidate) => candidate.id === entry.optionId))
        .reduce((total, entry) => total + entry.quantity, 0);
      const nextQuantity = currentQuantity + delta;
      if (nextQuantity <= 0) return current.filter((entry) => entry.optionId !== optionId);
      if (nextQuantity > option.maxPerItem || (delta > 0 && used >= group.maxSelection)) return current;
      return existing
        ? current.map((entry) => entry.optionId === optionId ? { ...entry, quantity: nextQuantity } : entry)
        : [...current, { optionId, quantity: 1 }];
    });
  }, []);

  /** Quita la opcion incompatible y aplica la nueva en una sola accion reversible. */
  const resolveConflict = useCallback((group: BuilderGroup, optionId: number) => {
    const option = group.options.find((entry) => entry.id === optionId);
    if (!option) return;
    setSelections((current) => {
      const groupIds = new Set(group.options.map((entry) => entry.id));
      const cleaned = current.filter((entry) =>
        !option.incompatibleWith.includes(entry.optionId) &&
        !(group.selectionType === 'SINGLE' && groupIds.has(entry.optionId)),
      );
      return [...cleaned, { optionId, quantity: 1 }];
    });
  }, []);

  const applySelections = useCallback((incoming: Selection[], nextVariantId?: number) => {
    if (!config) return;
    const available = new Map(config.groups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
    const safe = incoming.flatMap((selection) => {
      const option = available.get(selection.optionId);
      return option?.isAvailable ? [{ optionId: option.id, quantity: Math.min(selection.quantity, option.maxPerItem) }] : [];
    });
    setSelections(safe);
    if (nextVariantId && config.variants.some((variant) => variant.id === nextVariantId)) setVariantId(nextVariantId);
    requestAnimationFrame(() => document.getElementById(`builder-group-${config.groups[0]?.id}`)?.scrollIntoView({ behavior: 'smooth' }));
  }, [config]);

  const reset = useCallback(() => {
    setSelections([]);
    setQuote(null);
    setValidationMessage(null);
    localStorage.removeItem(BUILDER_STORAGE_KEY);
  }, []);

  const variant = useMemo(
    () => config?.variants.find((entry) => entry.id === variantId) ?? null,
    [config, variantId],
  );

  /** Pasos que aun no cumplen su minimo: sirven para guiar al cliente. */
  const missingGroups = useMemo(
    () =>
      (config?.groups ?? [])
        .filter((group) => unitsInGroup(group) < group.minSelection)
        .map((group) => group.name),
    [config, unitsInGroup],
  );

  return {
    config,
    variant,
    variantId,
    setVariantId,
    selections,
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
    isOnline,
    retryQuote: () => setRetryNonce((value) => value + 1),
    retryLoad: () => setLoadNonce((value) => value + 1),
    reset,
    restoredNotice,
  };
};

