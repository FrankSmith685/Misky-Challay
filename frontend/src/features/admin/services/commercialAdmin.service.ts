import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

const BASE = '/admin';

// ============================ Tipos ============================
export interface AdminCoupon {
  id: number;
  code: string;
  description: string;
  discountType: 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
  value: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  validUntil: string | null;
  usageLimit: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isActive: boolean;
}

export interface AdminPlanBenefit {
  id: number;
  type: 'DISCOUNT_PERCENT' | 'FREE_DELIVERY';
  value: number;
  maxAmountPerOrder: number | null;
  description: string;
}

export interface AdminPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price: number;
  grantedCredit: number;
  bonusAmount: number;
  validityDays: number;
  isFeatured: boolean;
  isActive: boolean;
  benefits: AdminPlanBenefit[];
}

export interface AdminSchedule {
  id: number;
  weekday: number | null;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface AdminBranch {
  id: number;
  cityId: number;
  name: string;
  addressLine: string;
  districtId: number | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  prepMinutes: number;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  isActive: boolean;
  schedules: AdminSchedule[];
}

export interface AdminZone {
  id: number;
  cityId: number;
  name: string;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  priority: number;
  isActive: boolean;
  hasPolygon: boolean;
  polygon: Array<{ lat: number; lng: number }> | null;
  branchIds: number[];
}

export interface AdminDistrict {
  id: number;
  cityId: number;
  name: string;
  ubigeoCode: string | null;
  coverageZoneId: number | null;
  isActive: boolean;
}

export interface Coverage {
  cities: Array<{ id: number; name: string }>;
  districts: AdminDistrict[];
  zones: AdminZone[];
  branches: AdminBranch[];
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
  chargeAlways: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  maxPerItem: number;
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'INACTIVE';
  inventoryItemId: number | null;
  consumptionQuantity: number;
  sortOrder: number;
  branchAvailability: Array<{
    branchId: number;
    isAvailable: boolean;
    priceOverride: number | null;
    availableFrom: string | null;
    availableUntil: string | null;
  }>;
  incompatibleWith: number[];
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

export interface BuilderConfig {
  product: { id: number; name: string; type: string };
  groups: BuilderGroup[];
  inventoryItems: Array<{ id: number; name: string; unit: string }>;
  branches: Array<{ id: number; name: string }>;
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
  isActive: boolean;
  sortOrder: number;
  selections: Array<{ optionId: number; quantity: number }>;
}

export interface BuilderHistoryEntry {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: { id: number; firstName: string; lastName: string; email: string } | null;
  createdAt: string;
}

export interface BuilderAnalytics {
  range: { from: string; to: string; days: number };
  funnel: { viewed: number; started: number; completed: number; addedToCart: number; startRate: number; completionRate: number; conversionRate: number; abandonmentRate: number };
  interactions: { conflictsResolved: number; quoteErrors: number; savedBowls: number };
  topSelectedOptions: Array<{ id: number; name: string; count: number }>;
  presetUsage: Array<{ id: number; name: string; count: number }>;
  orderedIngredients: Array<{ optionId: number; name: string; units: number; extras: number }>;
}

// ============================ API ============================
export const commercialApi = {
  async getDraft<T>(key: string): Promise<{ payload: T; publishAt: string | null; status: string } | null> {
    const { data } = await api.get<ApiSuccess<{ payload: T; publishAt: string | null; status: string } | null>>(`${BASE}/drafts/${encodeURIComponent(key)}`);
    return data.data;
  },

  async saveDraft<T extends Record<string, unknown>>(key: string, scope: string, payload: T, publishAt?: string | null): Promise<void> {
    await api.put(`${BASE}/drafts/${encodeURIComponent(key)}`, { scope, payload, publishAt: publishAt || null });
  },

  async deleteDraft(key: string): Promise<void> {
    await api.delete(`${BASE}/drafts/${encodeURIComponent(key)}`);
  },

  // --- Cupones ---
  async coupons(): Promise<AdminCoupon[]> {
    const { data } = await api.get<ApiSuccess<AdminCoupon[]>>(`${BASE}/coupons`);
    return data.data;
  },

  async createCoupon(input: {
    code: string;
    description: string;
    discountType: string;
    value: number;
    minOrderAmount: number;
    maxDiscountAmount?: number | null;
    usageLimitPerUser: number;
  }): Promise<void> {
    await api.post(`${BASE}/coupons`, input);
  },

  async toggleCoupon(couponId: number, isActive: boolean): Promise<void> {
    await api.patch(`${BASE}/coupons/${couponId}`, { isActive });
  },

  // --- Planes ---
  async plans(): Promise<AdminPlan[]> {
    const { data } = await api.get<ApiSuccess<AdminPlan[]>>(`${BASE}/plans`);
    return data.data;
  },

  async createPlan(input: {
    code: string;
    name: string;
    description?: string;
    price: number;
    grantedCredit: number;
    validityDays: number;
  }): Promise<void> {
    await api.post(`${BASE}/plans`, input);
  },

  async updatePlan(
    planId: number,
    input: {
      name?: string;
      price?: number;
      grantedCredit?: number;
      validityDays?: number;
      isActive?: boolean;
      isFeatured?: boolean;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/plans/${planId}`, input);
  },

  async setPlanBenefit(
    planId: number,
    input: {
      type: 'DISCOUNT_PERCENT' | 'FREE_DELIVERY';
      value: number;
      maxAmountPerOrder?: number | null;
      description: string;
    },
  ): Promise<void> {
    await api.put(`${BASE}/plans/${planId}/benefits`, input);
  },

  async removePlanBenefit(planId: number, benefitId: number): Promise<void> {
    await api.delete(`${BASE}/plans/${planId}/benefits/${benefitId}`);
  },

  // --- Cobertura ---
  async coverage(): Promise<Coverage> {
    const { data } = await api.get<ApiSuccess<Coverage>>(`${BASE}/coverage`);
    return data.data;
  },

  async createBranch(input: {
    cityId: number;
    name: string;
    addressLine: string;
    districtId?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    phone?: string;
    prepMinutes: number;
    acceptsPickup: boolean;
    acceptsDelivery: boolean;
  }): Promise<{ id: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number }>>(`${BASE}/coverage/branches`, input);
    return data.data;
  },

  async createZone(input: {
    cityId: number;
    name: string;
    deliveryFee: number;
    minimumOrder: number;
    estimatedMinutes: number;
    priority: number;
    polygon?: Array<{ lat: number; lng: number }>;
  }): Promise<{ id: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number }>>(`${BASE}/coverage/zones`, input);
    return data.data;
  },

  async assignZoneToBranch(zoneId: number, branchId: number): Promise<void> {
    await api.post(`${BASE}/coverage/zones/${zoneId}/branches`, { branchId, priority: 1 });
  },

  async updateBranch(
    branchId: number,
    input: { prepMinutes?: number; isActive?: boolean; acceptsPickup?: boolean },
  ): Promise<void> {
    await api.patch(`${BASE}/coverage/branches/${branchId}`, input);
  },

  async setSchedule(
    branchId: number,
    input: { weekday: number; opensAt: string; closesAt: string; isClosed: boolean },
  ): Promise<void> {
    await api.put(`${BASE}/coverage/branches/${branchId}/schedule`, input);
  },

  async updateZone(
    zoneId: number,
    input: {
      deliveryFee?: number;
      minimumOrder?: number;
      estimatedMinutes?: number;
      isActive?: boolean;
      name?: string;
      priority?: number;
      polygon?: Array<{ lat: number; lng: number }> | null;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/coverage/zones/${zoneId}`, input);
  },

  /** Abrir o cerrar un distrito: sin zona = sin cobertura (RN-001). */
  async setDistrictZone(districtId: number, coverageZoneId: number | null): Promise<void> {
    await api.patch(`${BASE}/coverage/districts/${districtId}`, { coverageZoneId });
  },

  async generateSlots(input: {
    branchId: number;
    days: number;
    capacity: number;
    cutoffHours: number;
    windows: Array<{ startHour: number; endHour: number }>;
  }): Promise<{ created: number }> {
    const { data } = await api.post<ApiSuccess<{ created: number }>>(
      `${BASE}/coverage/slots`,
      input,
    );
    return data.data;
  },

  // --- Constructor ---
  async builder(productId: number): Promise<BuilderConfig> {
    const { data } = await api.get<ApiSuccess<BuilderConfig>>(`${BASE}/builder/${productId}`);
    return data.data;
  },

  async builderHistory(productId: number): Promise<BuilderHistoryEntry[]> {
    const { data } = await api.get<ApiSuccess<BuilderHistoryEntry[]>>(`${BASE}/builder/${productId}/history`);
    return data.data;
  },

  async builderAnalytics(productId: number, days = 30): Promise<BuilderAnalytics> {
    const { data } = await api.get<ApiSuccess<BuilderAnalytics>>(`${BASE}/builder/${productId}/analytics`, { params: { days } });
    return data.data;
  },

  async updateGroup(
    groupId: number,
    input: {
      name?: string;
      minSelection?: number;
      maxSelection?: number;
      freeQuantity?: number;
      selectionType?: 'SINGLE' | 'MULTIPLE';
      sortOrder?: number;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/builder/groups/${groupId}`, input);
  },

  async createGroup(
    productId: number,
    input: {
      code: string;
      name: string;
      description?: string | null;
      imageUrl?: string | null;
      selectionType: 'SINGLE' | 'MULTIPLE';
      minSelection: number;
      maxSelection: number;
      freeQuantity: number;
      sortOrder: number;
    },
  ): Promise<void> {
    await api.post(`${BASE}/builder/${productId}/groups`, input);
  },

  async createOption(
    groupId: number,
    input: {
      name: string;
      description?: string | null;
      imageUrl?: string | null;
      imageAlt?: string | null;
      imagePosition?: string;
      dietaryTags?: string[];
      allergens?: string[];
      spiceLevel?: number;
      sortOrder?: number;
      priceDelta: number;
      chargeAlways: boolean;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      maxPerItem: number;
      inventoryItemId?: number | null;
      consumptionQuantity?: number;
    },
  ): Promise<void> {
    await api.post(`${BASE}/builder/groups/${groupId}/options`, input);
  },

  async updateOption(
    optionId: number,
    input: {
      name?: string;
      description?: string | null;
      imageUrl?: string | null;
      imageAlt?: string | null;
      imagePosition?: string;
      dietaryTags?: string[];
      allergens?: string[];
      spiceLevel?: number;
      sortOrder?: number;
      priceDelta?: number;
      chargeAlways?: boolean;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      maxPerItem?: number;
      status?: 'ACTIVE' | 'OUT_OF_STOCK' | 'INACTIVE';
      inventoryItemId?: number | null;
      consumptionQuantity?: number;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/builder/options/${optionId}`, input);
  },

  async deleteOption(optionId: number): Promise<void> {
    await api.delete(`${BASE}/builder/options/${optionId}`);
  },

  async addIncompatibility(optionId: number, otherId: number, reason?: string): Promise<void> {
    await api.post(`${BASE}/builder/options/${optionId}/incompatibilities`, {
      incompatibleOptionId: otherId,
      reason,
    });
  },

  async removeIncompatibility(optionId: number, otherId: number): Promise<void> {
    await api.delete(`${BASE}/builder/options/${optionId}/incompatibilities/${otherId}`);
  },

  async duplicateOption(optionId: number): Promise<void> {
    await api.post(`${BASE}/builder/options/${optionId}/duplicate`);
  },

  async bulkUpdateOptions(optionIds: number[], status: BuilderOption['status']): Promise<void> {
    await api.patch(`${BASE}/builder/options/actions/bulk`, { optionIds, status });
  },

  async setOptionSchedule(optionId: number, input: {
    branchId: number;
    isAvailable: boolean;
    priceOverride?: number | null;
    availableFrom?: string | null;
    availableUntil?: string | null;
  }): Promise<void> {
    await api.put(`${BASE}/builder/options/${optionId}/availability`, input);
  },

  async createPreset(productId: number, input: Omit<BuilderPreset, 'id'>): Promise<void> {
    await api.post(`${BASE}/builder/${productId}/presets`, input);
  },

  async updatePreset(presetId: number, input: Partial<Omit<BuilderPreset, 'id' | 'code'>>): Promise<void> {
    await api.patch(`${BASE}/builder/presets/${presetId}`, input);
  },

  async deletePreset(presetId: number): Promise<void> {
    await api.delete(`${BASE}/builder/presets/${presetId}`);
  },
};
