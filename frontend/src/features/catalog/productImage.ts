import type { Product } from './types';
import type { ProductFamily } from './pastry';

const GENERIC_IMAGES = new Set([
  '/images/cakes/custom.png',
  '/images/cakes/custom.svg',
  '/images/cakes/special.png',
  '/images/cakes/special.svg',
]);

const FAMILY_FALLBACKS: Record<ProductFamily, string[]> = {
  CAKE: [
    '/images/cakes/custom.png',
    '/images/cake-themes/flores-delicadas.png',
    '/images/cake-themes/celebracion-dos-pisos.png',
    '/images/cake-themes/dinosaurio-3d.png',
  ],
  DESSERT: [
    '/images/pastry/cheesecake-maracuya.png',
    '/images/pastry/fatia-chocolate.png',
    '/images/pastry/fatia-tiramisu.png',
  ],
  NOUGAT: ['/images/pastry/turron-almendras.png', '/images/pastry/turron-dona-pepa.png'],
  BITES: [
    '/images/pastry/brownie-almendras.png',
    '/images/pastry/mini-alfajores.png',
    '/images/pastry/trufas-cacao.png',
  ],
};

const KEYWORD_IMAGES: Array<[RegExp, string]> = [
  [/tiramis[uú]/i, '/images/pastry/fatia-tiramisu.png'],
  [/fatia.*chocolate|chocolate.*intenso/i, '/images/pastry/fatia-chocolate.png'],
  [/cheesecake|maracuy[aá]/i, '/images/pastry/cheesecake-maracuya.png'],
  [/brownie|almendra/i, '/images/pastry/brownie-almendras.png'],
  [/alfajor/i, '/images/pastry/mini-alfajores.png'],
  [/trufa/i, '/images/pastry/trufas-cacao.png'],
  [/turr[oó]n.*almendra|almendra.*turr[oó]n/i, '/images/pastry/turron-almendras.png'],
  [/turr[oó]n|dona.?pepa/i, '/images/pastry/turron-dona-pepa.png'],
  [/vainilla/i, '/images/cakes/vanilla.svg'],
  [/chocolate|fudge/i, '/images/pastry/torta-chocolate.png'],
  [/fresa|frutilla/i, '/images/pastry/torta-fresas.png'],
];

/**
 * Evita que un placeholder editorial se repita en todo el catálogo.
 * Las fotos/ilustraciones propias del catálogo se conservan; solo se sustituye
 * una imagen genérica cuando existe una alternativa local coherente.
 */
export const productImage = (product: Pick<Product, 'id' | 'name' | 'slug' | 'family' | 'cakeSaleMode' | 'imageUrl' | 'categoryImageUrl'>): string | null => {
  const image = product.imageUrl ?? product.categoryImageUrl ?? null;
  const isBuilder = product.cakeSaleMode === 'SEMI_CUSTOM' || product.cakeSaleMode === 'ADVANCED';
  if (image && (!GENERIC_IMAGES.has(image) || isBuilder)) return image;

  const text = `${product.name} ${product.slug}`;
  const keywordMatch = KEYWORD_IMAGES.find(([pattern]) => pattern.test(text));
  if (keywordMatch) return keywordMatch[1];

  const family = product.family ?? 'CAKE';
  const options = FAMILY_FALLBACKS[family];
  return options[product.id % options.length] ?? image;
};
