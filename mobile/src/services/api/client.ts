import { env } from '../../config/env';
import { secureSession, type StoredSession } from '../session/secureSession';
import { ENDPOINTS } from './endpoints';

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
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
    // cleartext bloqueado, host inalcanzable) solo lo trae el error original,
    // así que queda en logcat incluso en builds internas.
    console.warn(`[api] falló ${buildUrl(path, options.query)}:`, error);
    throw new ApiRequestError('No pudimos conectar con el servidor. Revisa tu conexión.');
  } finally {
    clearTimeout(timeout);
  }
};

let refreshing: Promise<StoredSession | null> | null = null;

const refreshTokens = async (): Promise<StoredSession | null> => {
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

  if (!response.ok || !payload || payload.success !== true) {
    await secureSession.clear();
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

export async function apiCall<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiSuccess<T>> {
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
