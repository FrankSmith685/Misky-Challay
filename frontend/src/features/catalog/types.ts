import type { PreparationMode, ProductFamily } from './pastry';

export interface Category {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  imageUrl: string | null;
}

export interface DietaryTag {
  id: number;
  code: string;
  name: string;
  color: string | null;
}

export interface Allergen {
  id: number;
  code: string;
  name: string;
  warning: string | null;
}

/** Item del listado del menu. */
export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  family?: ProductFamily;
  preparationMode?: PreparationMode;
  minLeadHours?: number;
  categoryId: number;
  imageUrl: string | null;
  categoryImageUrl?: string | null;
  isFeatured: boolean;
  priceFrom: number;
  /** Variante por defecto, para anadir un producto FIJO al carrito desde la grilla. */
  defaultVariantId: number | null;
  defaultVariantName: string | null;
  defaultVariantPrice: number;
  dietaryTags: string[];
  allergens: string[];
  isAvailable: boolean;
  cakeSaleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED';
  salesCount?: number;
}

export interface ProductVariant {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  servingSize: number | null;
  servingUnit: string | null;
  isDefault: boolean;
}

/** Ficha completa del producto. */
export interface ProductDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  family?: ProductFamily;
  preparationMode?: PreparationMode;
  minLeadHours?: number;
  categoryId: number;
  imageUrl: string | null;
  /** Imagen compartida de la categoría cuando el producto no tiene foto propia. */
  categoryImageUrl?: string | null;
  isAvailable: boolean;
  cakeSaleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED';
  variants: ProductVariant[];
  dietaryTags: Array<{ code: string; name: string }>;
  allergens: Array<{ code: string; name: string; warning: string | null }>;
}
