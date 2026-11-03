import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ApiRequestError } from '../services/api/client';

/**
 * Hook unico de lectura de datos. Resuelve de una vez lo que hasta ahora cada
 * pantalla improvisaba: los cuatro estados, la cancelacion al desmontar, la
 * cache entre visitas y el refresco al volver a la pantalla.
 *
 * Ejemplo tipico — el menu:
 *
 *   const branchId = branch?.id ?? null;
 *   const menu = useResource<Product[]>({
 *     key: `catalog:products:${branchId}:${categoryId ?? 'todas'}`,
 *     fetcher: () => catalogApi.products({ branchId, categoryId }),
 *   });
 *
 *   if (menu.loading) return <Skeleton.List />;
 *   if (menu.error) return <ErrorState message={menu.error.message} onRetry={menu.refetch} />;
 *   return (
 *     <FlatList
 *       data={menu.data ?? []}
 *       keyExtractor={(item) => String(item.id)}
 *       refreshing={menu.refreshing}
 *       onRefresh={menu.refresh}
 *       renderItem={({ item }) => <ProductCard product={item} />}
 *     />
 *   );
 *
 * Y tras guardar una direccion nueva:
 *
 *   await accountApi.createAddress(input);
 *   invalidateResource('account:addresses');  // cualquier pantalla montada se actualiza sola
 *
 * Es un hook de LECTURA. Las mutaciones se llaman directamente al servicio:
 * aqui hay reintentos automaticos y no se puede reintentar un POST a ciegas.
 */

const MAX_RETRIES = 2;
const DEFAULT_CACHE_MS = 60_000;

interface CacheEntry {
  value: unknown;
  at: number;
}

/** Cache de proceso: se vacia sola al cerrar la app, que es justo lo que queremos. */
const cache = new Map<string, CacheEntry>();
/** Peticiones en vuelo por clave: dos pantallas que piden lo mismo comparten una sola. */
const inflight = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;
const revisions = new Map<string, number>();
class ResourceInvalidatedError extends Error {}
/** Hooks montados por clave, para que una invalidacion los despierte. */
const listeners = new Map<string, Set<(reset?: boolean) => void>>();

const notify = (key: string, reset = false): void => {
  listeners.get(key)?.forEach((listener) => listener(reset));
};

/**
 * Marca una clave como caducada y avisa a las pantallas montadas que la usan.
 * Con `prefix` invalida toda una familia: invalidateResource('orders:', { prefix: true }).
 * Sin argumentos vacia la cache entera (util al cerrar sesion).
 */
export function invalidateResource(key?: string, options?: { prefix?: boolean; reset?: boolean }): void {
  if (key === undefined) {
    const keys = [...cache.keys(), ...listeners.keys()];
    cacheGeneration += 1;
    inflight.clear();
    revisions.clear();
    cache.clear();
    new Set(keys).forEach((entry) => notify(entry, options?.reset ?? true));
    return;
  }

  if (options?.prefix) {
    const affected = new Set(
      [...cache.keys(), ...listeners.keys(), ...inflight.keys()].filter((entry) => entry.startsWith(key)),
    );
    affected.forEach((entry) => {
      cache.delete(entry);
      inflight.delete(entry);
      revisions.set(entry, (revisions.get(entry) ?? 0) + 1);
    });
    affected.forEach((entry) => notify(entry, options?.reset ?? false));
    return;
  }

  cache.delete(key);
  inflight.delete(key);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  notify(key, options?.reset ?? false);
}

/** Siembra la cache con un valor que ya tienes (por ejemplo el detalle que venia en la lista). */
export function primeResource<T>(key: string, value: T): void {
  cache.set(key, { value, at: Date.now() });
}

const readCache = (key: string): CacheEntry | undefined => cache.get(key);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Un 4xx no mejora por repetirlo: solo reintentamos cuando el fallo es de red
 * (sin status) o del servidor.
 */
const isRetriable = (error: unknown): boolean => {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.code === 'SESSION_CHANGED') return false;
  return error.status === undefined || error.status >= 500;
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('No pudimos cargar esta información.');

const attempt = async <T>(fetcher: () => Promise<T>, retries: number): Promise<T> => {
  let lastError: unknown = null;
  for (let index = 0; index <= retries; index += 1) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error;
      if (index === retries || !isRetriable(error)) break;
      await wait(400 * 2 ** index); // 400 ms y luego 800 ms
    }
  }
  throw toError(lastError);
};

/** Deduplica: si ya hay una peticion viva para esta clave, se comparte su promesa. */
const runFetch = <T>(key: string, fetcher: () => Promise<T>, retries: number): Promise<T> => {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const generation = cacheGeneration;
  const revision = revisions.get(key) ?? 0;

  const promise = attempt(fetcher, retries).then(
    (value) => {
      if (inflight.get(key) === promise) inflight.delete(key);
      if (generation !== cacheGeneration || revision !== (revisions.get(key) ?? 0)) throw new ResourceInvalidatedError();
      cache.set(key, { value, at: Date.now() });
      return value;
    },
    (error: unknown) => {
      if (inflight.get(key) === promise) inflight.delete(key);
      throw toError(error);
    },
  );

  inflight.set(key, promise);
  return promise;
};

export interface UseResourceOptions<T> {
  /**
   * Identidad del dato. Cambiarla carga otra cosa; ponerla a `null` deja el hook
   * dormido (util cuando aun no hay sesion o falta un parametro de la ruta).
   */
  key: string | null;
  fetcher: () => Promise<T>;
  /** Alternativa a `key: null` cuando la condicion se lee mejor aparte. */
  enabled?: boolean;
  /** Solo se reintenta en GET. Las lecturas por POST (cotizar, cobertura) no se repiten. */
  method?: 'GET' | 'POST';
  /** Revalidar al volver a la pantalla si el dato ya caduco. Por defecto, si. */
  refetchOnFocus?: boolean;
  /** Sondeo en milisegundos (seguimiento del pedido). Se detiene en segundo plano. */
  pollIntervalMs?: number;
  /** Cuanto vale el dato en cache antes de revalidar. Por defecto, un minuto. */
  cacheMs?: number;
}

export interface UseResourceResult<T> {
  data: T | null;
  error: Error | null;
  /** Primera carga sin nada que pintar: toca esqueleto. */
  loading: boolean;
  /** Ya hay contenido y se esta revalidando: toca RefreshControl. */
  refreshing: boolean;
  /** Reintento explicito (el boton del estado de error). */
  refetch: () => Promise<void>;
  /** Gesto de tirar para refrescar. */
  refresh: () => Promise<void>;
  /** Escribe el dato a mano, en cache y en pantalla (actualizacion optimista). */
  mutate: (value: T) => void;
}

type LoadMode = 'initial' | 'refresh' | 'silent';

interface ResourceState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
}

const emptyState = <T>(): ResourceState<T> => ({
  data: null,
  error: null,
  loading: false,
  refreshing: false,
});

export function useResource<T>(options: UseResourceOptions<T>): UseResourceResult<T> {
  const {
    key,
    fetcher,
    enabled = true,
    method = 'GET',
    refetchOnFocus = true,
    pollIntervalMs = 0,
    cacheMs = DEFAULT_CACHE_MS,
  } = options;

  const isActive = enabled && key !== null;
  const retries = method === 'GET' ? MAX_RETRIES : 0;

  // El fetcher casi siempre es una lambda nueva en cada render. Guardarlo en una
  // ref evita que los efectos se reinicien cuando en realidad nada ha cambiado.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Ni escribimos estado tras desmontar ni aceptamos la respuesta de una clave
  // que ya no es la que se esta mirando.
  const mountedRef = useRef(true);
  const keyRef = useRef(key);
  const dataKeyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [state, setState] = useState<ResourceState<T>>(() => {
    if (!isActive || key === null) return emptyState<T>();
    const cached = readCache(key);
    if (!cached) return { data: null, error: null, loading: true, refreshing: false };
    return { data: cached.value as T, error: null, loading: false, refreshing: false };
  });

  const load = useCallback(
    async (mode: LoadMode): Promise<void> => {
      if (!isActive || key === null) return;

      if (mode !== 'silent') {
        setState((prev) => ({
          data: prev.data,
          error: null,
          loading: mode === 'initial' && prev.data === null,
          refreshing: mode === 'refresh' || prev.data !== null,
        }));
      }

      const generation = cacheGeneration;
      const revision = revisions.get(key) ?? 0;
      try {
        const value = await runFetch<T>(key, () => fetcherRef.current(), retries);
        if (!mountedRef.current || keyRef.current !== key || generation !== cacheGeneration || revision !== (revisions.get(key) ?? 0)) return;
        setState({ data: value, error: null, loading: false, refreshing: false });
      } catch (error) {
        if (error instanceof ResourceInvalidatedError || (error instanceof ApiRequestError && error.code === 'SESSION_CHANGED')) return;
        if (!mountedRef.current || keyRef.current !== key || generation !== cacheGeneration || revision !== (revisions.get(key) ?? 0)) return;
        setState((prev) => ({
          data: prev.data,
          error: toError(error),
          loading: false,
          refreshing: false,
        }));
      }
    },
    [isActive, key, retries],
  );

  // Carga inicial y cambio de clave.
  useEffect(() => {
    dataKeyRef.current = key;
    if (!isActive || key === null) {
      setState(emptyState<T>());
      return;
    }

    const cached = readCache(key);
    if (cached) {
      setState({ data: cached.value as T, error: null, loading: false, refreshing: false });
      // Dato fresco: no molestamos al servidor.
      if (Date.now() - cached.at <= cacheMs) return;
    } else {
      setState({ data: null, error: null, loading: true, refreshing: false });
    }

    void load('initial');
  }, [cacheMs, isActive, key, load]);

  // Invalidacion desde fuera: alguien guardo algo y esta clave dejo de valer.
  useEffect(() => {
    if (!isActive || key === null) return;

    const handler = (reset = false) => {
      if (reset) setState({ data: null, error: null, loading: true, refreshing: false });
      void load('silent');
    };
    const set = listeners.get(key) ?? new Set<(reset?: boolean) => void>();
    set.add(handler);
    listeners.set(key, set);

    return () => {
      set.delete(handler);
      if (set.size === 0) listeners.delete(key);
    };
  }, [isActive, key, load]);

  // Volver a la pantalla revalida, pero solo si el dato ya cumplio su tiempo de
  // vida. La deduplicacion se encarga de que esto no duplique la carga inicial.
  useFocusEffect(
    useCallback(() => {
      if (!refetchOnFocus || !isActive || key === null) return;
      const cached = readCache(key);
      if (cached && Date.now() - cached.at < cacheMs) return;
      void load('silent');
    }, [cacheMs, isActive, key, load, refetchOnFocus]),
  );

  // Sondeo: solo con la app en primer plano. Un pedido en curso no justifica
  // gastar bateria y datos mientras el telefono esta en el bolsillo.
  useEffect(() => {
    if (pollIntervalMs <= 0 || !isActive || key === null) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => {
          void load('silent');
        }, pollIntervalMs);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (AppState.currentState === 'active') start();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void load('silent');
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [isActive, key, load, pollIntervalMs]);

  const refetch = useCallback(() => load('initial'), [load]);
  const refresh = useCallback(() => load('refresh'), [load]);

  const mutate = useCallback(
    (value: T) => {
      if (keyRef.current !== key || !mountedRef.current) return;
      dataKeyRef.current = key;
      if (key !== null) primeResource(key, value);
      setState({ data: value, error: null, loading: false, refreshing: false });
    },
    [key],
  );

  return {
    data: dataKeyRef.current === key ? state.data : null,
    error: dataKeyRef.current === key ? state.error : null,
    loading: dataKeyRef.current !== key || state.loading,
    refreshing: dataKeyRef.current === key && state.refreshing,
    refetch,
    refresh,
    mutate,
  };
}
