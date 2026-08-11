import { env } from '../../config/env';
import { secureSession, type StoredSession } from '../session/secureSession';
import { ENDPOINTS } from './endpoints';

/** Sobre de paginacion del backend (shared/http/ApiResponse.ts). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  /** Solo viaja en las listas paginadas (hoy: el historial de pedidos). */
  meta?: PaginationMeta;
}

interface ApiFailure {
  success?: false;
  message?: string;
  code?: string;
  details?: Array<{ field?: string; message?: string }>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: ApiFailure['details'],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, QueryValue>;
  auth?: boolean;
  timeoutMs?: number;
}

const buildUrl = (path: string, query?: Record<string, QueryValue>) => {
  const queryString = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${env.apiUrl}${path}${queryString ? `?${queryString}` : ''}`;
};

const perform = async (
  path: string,
  options: ApiRequestOptions,
  accessToken?: string | null,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const { query: _query, auth: _auth, timeoutMs: _timeoutMs, body, ...requestOptions } = options;
  try {
    return await fetch(buildUrl(path, options.query), {
      ...requestOptions,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiRequestError('El servidor tardó demasiado en responder.');
    }
    // El mensaje al usuario es genérico a propósito, pero el motivo real (DNS,
    // cleartext bloqueado, host inalcanzable) solo lo trae el error original.
    // En una build de tienda no se registra: la URL del API y el fallo exacto
    // son ruido para el usuario y pista para quien lea el log del dispositivo.
    if (__DEV__) {
      console.warn(`[api] falló ${buildUrl(path, options.query)}:`, error);
    }
    throw new ApiRequestError('No pudimos conectar con el servidor. Revisa tu conexión.');
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Generación de sesión. Cada cierre de sesión (o borrado de cuenta) la
 * incrementa, y toda renovación en vuelo que termine después queda invalidada.
 *
 * Sin esto pasaba lo siguiente: el usuario pulsa «Cerrar sesión» mientras una
 * petición 401 está renovando el token; la renovación termina más tarde y
 * escribe tokens válidos sobre el almacén ya vaciado, así que en el siguiente
 * arranque la app volvía a entrar sin pedir contraseña.
 */
let sessionGeneration = 0;

/** La llama SessionProvider al cerrar sesión, antes o después de limpiar el almacén. */
export const invalidateSession = (): void => {
  sessionGeneration += 1;
  refreshing = null;
};

type SessionExpiredListener = () => void;

const expiredListeners = new Set<SessionExpiredListener>();

/**
 * CIERRE DE SESIÓN GLOBAL.
 *
 * Cuando la renovación del refresh deja de servir, aquí se borran los tokens. Si
 * eso ocurriera en silencio, la interfaz seguiría mostrando al cliente conectado
 * y todas las pantallas devolverían errores genéricos hasta que reiniciara la
 * app. El aviso vive en esta capa, y no en el proveedor de React, porque quien
 * descubre la caducidad es la red: así no hay ciclo de importación ni hace falta
 * que nadie vaya sondeando el almacén seguro en cada navegación.
 *
 * Devuelve la función para darse de baja.
 */
export const onSessionExpired = (listener: SessionExpiredListener): (() => void) => {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
};

/** Lo puede llamar cualquiera que descubra que la sesión ya no vale. */
export const notifySessionExpired = (): void => {
  expiredListeners.forEach((listener) => listener());
};

let refreshing: Promise<StoredSession | null> | null = null;

const refreshTokens = async (): Promise<StoredSession | null> => {
  const generation = sessionGeneration;
  const current = await secureSession.read();
  if (!current?.refreshToken) return null;

  const response = await perform(ENDPOINTS.auth.refresh, {
    method: 'POST',
    body: { refreshToken: current.refreshToken },
  });
  const payload = (await response.json().catch(() => null)) as
    | ApiSuccess<{ accessToken: string; refreshToken: string }>
    | ApiFailure
    | null;

  // La sesión cambió mientras renovábamos: no tocamos el almacén ni para
  // escribir ni para limpiar, porque puede haber ya otra sesión legítima dentro.
  if (generation !== sessionGeneration) return null;

  if (!response.ok || !payload || payload.success !== true) {
    await secureSession.clear();
    // El refresh caducó de verdad: la interfaz tiene que enterarse ahora, no en
    // el próximo arranque de la app.
    notifySessionExpired();
    return null;
  }

  const session = {
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
  };
  await secureSession.write(session);
  return session;
};

const parseResponse = async <T>(response: Response): Promise<ApiSuccess<T>> => {
  if (response.status === 204) {
    return { success: true, message: '', data: null as T };
  }
  const payload = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (!response.ok || !payload || payload.success !== true) {
    const failure = payload as ApiFailure | null;
    throw new ApiRequestError(
      failure?.details?.[0]?.message || failure?.message || 'No se pudo completar la solicitud.',
      response.status,
      failure?.code,
      failure?.details,
    );
  }
  return payload;
};

/** Devuelve el sobre completo: úsalo cuando necesites `meta` además de `data`. */
export async function apiCall<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiSuccess<T>> {
  const session = options.auth ? await secureSession.read() : null;
  let response = await perform(path, options, session?.accessToken);

  if (response.status === 401 && options.auth && session?.refreshToken) {
    refreshing = refreshing ?? refreshTokens();
    let renewed: StoredSession | null;
    try {
      renewed = await refreshing;
    } finally {
      // Un fallo de red no debe dejar un Promise rechazado reutilizándose para
      // siempre: la siguiente petición puede volver a intentar la renovación.
      refreshing = null;
    }
    if (renewed) response = await perform(path, options, renewed.accessToken);
  }

  return parseResponse<T>(response);
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return (await apiCall<T>(path, options)).data;
}

export interface PagedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Lista paginada. Antes las pantallas usaban `apiRequest`, que descarta el sobre,
 * y el historial se quedaba mudo en los 20 primeros pedidos sin manera de saber
 * que había más. Si el endpoint no devuelve `meta`, se asume una única página.
 */
export async function apiPaged<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<PagedResult<T>> {
  const envelope = await apiCall<T[]>(path, options);
  const items = envelope.data ?? [];
  return {
    items,
    meta: envelope.meta ?? {
      page: 1,
      pageSize: items.length,
      total: items.length,
      totalPages: 1,
    },
  };
}
