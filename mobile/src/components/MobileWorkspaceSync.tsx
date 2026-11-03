import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '../providers/SessionProvider';
import { useCart } from '../providers/CartProvider';
import { apiRequest, ApiRequestError } from '../services/api/client';
import { PrimaryButton } from './PrimaryButton';
import type { CartItem } from '../types/domain';
interface Workspace {
  revision: number;
  cart: Array<Record<string, unknown>>;
  favorites: unknown[];
  drafts: Record<string, unknown>;
}
const markerKey = 'dulceflow:workspace-sync:v1';
const fingerprint = (value: unknown) => {
  let hash = 2166136261;
  for (const character of JSON.stringify(value))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return String(hash >>> 0);
};
function canonical(items: CartItem[]) {
  return items.map((item) => ({
    ...item,
    name: item.productName,
    archivedAiProposalDataUrl: item.aiProposalDataUrl,
    extrasTotal: 0,
    selections: item.selections.map((selection) => ({
      groupId: 0,
      priceDelta: 0,
      groupName: 'Personalización',
      optionName: 'Elección',
      ...selection,
    })),
  }));
}
async function files(value: unknown, upload: boolean, valid: () => boolean): Promise<unknown> {
  if (!valid()) throw new Error('La sesión cambió.');
  if (upload && typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(value)) {
    const result = await apiRequest<{ mediaId: string }>('/customer/media', {
      method: 'POST',
      auth: true,
      body: { dataUrl: value },
    });
    return { $media: result.mediaId };
  }
  if (!upload && value && typeof value === 'object' && '$media' in value)
    return (
      await apiRequest<{ dataUrl: string }>(`/customer/media/${String(value.$media)}`, {
        auth: true,
      })
    ).dataUrl;
  if (Array.isArray(value)) return Promise.all(value.map((item) => files(item, upload, valid)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, entry]) => [key, await files(entry, upload, valid)]),
      ),
    );
  return value;
}
/** The account owns the cart; a version conflict always needs an explicit choice. */
export function MobileWorkspaceSync() {
  const { status, user } = useSession();
  const { items, hydrated, replaceItems, persistenceError } = useCart();
  const current = useRef({ items, userId: user?.id, status });
  current.current = { items, userId: user?.id, status };
  const actions = useRef<
    | {
        retry: () => void;
        restore: () => void;
        keep: () => void;
        save: () => void;
      }
    | undefined
  >(undefined);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    let active = true,
      busy = false,
      ready = false,
      revision = 0,
      saved = '';
    let remote: Workspace | null = null;
    const userId = user?.id;
    const valid = () =>
      active && current.current.userId === userId && current.current.status === 'authenticated';
    setMessage('');
    setConflict(false);
    if (status !== 'authenticated' || !userId || !hydrated) return;
    const mark = async () =>
      AsyncStorage.setItem(markerKey, JSON.stringify({ userId, hash: saved }));
    const restore = async () => {
      if (busy || !remote) return;
      busy = true;
      try {
        const restored = (await files(remote.cart, false, valid)) as Array<Record<string, unknown>>;
        if (!valid()) return;
        const next = restored.map((item) => ({
          ...item,
          productName: String(item.name ?? item.productName ?? 'Producto'),
          unitPrice: Number(item.unitPrice) + Number(item.extrasTotal ?? 0),
          description: String(item.description ?? item.variantName ?? ''),
          aiProposalDataUrl:
            (item.cakeAiProposal as { dataUrl?: string } | undefined)?.dataUrl ??
            item.archivedAiProposalDataUrl ??
            item.aiProposalDataUrl,
        })) as unknown as CartItem[];
        revision = remote.revision;
        saved = fingerprint(canonical(next));
        ready = true;
        replaceItems(next);
        await mark();
        if (valid()) {
          setConflict(false);
          setMessage('');
        }
      } catch (error) {
        if (valid())
          setMessage(error instanceof Error ? error.message : 'No pudimos recuperar el carrito.');
      } finally {
        busy = false;
      }
    };
    const save = async () => {
      if (!ready || busy || !remote || !valid()) return;
      const snapshot = canonical(current.current.items);
      const hash = fingerprint(snapshot);
      if (hash === saved) return;
      busy = true;
      try {
        const cart = await files(snapshot, true, valid);
        if (!valid()) return;
        const result = await apiRequest<Workspace>('/customer/workspace', {
          method: 'PUT',
          auth: true,
          body: { revision, cart, favorites: remote.favorites, drafts: remote.drafts },
        });
        if (!valid()) return;
        remote = result;
        revision = result.revision;
        saved = hash;
        await mark();
        setMessage('');
      } catch (error) {
        if (!valid()) return;
        setMessage(error instanceof Error ? error.message : 'No pudimos guardar el carrito.');
        if (error instanceof ApiRequestError && error.status === 409) {
          ready = false;
          setConflict(true);
          try {
            const latest = await apiRequest<Workspace>('/customer/workspace', { auth: true });
            if (valid()) remote = latest;
          } catch (recoveryError) {
            if (valid())
              setMessage(
                recoveryError instanceof Error
                  ? recoveryError.message
                  : 'No pudimos recuperar la versi?n guardada.',
              );
          }
        }
      } finally {
        busy = false;
      }
    };
    const refresh = async () => {
      if (busy || !valid()) return;
      try {
        const result = await apiRequest<Workspace>('/customer/workspace', { auth: true });
        if (!valid()) return;
        if (ready && result.revision === revision) {
          remote = result;
          await save();
          return;
        }
        remote = result;
        const hash = fingerprint(canonical(current.current.items));
        const marker = JSON.parse((await AsyncStorage.getItem(markerKey)) ?? 'null') as {
          userId: number;
          hash: string;
        } | null;
        if (!result.cart.length && result.revision === 1) {
          revision = result.revision;
          ready = true;
          saved = '';
          await save();
        } else if (
          !current.current.items.length ||
          (marker?.userId === userId && marker.hash === hash)
        )
          await restore();
        else {
          ready = false;
          setConflict(true);
          setMessage(
            'Hay un carrito guardado en tu cuenta y cambios en este teléfono. Elige cuál conservar.',
          );
        }
      } catch (error) {
        if (valid())
          setMessage(error instanceof Error ? error.message : 'No pudimos sincronizar tu carrito.');
      }
    };
    actions.current = {
      retry: () => void refresh(),
      restore: () => void restore(),
      save: () => void save(),
      keep: () => {
        void (async () => {
          const latest = await apiRequest<Workspace>('/customer/workspace', { auth: true });
          if (!valid()) return;
          remote = latest;
          revision = latest.revision;
          saved = '';
          ready = true;
          setConflict(false);
          await save();
        })().catch((error) => setMessage(error.message));
      },
    };
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30000);
    void refresh();
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
      actions.current = undefined;
    };
  }, [user?.id, status, hydrated, replaceItems]);
  useEffect(() => {
    const timer = setTimeout(() => actions.current?.save(), 1000);
    return () => clearTimeout(timer);
  }, [items]);
  if (!message && !conflict && !persistenceError) return null;
  return (
    <View style={{ backgroundColor: '#fff7e5', padding: 12, gap: 8 }}>
      <Text accessibilityLiveRegion="polite">
        {message ||
          (persistenceError
            ? 'El teléfono no pudo guardar tus cambios. Mantén la app abierta hasta guardarlos en tu cuenta.'
            : '')}
      </Text>
      {conflict ? (
        <>
          <PrimaryButton
            label="Recuperar carrito de mi cuenta"
            variant="secondary"
            onPress={() => actions.current?.restore()}
          />
          <PrimaryButton
            label="Guardar carrito de este teléfono"
            variant="secondary"
            onPress={() => actions.current?.keep()}
          />
        </>
      ) : (
        <PrimaryButton
          label="Reintentar guardado"
          variant="ghost"
          onPress={() => actions.current?.retry()}
        />
      )}
    </View>
  );
}
