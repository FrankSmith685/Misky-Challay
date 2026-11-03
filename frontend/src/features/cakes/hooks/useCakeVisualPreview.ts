import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi, type CakeVisualPreviewInput } from '../cakes.service';

type Phase = 'incomplete' | 'idle' | 'waiting' | 'generating' | 'ready' | 'error' | 'unavailable';
const images = new Map<string, { dataUrl: string; expiresAt: number }>();
const pending = new Map<string, ReturnType<typeof cakesApi.visualPreview>>();
let capabilities: ReturnType<typeof cakesApi.visualPreviewCapabilities> | null = null;

/** Only an explicit click starts AI. Recipe changes update the local illustration.
 * A running proposal can finish and be cached, but never replaces a different
 * recipe. No provider calls occur on mount, option changes or cache expiration.
 */
export const useCakeVisualPreview = (input: CakeVisualPreviewInput, enabled: boolean, saved?: { dataUrl: string; input: CakeVisualPreviewInput }) => {
  // Invalidate proposals created with the old prompt that forbade inscriptions.
  const key = JSON.stringify([2, input]);
  const current = useRef({ key, enabled });
  current.current = { key, enabled };
  const mounted = useRef(true);
  const locked = useRef(false);
  const [inFlightKey, setInFlightKey] = useState<string | null>(null);
  const [lastProposalKey, setLastProposalKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; phase: Phase; dataUrl?: string; error?: string }>({ key: '', phase: 'incomplete' });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const generate = async () => {
    if (locked.current || !current.current.enabled) return;
    const selectedKey = current.current.key;
    const [, selected] = JSON.parse(selectedKey) as [number, CakeVisualPreviewInput];
    if (!selected.flavor || !selected.filling) return;
    const cached = images.get(selectedKey);
    if (cached && cached.expiresAt > Date.now()) {
      setResult({ key: selectedKey, phase: 'ready', dataUrl: cached.dataUrl });
      return;
    }
    locked.current = true;
    setInFlightKey(selectedKey);
    setResult({ key: selectedKey, phase: 'waiting' });
    const relevant = () => mounted.current && current.current.enabled && current.current.key === selectedKey;
    try {
      if (result.phase === 'unavailable' || result.phase === 'error') capabilities = null;
      capabilities ??= cakesApi.visualPreviewCapabilities();
      let capability: Awaited<ReturnType<typeof cakesApi.visualPreviewCapabilities>>;
      try { capability = await capabilities; }
      catch (cause) { capabilities = null; throw cause; }
      // The customer may have changed options while capabilities were loading.
      if (!relevant()) return;
      if (!capability.enabled) { setResult({ key: selectedKey, phase: 'unavailable' }); return; }
      setResult({ key: selectedKey, phase: 'generating' });
      let task = pending.get(selectedKey);
      if (!task) {
        task = cakesApi.visualPreview(selected);
        pending.set(selectedKey, task);
        void task.then((value) => {
          images.delete(selectedKey); images.set(selectedKey, { dataUrl: value.dataUrl, expiresAt: Date.now() + 15 * 60_000 });
          let bytes = [...images.values()].reduce((total, image) => total + image.dataUrl.length * 2, 0);
          while (images.size > 8 || bytes > 24 * 1024 * 1024) {
            const oldest = images.keys().next().value!;
            bytes -= images.get(oldest)!.dataUrl.length * 2;
            images.delete(oldest);
          }
          pending.delete(selectedKey);
        }, () => { pending.delete(selectedKey); });
      }
      const value = await task;
      if (mounted.current) setLastProposalKey(selectedKey);
      if (relevant()) setResult({ key: selectedKey, phase: 'ready', dataUrl: value.dataUrl });
    } catch (cause) {
      if (relevant()) {
        let message = getApiErrorMessage(cause);
        if (axios.isAxiosError(cause) && cause.response?.status === 429) message = 'La IA alcanzó su límite temporal. La ilustración sigue actualizándose; puedes reintentar más tarde.';
        setResult({ key: selectedKey, phase: 'error', error: message });
      }
    } finally {
      locked.current = false;
      if (mounted.current) {
        setInFlightKey(null);
        setResult((previous) => previous.key === selectedKey && (previous.phase === 'waiting' || previous.phase === 'generating') ? { key: selectedKey, phase: 'idle' } : previous);
      }
    }
  };

  const cached = images.get(key);
  const restoredImage = saved && JSON.stringify([2, saved.input]) === key ? saved.dataUrl : null;
  const cachedImage = cached && cached.expiresAt > Date.now() ? cached.dataUrl : restoredImage;
  const eligible = enabled && Boolean(input.flavor && input.filling);
  const phase: Phase = !eligible ? 'incomplete' : cachedImage ? 'ready' : result.key === key ? result.phase : 'idle';
  const generatedDataUrl = phase === 'ready' ? cachedImage ?? (result.key === key ? result.dataUrl ?? null : null) : null;
  return {
    phase,
    generatedDataUrl,
    generating: eligible && inFlightKey === key,
    finishingPrevious: Boolean(inFlightKey && inFlightKey !== key),
    proposalOutdated: Boolean(lastProposalKey && lastProposalKey !== key && !generatedDataUrl),
    generationError: result.key === key && phase === 'error' ? result.error ?? '' : '',
    canGenerate: eligible && !inFlightKey,
    generate,
  };
};
