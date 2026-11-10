import { ROUTES } from '@constants/routes';
import type { CakePreviewSnapshot } from '../cakePreview.service';

export const CAKE_AR_TARGET = '/images/brand/patisserie-chocolate-v1.jpg';
export const CAKE_AR_COMPILED_TARGET = '/ar/misky-card-v1.mind';
export const cakeArPath = (token?: string) => token
  ? `${ROUTES.cakeAr}?vista=${encodeURIComponent(token)}&camera=1`
  : `${ROUTES.cakeAr}?camera=1`;

/** This demo is illustrative, independent of the changing product catalog. */
export const cakeArDemo: CakePreviewSnapshot = {
  productId: 0, productSlug: 'experiencia-misky', productName: 'Un momento Misky',
  variantId: 0, variantName: 'Torta ilustrativa', diameterCm: 18, servings: 12,
  themeName: null, themeSlug: null,
  options: [
    { groupName: 'Bizcocho', optionName: 'Chocolate', quantity: 1 },
    { groupName: 'Relleno', optionName: 'Manjar blanco', quantity: 1 },
    { groupName: 'Cobertura', optionName: 'Chocolate', quantity: 1 },
  ],
};

export interface CakeArInput { snapshot: CakePreviewSnapshot; expiresAt?: string }
export type CakeArStatus = 'loading' | 'scanning' | 'found' | 'lost' | 'error';
export const CAKE_AR_CHANNEL = 'misky-card-ar-v1';
