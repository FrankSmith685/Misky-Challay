import { useEffect, useRef, useState } from 'react';
import { Cloud, Laptop, RefreshCw, ShieldAlert } from 'lucide-react';
import { store } from './store';
import { useAppSelector } from './hooks';
import { replaceCartItems } from '@features/cart/cartSlice';
import { replaceFavorites } from '@features/favorites/favoritesSlice';
import { api, getApiErrorMessage } from '@services/api/client';
import { useLiveRefresh } from '@services/realtime';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import type { CartItem } from '@/types/domain';
import type { FavoriteItem } from '@features/favorites/favoritesSlice';

interface Workspace {
  revision: number;
  cart: CartItem[];
  favorites: FavoriteItem[];
  drafts: Record<string, unknown>;
  updatedAt?: string | null;
}
interface WorkspaceSummary {
  cartItems: number;
  cartUnits: number;
  cartNames: string[];
  favorites: number;
  drafts: number;
  updatedAt?: string | null;
}
type WorkspaceData = Pick<Workspace, 'cart' | 'favorites' | 'drafts'> & { updatedAt?: string | null };
type ConflictChoice = 'restore' | 'keep';

const CONFLICT_MESSAGE = 'Hay dos versiones de tu espacio de compra. Elige cuál conservar.';
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
function summarizeWorkspace(value: WorkspaceData): WorkspaceSummary {
  const cart = Array.isArray(value.cart) ? value.cart : [];
  const favorites = Array.isArray(value.favorites) ? value.favorites : [];
  const drafts = value.drafts && typeof value.drafts === 'object' ? Object.keys(value.drafts).length : 0;
  return {
    cartItems: cart.length,
    cartUnits: cart.reduce((total, item) => total + (Number.isFinite(item.quantity) ? item.quantity : 0), 0),
    cartNames: cart.slice(0, 3).map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`),
    favorites: favorites.length,
    drafts,
    updatedAt: value.updatedAt,
  };
}
function formatWorkspaceDate(value?: string | null, fallback = 'Aún no sincronizada') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
const WorkspaceSummaryCard = ({
  title,
  description,
  summary,
  icon: Icon,
}: {
  title: string;
  description: string;
  summary: WorkspaceSummary;
  icon: typeof Cloud;
}) => (
  <div className="rounded-card border border-line bg-white p-3.5 shadow-e1">
    <div className="flex items-start gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="font-extrabold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
    </div>
    <dl className="mt-3 grid gap-1.5 text-xs leading-5 text-ink-muted">
      <div className="flex justify-between gap-3"><dt>Carrito</dt><dd className="font-semibold text-ink">{summary.cartUnits} {summary.cartUnits === 1 ? 'unidad' : 'unidades'} · {summary.cartItems} {summary.cartItems === 1 ? 'producto' : 'productos'}</dd></div>
      <div className="flex justify-between gap-3"><dt>Favoritos</dt><dd className="font-semibold text-ink">{summary.favorites}</dd></div>
      <div className="flex justify-between gap-3"><dt>Borradores</dt><dd className="font-semibold text-ink">{summary.drafts}</dd></div>
    </dl>
    <p className="mt-2 border-t border-line pt-2 text-[11px] leading-5 text-ink-muted">
      {summary.cartNames.length > 0 ? summary.cartNames.join(' · ') : 'Sin productos en el carrito'}
    </p>
    <p className="mt-2 text-[11px] text-ink-muted">Última actualización: {formatWorkspaceDate(summary.updatedAt)}</p>
  </div>
);
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
  const [conflictDetails, setConflictDetails] = useState<{ account: WorkspaceSummary; device: WorkspaceSummary } | null>(null);
  const [pendingChoice, setPendingChoice] = useState<ConflictChoice | null>(null);
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
    setConflictDetails(null);
    setPendingChoice(null);
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
        setConflictDetails(null);
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
            if (valid()) {
              remote = latest.data.data as Workspace;
              setConflictDetails({
                account: summarizeWorkspace(remote),
                device: summarizeWorkspace(localData()),
              });
              setIssue(CONFLICT_MESSAGE);
            }
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
          setConflictDetails(null);
          setIssue('');
          schedule();
        } else if (remoteEmpty && !ready && remote!.revision === 1) {
          revision = 1;
          ready = true;
          savedHash = '';
          setConflictDetails(null);
          setIssue('');
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
          setConflictDetails({
            account: summarizeWorkspace(remote!),
            device: summarizeWorkspace(current),
          });
          setIssue(
            CONFLICT_MESSAGE,
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
          const latest = data.data as Workspace;
          remote = latest;
          revision = latest.revision;
          savedHash = '';
          ready = true;
          setConflict(false);
          setConflictDetails(null);
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
  const confirmChoice = () => {
    const choice = pendingChoice;
    setPendingChoice(null);
    if (choice === 'restore') controller.current?.restore();
    if (choice === 'keep') controller.current?.keep();
  };

  if (!issue && !conflict) return null;
  return (
    <>
      <aside role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-4 text-sm">
        {conflict ? (
          <div className="mx-auto max-w-6xl">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-card bg-amber-100 text-amber-800">
                <ShieldAlert className="size-5" />
              </span>
              <div>
                <p className="font-extrabold text-ink">Encontramos dos versiones de tu espacio de compra</p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
                  Revisa el contenido de cada versión antes de reemplazarla. Solo se conservará la opción que elijas.
                </p>
              </div>
            </div>

            {conflictDetails && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <WorkspaceSummaryCard
                  title="Versión de tu cuenta"
                  description="Guardada y disponible en todos tus dispositivos."
                  summary={conflictDetails.account}
                  icon={Cloud}
                />
                <WorkspaceSummaryCard
                  title="Cambios de este dispositivo"
                  description="Contenido local que todavía no se ha sincronizado."
                  summary={conflictDetails.device}
                  icon={Laptop}
                />
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button size="sm" onClick={() => setPendingChoice('restore')} leftIcon={<Cloud className="size-4" />}>
                Usar versión de mi cuenta
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPendingChoice('keep')} leftIcon={<Laptop className="size-4" />}>
                Conservar cambios de este dispositivo
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p>{issue}</p>
            <Button size="sm" variant="outline" onClick={() => controller.current?.retry()} leftIcon={<RefreshCw className="size-4" />}>
              Reintentar guardado
            </Button>
          </div>
        )}
      </aside>

      <Modal
        isOpen={pendingChoice !== null}
        onClose={() => setPendingChoice(null)}
        title={pendingChoice === 'restore' ? 'Usar la versión de tu cuenta' : 'Conservar los cambios de este dispositivo'}
        description="Esta decisión reemplazará la otra versión del espacio de compra."
        icon={pendingChoice === 'restore' ? Cloud : Laptop}
        eyebrow="Confirma la sincronización"
        maxWidth="sm"
        actions={(
          <>
            <Button variant="outline" onClick={() => setPendingChoice(null)}>Cancelar</Button>
            <Button onClick={confirmChoice}>
              {pendingChoice === 'restore' ? 'Usar versión de mi cuenta' : 'Conservar cambios'}
            </Button>
          </>
        )}
      >
        <div className="rounded-card border border-line bg-surface-muted/60 p-4 text-sm leading-6 text-ink-muted">
          {pendingChoice === 'restore'
            ? 'Se reemplazarán el carrito, favoritos y borradores de este dispositivo por la versión guardada en tu cuenta.'
            : 'Se subirán el carrito, favoritos y borradores de este dispositivo y reemplazarán la versión guardada en tu cuenta.'}
        </div>
      </Modal>
    </>
  );
}
