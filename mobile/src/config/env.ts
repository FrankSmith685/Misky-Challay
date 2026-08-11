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

export const resolvePublicAssetUrl = (value?: string | null): string | null => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${env.webUrl}${value.startsWith('/') ? value : `/${value}`}`;
};
