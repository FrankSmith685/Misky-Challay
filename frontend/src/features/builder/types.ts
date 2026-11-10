export interface BuilderOption {
  id: number;
  name: string;
  /** Se selecciona al abrir un configurador nuevo, si está disponible. */
  isDefault?: boolean;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imagePosition: string;
  dietaryTags: string[];
  allergens: string[];
  spiceLevel: number;
  priceDelta: number;
  /** Suplemento: se cobra siempre, aunque el paso tenga unidades incluidas. */
  chargeAlways: boolean;
  cakeScaleWithServings: boolean;
  maxPerItem: number;
  isAvailable: boolean;
  incompatibleWith: number[];
  incompatibilities: Array<{ optionId: number; reason: string | null }>;
}

export interface BuilderGroup {
  id: number;
  /** null = paso común a todas las presentaciones; de lo contrario es específico de una variante. */
  variantId: number | null;
  code: string;
  name: string;
  description: string | null;
  selectionType: 'SINGLE' | 'MULTIPLE';
  minSelection: number;
  maxSelection: number;
  freeQuantity: number;
  sortOrder: number;
  options: BuilderOption[];
}

export interface BuilderVariant {
  id: number;
  name: string;
  basePrice: number;
  servingSize: number | null;
  servingUnit: string | null;
  isDefault: boolean;
}

export interface BuilderConfig {
  customServings?: import('@features/cakes/cakes.service').CakeCustomServings | null;
  product: {
    id: number;
    name: string;
    slug: string;
    type: string;
    family?: import('@features/catalog/pastry').ProductFamily;
    preparationMode?: import('@features/catalog/pastry').PreparationMode;
    minLeadHours?: number;
    imageUrl: string | null;
    imageAlt: string | null;
    imagePosition: string;
  };
  variants: BuilderVariant[];
  groups: BuilderGroup[];
  presets: BuilderPreset[];
}

export interface BuilderPreset {
  id: number;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  badge: string | null;
  isFeatured: boolean;
  selections: Array<{ optionId: number; quantity: number }>;
}

export interface SavedBowl {
  id: number;
  name: string;
  productId: number;
  variantId: number;
  selections: Array<{ optionId: number; quantity: number }>;
  product?: { id: number; name: string; slug: string; imageUrl: string | null };
  variant?: { id: number; name: string; basePrice: number };
  updatedAt: string;
}

export interface QuoteInput {
  themeId?: number;
  themeVersion?: number;
  productId: number;
  variantId: number;
  quantity: number;
  branchId?: number | null;
  requestedServings?: number;
  selections: Array<{ optionId: number; quantity: number }>;
}

export interface QuoteLine {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  quantity: number;
  chargedQuantity: number;
  priceDelta: number;
  lineExtra: number;
  cakeScaleWithServings: boolean;
}

export interface QuoteResult {
  theme?: import('@features/cakes/cakeThemes.service').ThemeSnapshot | null;
  productId: number;
  variantId: number;
  variantName?: string;
  requestedServings?: number | null;
  quantity: number;
  basePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  selections: QuoteLine[];
  description: string;
}
