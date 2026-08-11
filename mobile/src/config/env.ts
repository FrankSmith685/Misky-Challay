const DEFAULT_API_URL = 'http://localhost:4000/api/v1';
const DEFAULT_WEB_URL = 'http://localhost:5173';

const normalizeUrl = (value: string): string => value.trim().replace(/\/+$/, '');
const configuredApiUrl = normalizeUrl(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL);
const inferredWebUrl = configuredApiUrl
  .replace(/\/api\/v1$/i, '')
  .replace(/:4000$/i, ':5173');

export const env = {
  apiUrl: configuredApiUrl,
  webUrl: normalizeUrl(process.env.EXPO_PUBLIC_WEB_URL || inferredWebUrl || DEFAULT_WEB_URL),
} as const;

export const apiUrlUsesLoopback = /:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(
  env.apiUrl,
);

/** Origen del backend sin el sufijo de version: http://host:4000 a partir de .../api/v1. */
const apiOrigin = configuredApiUrl.replace(/\/api\/v\d+$/i, '');

export const resolvePublicAssetUrl = (value?: string | null): string | null => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const path = value.startsWith('/') ? value : `/${value}`;
  // Las imagenes subidas por el negocio las sirve el backend bajo /api/v1/media/files/...
  // (media.service.ts las guarda con esa ruta). Resolverlas contra la web solo funciona en
  // desarrollo, porque Vite proxya /api; en produccion el dominio web no tiene por que hacerlo
  // y el menu se quedaria entero sin fotos. Los assets estaticos del catalogo (/images/...)
  // si los sirve la web.
  return `${path.startsWith('/api/') ? apiOrigin : env.webUrl}${path}`;
};
