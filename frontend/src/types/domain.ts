/** Tipos del dominio compartidos entre features (espejo del modelo de datos). */

export type ProductType = 'FIXED' | 'CUSTOMIZABLE';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

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
  imageUrl?: string | null;
  sortOrder: number;
}

export interface ProductVariant {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  nutrition?: Nutrition | null;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: ProductType;
  categoryId: number;
  imageUrl?: string | null;
  priceFrom: number;
  variants: ProductVariant[];
  dietaryTags: string[];
  allergens: string[];
  nutrition?: Nutrition | null;
  isAvailable: boolean;
}

export interface CustomizationOption {
  id: number;
  name: string;
  priceDelta: number;
  nutrition?: Nutrition | null;
  isAvailable: boolean;
}

export interface CustomizationGroup {
  id: number;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  minSelection: number;
  maxSelection: number;
  freeQuantity: number;
  sortOrder: number;
  options: CustomizationOption[];
}

export interface CartItemSelection {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  quantity: number;
  priceDelta: number;
}

export interface CartItem {
  id: string;
  productId: number;
  variantId: number;
  name: string;
  variantName: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  extrasTotal: number;
  lineTotal: number;
  selections: CartItemSelection[];
  nutrition?: Nutrition | null;
}

export interface User {
  id: number;
  email: string | null;
  /** Viene con la sesion: el checkout lo usa como contacto por defecto. */
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  /** Se salta la verificacion de permisos (marca del sistema, no un rol). */
  isSuperAdmin: boolean;
  /** Sucursales asignadas. Vacio = alcance global. */
  branchIds: number[];
}
