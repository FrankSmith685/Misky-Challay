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
  isAvailable: boolean;
}

export interface CustomizationOption {
  id: number;
  name: string;
  priceDelta: number;
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
  slug?: string;
  variantId: number;
  name: string;
  variantName: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  extrasTotal: number;
  lineTotal: number;
  selections: CartItemSelection[];
  designQuoteId?: number;
  approvedDesignSummary?: string;
  theme?: import('@features/cakes/cakeThemes.service').ThemeSnapshot;
  requestedServings?: number;
  preferredSlotId?: number;
  requiresScheduledDelivery?: boolean;
  requiresCarDelivery?: boolean;
  minLeadHours?: number;
  specialInstructions?: string;
  referenceDataUrl?: string;
  cakeAiProposal?: { dataUrl: string; recipe: Omit<import('@features/cakes/cakes.service').CakeVisualPreviewInput, 'referenceDataUrl'> };
  designDetails?: { inscription: string; occasion: string; finish: string };
  archivedAiProposalDataUrl?: string;
  cakeVisualDesign?: import('@features/cakes/utils/cakeVisualDesign').CakeVisualDesign;
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
