import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, ApiSuccess } from '@/types/api';

const TOKEN_KEY = 'verde-bowl:accessToken';
const REFRESH_KEY = 'verde-bowl:refreshToken';
let sessionRevision = 0;
let refreshing: Promise<string | null> | null = null;
const writeTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
};

export const tokenStorage = {
  isKey: (key: string) => key === TOKEN_KEY || key === REFRESH_KEY,
  invalidateRequests: () => { sessionRevision++; refreshing = null; },
  getAccess: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (accessToken: string, refreshToken: string) => {
    sessionRevision++;
    refreshing = null;
    writeTokens(accessToken, refreshToken);
  },
  clear: () => {
    sessionRevision++;
    refreshing = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 20_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request: adjunta el access token
type SessionRequest = InternalAxiosRequestConfig & { _retried?: boolean; _sessionRevision?: number };
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const request = config as SessionRequest;
  if (request._sessionRevision !== undefined && request._sessionRevision !== sessionRevision) {
    return Promise.reject(new AxiosError('La sesión cambió.', 'ERR_CANCELED', config));
  }
  request._sessionRevision = sessionRevision;
  const token = tokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: refresca el token una vez ante un 401 y reintenta la peticion original
const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return null;
  const revision = sessionRevision;

  try {
    const { data } = await axios.post<ApiSuccess<{ accessToken: string; refreshToken: string }>>(
      `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
      { refreshToken },
    );
    // Un refresh en vuelo no puede restaurar los tokens después de salir ni
    // reemplazar las credenciales de quien acaba de ingresar en otra cuenta.
    if (revision !== sessionRevision) return null;
    writeTokens(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken;
  } catch {
    return null;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as SessionRequest | undefined;
    const authEntry = /\/auth\/(?:login|register|logout|refresh|forgot-password|reset-password)(?:\?|$)/.test(original?.url ?? '');

    if (error.response?.status === 401 && original && !authEntry) {
      if (original._sessionRevision !== sessionRevision
        || (!tokenStorage.getAccess() && !tokenStorage.getRefresh())) return Promise.reject(error);
      if (original._retried) {
        tokenStorage.clear();
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(error);
      }
      original._retried = true;
      const revision = sessionRevision;
      const pending = refreshing ??= refreshAccessToken();
      const newToken = await pending;
      if (refreshing === pending) refreshing = null;
      if (revision !== sessionRevision) return Promise.reject(error);

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }

      // El refresh fallo: la sesion esta muerta. Avisamos a la app (SessionGate lo
      // escucha) para limpiar el estado de Redux y no seguir aparentando estar logueado.
      tokenStorage.clear();
      window.dispatchEvent(new Event('auth:logout'));
    }

    return Promise.reject(error);
  },
);

/** Mensaje legible de cualquier error del API (para toasts y formularios). */
export const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) {
      if (!navigator.onLine) return 'No tienes conexión. Conservamos tus cambios para que puedas reintentarlo.';
      if (error.code === 'ECONNABORTED') return 'La operación tardó demasiado. Revisa tu conexión e inténtalo nuevamente.';
      return 'No pudimos conectar con el servidor. Inténtalo nuevamente en unos segundos.';
    }
    const body = error.response?.data;

    /* 403 en jerga interna. El middleware de permisos respondia "Faltan permisos:
     * catalog.product.write", que al operario no le dice ni que hacer ni a quien
     * pedirlo, y de paso publica el mapa de permisos del sistema. El servidor ya
     * humaniza el mensaje; este respaldo cubre las rutas que aun no lo hagan y
     * cualquier 403 sin cuerpo. */
    if (error.response?.status === 403) {
      const serverMessage = body?.message?.trim();
      return !serverMessage || /^faltan permisos/i.test(serverMessage)
        ? 'No tienes permiso para realizar esta acción. Pídele acceso a un administrador.'
        : serverMessage;
    }

    const detail = body?.details?.[0];
    if (body?.code === 'VALIDATION_ERROR' && detail) {
      const field = detail.field.replace(/^(body|query|params)\./, '');
      const fieldLabels: Record<string, string> = {
        line1: 'dirección', districtId: 'distrito', latitude: 'ubicación', longitude: 'ubicación',
        contactName: 'nombre de contacto', contactPhone: 'teléfono', deliverySlotId: 'horario',
        name: 'nombre', phone: 'teléfono', polygon: 'área de cobertura',
      };
      const key = field.split('.').at(-1) ?? field;
      const label = fieldLabels[key] ?? key;
      return detail.message && detail.message !== 'Required'
        ? `${label ? `${label}: ` : ''}${detail.message}`
        : `Completa correctamente ${label || 'los datos ingresados'}`;
    }
    return body?.message ?? 'No se pudo conectar con el servidor';
  }
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado';
};

export default api;
