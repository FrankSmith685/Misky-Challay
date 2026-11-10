import { ROUTES } from '@constants/routes';

export const PRODUCT_FAMILIES = {
  CAKE: 'Tortas', DESSERT: 'Postres', NOUGAT: 'Turrones', BITES: 'Bocaditos',
} as const;
export type ProductFamily = keyof typeof PRODUCT_FAMILIES;
export type PreparationMode = 'MADE_TO_ORDER' | 'READY_STOCK';
export const PREPARATION_MODES = { MADE_TO_ORDER: 'Por encargo', READY_STOCK: 'Producto preparado' } as const;
export const PRESENTATION_UNITS = { porciones: 'Porciones', unidades: 'Unidades', g: 'Gramos', kg: 'Kilogramos', ml: 'Mililitros', cajas: 'Cajas' } as const;
export const productHref = (product: { slug: string; family?: ProductFamily; cakeSaleMode?: string }) => product.cakeSaleMode === 'ADVANCED' ? `${ROUTES.cake(product.slug)}?canal=empresas` : product.family && product.family !== 'CAKE' ? ROUTES.product(product.slug) : ROUTES.cake(product.slug);
export const preparationLabel = (product: { preparationMode?: PreparationMode; minLeadHours?: number }) => product.preparationMode === 'READY_STOCK'
  ? 'Entrega lo antes posible · según existencias'
  : product.minLeadHours ? `Pide con ${product.minLeadHours} h de anticipación` : 'Por encargo · consulta las fechas disponibles';
