import { useEffect, useRef, useState } from 'react';
import { store } from './store';
import { useAppSelector } from './hooks';
import { replaceCartItems } from '@features/cart/cartSlice';
import { replaceFavorites } from '@features/favorites/favoritesSlice';
import { api, getApiErrorMessage } from '@services/api/client';
import { useLiveRefresh } from '@services/realtime';
import { Button } from '@components/ui/Button';
import type { CartItem } from '@/types/domain';
import type { FavoriteItem } from '@features/favorites/favoritesSlice';

interface Workspace {
  revision: number;
  cart: CartItem[];
  favorites: FavoriteItem[];
  drafts: Record<string, unknown>;
}
const markerKey = 'dulceflow:customer-workspace:v1';
const draftKey = (key: string) =>
  key.startsWith('cake-visual:v1:') || key.startsWith('dulceflow:cake-builder:');
function localData() {
  const drafts: Record<string, unknown> = {};
  try {
    for (const key of Object.keys(sessionStorage).filter(draftKey))
      drafts[key] = JSON.parse(sessionStorage.getItem(key) ?? 'null');
  } catch {
    /* Persistence warning is displayed separately. */
  }
  return { cart: store.getState().cart.items, favorites: store.getState().favorites.items, drafts };
}
async function transform(
  value: unknown,
  upload: boolean,
  active: () => boolean,
  cache: Map<string, Promise<unknown>>,
): Promise<unknown> {
  if (!active()) throw new Error('La sesión cambió.');
  if (upload && typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(value)) {
    if (!cache.has(value))
      cache.set(
        value,
        api
          .post('/customer/media', { dataUrl: value })
          .then(({ data }) => ({ $media: data.data.mediaId }))
          .catch((error) => {
            cache.delete(value);
            throw error;
          }),
      );
    return cache.get(value);
  }
  if (!upload && value && typeof value === 'object' && '$media' in value) {
    const id = String(value.$media);
    if (!cache.has(id))
      cache.set(
        id,
        api
          .get(`/customer/media/${encodeURIComponent(id)}`)
          .then(({ data }) => data.data.dataUrl)
          .catch((error) => {
            cache.delete(id);
            throw error;
          }),
      );
    return cache.get(id);
  }
  if (Array.isArray(value))
    return Promise.all(value.map((entry) => transform(entry, upload, active, cache)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, entry]) => [
          key,
          await transform(entry, upload, active, cache),
        ]),
      ),
    );
  return value;
}

/** CAS revisions prevent another tab/device from silently replacing a customer's work. */
export function CustomerWorkspaceSync() {
  const userId = useAppSelector((state) => state.auth.user?.id);
  const controller = useRef<{
    refresh: () => void;
    retry: () => void;
    restore: () => void;
    keep: () => void;
  }>();
  const [issue, setIssue] = useState('');
  const [conflict, setConflict] = useState(false);
  useLiveRefresh(['workspace'], () => controller.current?.refresh(), { enabled: Boolean(userId) });
  useEffect(() => {
    let active = true,
      busy = false,
      ready = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    let revision = 0,
      savedHash = '',
      remote: Workspace | null = null;
    const cache = new Map<string, Promise<unknown>>();
    setIssue('');
    setConflict(false);
    if (!userId) return;
    const valid = () => active && store.getState().auth.user?.id === userId;
    const mark = () => {
      try {
        localStorage.setItem(markerKey, JSON.stringify({ userId, hash: savedHash, revision }));
      } catch {
        /* Warning comes from local persistence. */
      }
    };
    const restore = async () => {
      if (!remote || busy) return;
      busy = true;
      try {
        const restored = (await transform(remote, false, valid, cache)) as Workspace;
        if (!valid()) return;
        revision = restored.revision;
        for (const key of Object.keys(sessionStorage).filter(draftKey))
          sessionStorage.removeItem(key);
        for (const [key, value] of Object.entries(restored.drafts).filter(([key]) => draftKey(key)))
          sessionStorage.setItem(key, JSON.stringify(value));
        store.dispatch(replaceCartItems(restored.cart));
        store.dispatch(replaceFavorites(restored.favorites));
        savedHash = JSON.stringify(localData());
        mark();
        ready = true;
        setConflict(false);
        setIssue('');
        window.dispatchEvent(new Event('dulceflow:drafts-restored'));
      } catch (error) {
        if (valid()) setIssue(getApiErrorMessage(error));
      } finally {
        busy = false;
      }
    };
    const save = async () => {
      if (!ready || busy || !valid()) return;
      const snapshot = localData();
      const hash = JSON.stringify(snapshot);
      if (hash === savedHash) return;
      busy = true;
      let succeeded = false;
      try {
        const encoded = await transform(snapshot, true, valid, cache);
        if (!valid()) return;
        const { data } = await api.put('/customer/workspace', { ...(encoded as object), revision });
        if (!valid()) return;
        revision = data.data.revision;
        savedHash = hash;
        mark();
        setIssue('');
        succeeded = true;
      } catch (error) {
        if (!valid()) return;
        setIssue(getApiErrorMessage(error));
        if ((error as { response?: { status: number } }).response?.status === 409) {
          ready = false;
          setConflict(true);
          try {
            const latest = await api.get('/customer/workspace');
            if (valid()) remote = latest.data.data;
          } catch (recoveryError) {
            if (valid()) setIssue(getApiErrorMessage(recoveryError));
          }
        }
      } finally {
        busy = false;
        if (succeeded && valid() && ready && JSON.stringify(localData()) !== savedHash) schedule();
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void save(), 1200);
    };
    const refresh = async () => {
      if (!valid() || busy) return;
      try {
        const { data } = await api.get('/customer/workspace');
        if (!valid() || !data.data?.revision) return;
        remote = data.data;
        if (ready && remote!.revision === revision) {
          schedule();
          return;
        }
        const current = localData();
        const currentHash = JSON.stringify(current);
        let marker: { userId: number; hash: string; revision?: number } | null = null;
        try {
          marker = JSON.parse(localStorage.getItem(markerKey) ?? 'null');
        } catch {
          /* No marker means unsynced work. */
        }
        const remoteEmpty =
          !remote!.cart.length && !remote!.favorites.length && !Object.keys(remote!.drafts).length;
        if (
          marker?.userId === userId &&
          marker.revision === remote!.revision &&
          marker.hash !== currentHash
        ) {
          revision = remote!.revision;
          ready = true;
          savedHash = marker.hash;
          setConflict(false);
          schedule();
        } else if (remoteEmpty && !ready && remote!.revision === 1) {
          revision = 1;
          ready = true;
          savedHash = '';
          schedule();
        } else if (
          (!current.cart.length &&
            !current.favorites.length &&
            !Object.keys(current.drafts).length) ||
          (marker?.userId === userId && marker.hash === currentHash)
        ) {
          await restore();
        } else {
          ready = false;
          setConflict(true);
          setIssue(
            'Tienes una versión guardada en tu cuenta y cambios en este dispositivo. Elige cuál conservar.',
          );
        }
      } catch (error) {
        if (valid())
          setIssue(
            `No se pudo guardar o recuperar tu trabajo en la cuenta. ${getApiErrorMessage(error)}`,
          );
      }
    };
    controller.current = {
      refresh: () => void refresh(),
      retry: () => {
        if (ready) void save();
        else void refresh();
      },
      restore: () => void restore(),
      keep: () => {
        void (async () => {
          const { data } = await api.get('/customer/workspace');
          if (!valid()) return;
          revision = data.data.revision;
          savedHash = '';
          ready = true;
          setConflict(false);
          await save();
        })().catch((error) => setIssue(getApiErrorMessage(error)));
      },
    };
    const unsubscribe = store.subscribe(schedule);
    const warning = () =>
      setIssue(
        'El navegador no pudo guardar tus cambios. Mantén esta página abierta hasta que se guarden en tu cuenta.',
      );
    window.addEventListener('dulceflow:draft-changed', schedule);
    window.addEventListener('dulceflow:storage-error', warning);
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('dulceflow:draft-changed', schedule);
      window.removeEventListener('dulceflow:storage-error', warning);
      controller.current = undefined;
    };
  }, [userId]);
  if (!issue && !conflict) return null;
  return (
    <aside role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <p>{issue}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {conflict ? (
          <>
            <Button size="sm" onClick={() => controller.current?.restore()}>
              Recuperar versión de mi cuenta
            </Button>
            <Button size="sm" variant="outline" onClick={() => controller.current?.keep()}>
              Guardar los cambios de este dispositivo
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => controller.current?.retry()}>
            Reintentar guardado
          </Button>
        )}
      </div>
    </aside>
  );
}
