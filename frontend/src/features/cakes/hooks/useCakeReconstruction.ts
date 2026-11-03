import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getApiErrorMessage } from '@services/api/client';
import { cakeReconstructionApi, hashCakeReference, type CakeReconstructionJob } from '../cakeReconstruction.service';
import type { CakeVisualDesign } from '../utils/cakeVisualDesign';
import { reconstructionRetryAt } from '../utils/reconstructionRetry';

// React StrictMode and expanding the editor must not submit a second paid task.
const submissions = new Map<string, Promise<CakeReconstructionJob>>();
const submit = (source: string, key: string) => {
  let pending = submissions.get(key);
  if (!pending) {
    pending = cakeReconstructionApi.create(source, key);
    submissions.set(key, pending);
    void pending.then(() => { window.setTimeout(() => submissions.delete(key), 60_000); }, () => submissions.delete(key));
  }
  return pending;
};
const requestKey = (hash: string, regenerate: boolean) => {
  const key = `cake-reconstruction:v1:${hash}`;
  let saved: string | null = null;
  try { saved = regenerate ? null : sessionStorage.getItem(key); } catch { /* Storage can be disabled. */ }
  const request = saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : crypto.randomUUID();
  try { sessionStorage.setItem(key, request); } catch { /* Current request still works. */ }
  return request;
};

export const useCakeReconstruction = (reference: string | null, design: CakeVisualDesign, onChange: (value: CakeVisualDesign) => void, active = true) => {
  const enabled = active && Boolean(reference) && design.referenceMode !== 'print';
  const [state, setState] = useState<{ source: string | null; job: CakeReconstructionJob | null; error: string; unavailable: boolean; working: boolean }>({ source: null, job: null, error: '', unavailable: false, working: false });
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const retryDeadline = useRef(0);
  const regenerate = useRef(false);
  const current = useRef({ design, onChange });
  current.current = { design, onChange };
  const rememberedToken = design.reconstruction?.token;

  useEffect(() => {
    if (!enabled || !reference) return;
    let active = true;
    let timer: number | undefined;
    let failures = 0;
    const schedule = (poll: () => Promise<void>, delay = 5_000) => { if (active) timer = window.setTimeout(() => void poll(), delay); };
    const run = async () => {
      setExpired(false);
      setRetryAt(null); retryDeadline.current = 0;
      setState({ source: reference, job: null, error: '', unavailable: false, working: true });
      try {
        const hash = await hashCakeReference(reference);
        if (!active) return;
        const prior = current.current.design.reconstruction;
        let token = prior?.sourceHash === hash && !regenerate.current ? prior.token : null;
        if (!token) {
          const capabilities = await cakeReconstructionApi.capabilities();
          if (!active) return;
          if (!capabilities.enabled) {
            setState({ source: reference, job: null, error: ['triposr', 'sf3d', 'hunyuanmini'].includes(capabilities.provider ?? '') ? 'El servicio de conversión no está disponible ahora. Conservamos tu foto para que puedas continuar el pedido o reintentar más tarde.' : 'La conversión de fotos a 3D está pendiente de activación en este taller. Conservamos tu foto como referencia.', unavailable: true, working: false });
            return;
          }
          const request = requestKey(hash, regenerate.current);
          regenerate.current = false;
          const job = await submit(reference, request);
          if (!active) return;
          if (job.sourceHash !== hash) throw new Error('La conversión no corresponde a la imagen actual.');
          token = job.token;
          current.current.onChange({ ...current.current.design, reconstruction: { token, sourceHash: hash } });
          setState({ source: reference, job, error: job.error ?? '', unavailable: false, working: !['SUCCEEDED', 'FAILED'].includes(job.status) });
          if (job.status === 'FAILED' || job.status === 'SUCCEEDED') return;
        }
        const poll = async () => {
          if (!active || !token) return;
          try {
            const job = await cakeReconstructionApi.get(token);
            if (!active) return;
            if (job.sourceHash !== hash) throw new Error('La conversión corresponde a otra imagen.');
            failures = 0;
            setState({ source: reference, job, error: job.error ?? '', unavailable: false, working: !['SUCCEEDED', 'FAILED'].includes(job.status) });
            if (job.status !== 'SUCCEEDED' && job.status !== 'FAILED') schedule(poll);
          } catch (error) {
            if (!active) return;
            const deadline = reconstructionRetryAt(error);
            if (deadline) {
              retryDeadline.current = deadline; setRetryAt(deadline);
              setState((value) => ({ ...value, error: getApiErrorMessage(error), working: false }));
              return;
            }
            if (axios.isAxiosError(error) && error.response?.status === 404) {
              setExpired(true);
              setState((value) => ({ ...value, error: 'El modelo anterior venció. Puedes convertir la foto otra vez.', working: false }));
              return;
            }
            failures++;
            setState((value) => ({ ...value, error: getApiErrorMessage(error), working: failures < 4 }));
            if (failures < 4) schedule(poll, Math.min(20_000, failures * 5_000));
          }
        };
        await poll();
      } catch (error) {
        if (active) {
          const deadline = reconstructionRetryAt(error);
          retryDeadline.current = deadline ?? 0; setRetryAt(deadline);
          setState((value) => ({ ...value, source: reference, error: getApiErrorMessage(error), working: false }));
        }
      }
    };
    void run();
    const resume = () => { if (Date.now() >= retryDeadline.current) setAttempt((value) => value + 1); };
    window.addEventListener('online', resume);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener('online', resume); };
  }, [enabled, reference, attempt, rememberedToken]);

  const relevant = enabled && state.source === reference;
  const job = relevant ? state.job : null;
  return {
    enabled,
    job,
    token: job?.status === 'SUCCEEDED' ? job.token : null,
    error: relevant ? state.error : '',
    unavailable: relevant && state.unavailable,
    working: enabled && (!relevant || state.working),
    canRegenerate: relevant && (expired || job?.status === 'FAILED'),
    retryAt: relevant ? retryAt : null,
    retry: () => { if (Date.now() < retryDeadline.current) return; regenerate.current = expired || job?.status === 'FAILED'; setAttempt((value) => value + 1); },
    regenerate: () => { regenerate.current = true; setAttempt((value) => value + 1); },
  };
};
