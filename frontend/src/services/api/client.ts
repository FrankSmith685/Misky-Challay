import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, ApiSuccess } from '@/types/api';

const TOKEN_KEY = 'verde-bowl:accessToken';
const REFRESH_KEY = 'verde-bowl:refreshToken';

export const tokenStorage = {
  getAccess: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
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
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: refresca el token una vez ante un 401 y reintenta la peticion original
let refreshing: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<ApiSuccess<{ accessToken: string; refreshToken: string }>>(
      `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
      { refreshToken },
    );
    tokenStorage.set(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken;
  } catch {
    tokenStorage.clear();
    return null;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;

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
  return 'Ocurrió un error inesperado';
};

export default api;
