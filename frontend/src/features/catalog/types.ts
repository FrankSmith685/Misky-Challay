export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
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
  categoryId: number;
  imageUrl: string | null;
  isFeatured: boolean;
  priceFrom: number;
  nutrition: Nutrition | null;
  dietaryTags: string[];
  allergens: string[];
  isAvailable: boolean;
}

export interface ProductVariant {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  isDefault: boolean;
  nutrition: Nutrition | null;
}

/** Ficha completa del producto. */
export interface ProductDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  categoryId: number;
  imageUrl: string | null;
  isAvailable: boolean;
  variants: ProductVariant[];
  dietaryTags: Array<{ code: string; name: string }>;
  allergens: Array<{ code: string; name: string; warning: string | null }>;
}
