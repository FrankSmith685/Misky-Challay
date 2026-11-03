import { ROUTES } from '@constants/routes';
import type { CakePreviewSnapshot } from '../cakePreview.service';

export const publicCakeWebOrigin = () => {
  const configured = import.meta.env.VITE_PUBLIC_WEB_URL?.trim();
  const origin = configured ? new URL(configured).origin : window.location.origin;
  if (!/^https?:/.test(origin)) throw new Error('No se pudo preparar el enlace');
  return origin;
};
export const cakePreviewUrl = (token: string) => new URL(ROUTES.cakePreview(token), publicCakeWebOrigin()).toString();

export const cakePreviewDestination = (snapshot: CakePreviewSnapshot, token: string) => {
  const query = new URLSearchParams();
  if (snapshot.themeSlug) query.set('diseno', snapshot.themeSlug);
  if (snapshot.configuration) query.set('vista', token);
  return `${ROUTES.cake(snapshot.productSlug)}${query.size ? `?${query.toString()}` : ''}`;
};

export const isLocalPreviewUrl = (url: string) => /^(localhost|127(?:\.\d+){3}|\[?::1\]?)$/.test(new URL(url).hostname);
