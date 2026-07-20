export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BuilderOption {
  id: number;
  name: string;
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
  nutrition: Nutrition;
  maxPerItem: number;
  isAvailable: boolean;
  incompatibleWith: number[];
  incompatibilities: Array<{ optionId: number; reason: string | null }>;
}

export interface BuilderGroup {
  id: number;
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
  isDefault: boolean;
  nutrition: Nutrition;
}

export interface BuilderConfig {
  product: {
    id: number;
    name: string;
    slug: string;
    type: string;
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
  productId: number;
  variantId: number;
  quantity: number;
  branchId?: number | null;
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
}

export interface QuoteResult {
  productId: number;
  variantId: number;
  quantity: number;
  basePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  nutrition: Nutrition;
  selections: QuoteLine[];
  description: string;
}
