import type { Category } from './types';

/** Imágenes editoriales compartidas por la portada y el menú. */
export const CATEGORY_IMAGES: Record<string, string> = {
  cakes: '/images/categories/promo-tortas.jpg',
  tortas: '/images/categories/promo-tortas.jpg',
  'tortas-24-horas': '/images/categories/promo-tortas-24-horas.jpg',
  '24-horas': '/images/categories/promo-tortas-24-horas.jpg',
  postres: '/images/categories/promo-postres.jpg',
  turrones: '/images/categories/promo-turrones.jpg',
  kekes: '/images/cakes/vanilla.svg',
  porciones: '/images/categories/promo-porciones.jpg',
  bocaditos: '/images/categories/promo-bocaditos.jpg',
  fatias: '/images/pastry/fatia-chocolate.svg',
  minimaria: '/images/categories/promo-minimaria.jpg',
  cuchareables: '/images/categories/promo-cuchareables.jpg',
  'sugar-free': '/images/categories/promo-postres.jpg',
  engreido: '/images/categories/promo-para-tu-engreido.jpg',
  'para-tu-engreido': '/images/categories/promo-para-tu-engreido.jpg',
  boxes: '/images/categories/promo-para-tu-engreido.jpg',
};

export const categoryImage = (category: Pick<Category, 'name' | 'slug' | 'imageUrl'>): string | null => {
  // La imagen guardada por el superadmin tiene prioridad sobre el fallback
  // editorial para que los cambios del panel se reflejen en portada y menú.
  if (category.imageUrl) return category.imageUrl;

  const direct = CATEGORY_IMAGES[category.slug.toLowerCase()];
  if (direct) return direct;

  const text = `${category.slug} ${category.name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (text.includes('24') || text.includes('hora')) return CATEGORY_IMAGES['tortas-24-horas'];
  if (text.includes('torta')) return CATEGORY_IMAGES.tortas;
  if (text.includes('postre')) return CATEGORY_IMAGES.postres;
  if (text.includes('turron')) return CATEGORY_IMAGES.turrones;
  if (text.includes('keke')) return CATEGORY_IMAGES.kekes;
  if (text.includes('porcion')) return CATEGORY_IMAGES.porciones;
  if (text.includes('bocad')) return CATEGORY_IMAGES.bocaditos;
  if (text.includes('fatia')) return CATEGORY_IMAGES.fatias;
  if (text.includes('mini')) return CATEGORY_IMAGES.minimaria;
  if (text.includes('cuchare')) return CATEGORY_IMAGES.cuchareables;
  if (text.includes('engre')) return CATEGORY_IMAGES.engreido;

  return null;
};
