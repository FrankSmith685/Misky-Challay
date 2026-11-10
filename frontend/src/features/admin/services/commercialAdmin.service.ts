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
  validFrom: string | null;
  validUntil: string | null;
  usageLimit: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isActive: boolean;
  status: 'ACTIVE' | 'SCHEDULED' | 'PAUSED' | 'EXPIRED' | 'EXHAUSTED' | 'ARCHIVED';
  reservedCount: number;
  confirmedCount: number;
  discountSpent: number;
  version: number;
  rules: {
    branchIds?: number[];
    productIds?: number[];
    deliveryTypes?: string[];
    paymentMethods?: string[];
    firstOrderOnly?: boolean;
  };
  stackMode: 'EXCLUSIVE' | 'STACKABLE';
  budgetAmount: number | null;
  budgetUsed: number;
  archivedAt: string | null;
}

export interface CouponPreview {
  code: string;
  description: string;
  discountType: 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
  amount: number;
  freeDelivery: boolean;
  budgetImpact: number;
  stackMode: 'EXCLUSIVE' | 'STACKABLE';
  rules: AdminCoupon['rules'];
}

export interface AdminCouponRedemption {
  id: number;
  status: 'RESERVED' | 'CONFIRMED' | 'RELEASED';
  amount: number;
  userId: number | null;
  createdAt: string;
  order: { id: number; orderNumber: string; status: string; grandTotal: number; placedAt: string } | null;
}

export interface AdminPlanBenefit {
  id: number;
  type: 'DISCOUNT_PERCENT' | 'FREE_DELIVERY';
  value: number;
  maxAmountPerOrder: number | null;
  description: string;
  /**
   * Los beneficios se leen EN VIVO (a diferencia de precio, saldo y vigencia, que
   * se congelan al comprar): apagar uno se lo quita en el acto a todos los planes
   * vigentes. Por eso el borrado pasa a ser logico, y el estado tiene que viajar.
   */
  isActive?: boolean;
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
  /** Suscriptores con el plan vigente: lo que hay que decir antes de tocar un beneficio. */
  activeSubscribers?: number;
}

export interface AdminSchedule {
  id: number;
  weekday: number | null;
  exceptionDate?: string | null;
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
  version: number;
  zoneIds: number[];
  slotSummary: { upcoming: number; capacity: number; reserved: number; confirmed: number; available: number };
  health: { status: 'READY' | 'ATTENTION'; issues: string[] };
  schedules: AdminSchedule[];
}

export interface AdminZone {
  id: number;
  cityId: number;
  name: string;
  deliveryFee: number;
  cakeDeliveryFee: number;
  extraCoverageKm: number;
  extraFeePerKm: number;
  minimumOrder: number;
  estimatedMinutes: number;
  priority: number;
  isActive: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'ARCHIVED';
  version: number;
  effectiveFrom: string | null;
  archivedAt: string | null;
  hasOverlap: boolean;
  districtCount: number;
  last30DaysOrders: number;
  last30DaysDeliveryRevenue: number;
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
  stats: {
    activeZones: number;
    activeBranches: number;
    coveredDistricts: number;
    uncoveredDistricts: number;
    overlappingZones: number;
    branchesWithAttention: number;
  };
  drafts: Array<{ id: number; key: string; status: 'DRAFT' | 'SCHEDULED'; publishAt: string | null; updatedAt: string; payload: Record<string, unknown> }>;
}

export interface CoverageQuotePreview {
  zone: { id: number; name: string };
  subtotal: number;
  deliveryFee: number;
  cakeDeliveryFee: number;
  extraDeliveryFee: number;
  minimumOrder: number;
  meetsMinimum: boolean;
  estimatedMinutes: number;
  taxableBase: number;
  taxTotal: number;
  total: number;
  currency: string;
}

export interface BuilderOption {
  id: number;
  version: number;
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
  cakeScaleWithServings: boolean;
  maxPerItem: number;
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'INACTIVE';
  inventoryItemId: number | null;
  consumptionQuantity: number;
  sortOrder: number;
  branchAvailability: Array<{
    branchId: number;
    version: number;
    isAvailable: boolean;
    priceOverride: number | null;
    availableFrom: string | null;
    availableUntil: string | null;
  }>;
  incompatibleWith: number[];
}

export interface BuilderGroup {
  id: number;
  version: number;
  linkVersion?: number;
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

export interface BuilderConfig {
  customServings?: { enabled: boolean; baseVariantId: number | null; minServings: number; maxServings: number; pricePerExtraServing: number } | null;
  product: { id: number; name: string; type: string; status?: string; version?: number };
  variants: Array<{ id: number; name: string; basePrice?: number; servingSize: number | null; servingUnit: string | null; isDefault: boolean; isActive: boolean; version?: number }>;
  groups: BuilderGroup[];
  inventoryItems: Array<{ id: number; name: string; unit: string }>;
  branches: Array<{ id: number; name: string }>;
  presets: BuilderPreset[];
}

export interface BuilderPreset {
  id: number;
  version: number;
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

export interface BuilderHealth {
  productId: number;
  status: 'READY' | 'WARNINGS' | 'ERRORS';
  errors: string[];
  warnings: string[];
  variantReadiness: Array<{ id: number; name: string; status: 'READY' | 'ERRORS'; issues: string[] }>;
  branchReadiness: Array<{ id: number; name: string; status: 'READY' | 'WARNINGS'; unavailableOptions: number }>;
  checkedAt: string;
}

export interface BuilderGovernance {
  draft: { id: number; status: string; publishAt: string | null; updatedAt: string; baseVersion: number | null } | null;
  published: { id: number; version: number; publishedAt: string; publishedBy: number | null } | null;
}

export interface BuilderRelease {
  id: number;
  version: number;
  publishedAt: string;
  publishedBy: number | null;
}

export interface BuilderOptionImpact {
  optionId: number;
  optionName: string;
  status: BuilderOption['status'];
  presetUses: number;
  branchRules: number;
  incompatibilities: number;
  historicalOrders: number;
  canDelete: boolean;
}

export interface BuilderCatalogHealthRow {
  productId: number;
  productName: string;
  productStatus: string;
  status: 'READY' | 'WARNINGS' | 'ERRORS';
  errors: number;
  warnings: number;
  variants: number;
  branches: number;
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

  /**
   * `validUntil` (ISO) y `usageLimit` los acepta el backend desde el principio y el
   * motor de cupones los respeta; el formulario no los exponia, asi que todo cupon
   * creado desde el panel nacia eterno e ilimitado mientras la tabla prometia
   * "Usos x/y" y "Vence".
   */
  async createCoupon(input: {
    code: string;
    description: string;
    discountType: string;
    value: number;
    minOrderAmount: number;
    maxDiscountAmount?: number | null;
    validFrom?: string | null;
    validUntil?: string | null;
    usageLimit?: number | null;
    usageLimitPerUser: number;
    rules?: AdminCoupon['rules'];
    stackMode?: AdminCoupon['stackMode'];
    budgetAmount?: number | null;
  }): Promise<void> {
    await api.post(`${BASE}/coupons`, input);
  },

  /**
   * Edicion del cupon. `value`, `minOrderAmount`, `maxDiscountAmount` y `usageLimit`
   * El servidor verifica `expectedVersion` para no sobrescribir cambios de otro
   * administrador y conserva el historial de la campaña.
   */
  async updateCoupon(
    couponId: number,
    input: {
      isActive?: boolean;
      description?: string;
      validUntil?: string | null;
      value?: number;
      minOrderAmount?: number;
      maxDiscountAmount?: number | null;
      usageLimit?: number | null;
      validFrom?: string | null;
      rules?: AdminCoupon['rules'];
      stackMode?: AdminCoupon['stackMode'];
      budgetAmount?: number | null;
      expectedVersion?: number;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/coupons/${couponId}`, input);
  },

  async toggleCoupon(couponId: number, isActive: boolean): Promise<void> {
    await api.patch(`${BASE}/coupons/${couponId}`, { isActive });
  },

  async archiveCoupon(couponId: number, expectedVersion?: number): Promise<void> {
    await api.post(`${BASE}/coupons/${couponId}/archive`, { expectedVersion });
  },

  async couponMetrics(couponId: number): Promise<{ reserved: number; confirmed: number; released: number; discountConfirmed: number; budgetAmount: number | null; budgetUsed: number; budgetRemaining: number | null; grossSales: number; averageOrderValue: number }> {
    const { data } = await api.get<ApiSuccess<{ reserved: number; confirmed: number; released: number; discountConfirmed: number; budgetAmount: number | null; budgetUsed: number; budgetRemaining: number | null; grossSales: number; averageOrderValue: number }>>(`${BASE}/coupons/${couponId}/metrics`);
    return data.data;
  },

  async couponRedemptions(couponId: number): Promise<AdminCouponRedemption[]> {
    const { data } = await api.get<ApiSuccess<AdminCouponRedemption[]>>(`${BASE}/coupons/${couponId}/redemptions`);
    return data.data;
  },

  async previewCoupon(input: { code: string; subtotal: number; userId?: number | null; branchId?: number | null; deliveryType?: 'DELIVERY' | 'PICKUP' | 'DINE_IN' | null; paymentMethod?: 'ONLINE' | 'YAPE' | 'PLIN' | 'CASH' | null; productIds?: number[] }): Promise<CouponPreview> {
    const { data } = await api.post<ApiSuccess<CouponPreview>>(`${BASE}/coupons/preview`, input);
    return data.data;
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

  async previewCoverageQuote(input: {
    zoneId: number;
    subtotal: number;
    containsCake: boolean;
    extraDeliveryFee?: number;
    deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  }): Promise<CoverageQuotePreview> {
    const { data } = await api.post<ApiSuccess<CoverageQuotePreview>>(`${BASE}/coverage/quote`, input);
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
    cakeDeliveryFee: number;
    extraCoverageKm: number;
    extraFeePerKm: number;
    minimumOrder?: number;
    estimatedMinutes: number;
    priority: number;
    polygon?: Array<{ lat: number; lng: number }>;
    effectiveFrom?: string | null;
  }): Promise<{ id: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number }>>(`${BASE}/coverage/zones`, input);
    return data.data;
  },

  async assignZoneToBranch(zoneId: number, branchId: number, priority = 1): Promise<void> {
    await api.post(`${BASE}/coverage/zones/${zoneId}/branches`, { branchId, priority });
  },

  async updateBranch(
    branchId: number,
    input: { prepMinutes?: number; isActive?: boolean; acceptsPickup?: boolean; expectedVersion?: number },
  ): Promise<void> {
    await api.patch(`${BASE}/coverage/branches/${branchId}`, input);
  },

  async setSchedule(
    branchId: number,
    input: { weekday: number; opensAt: string; closesAt: string; isClosed: boolean },
  ): Promise<void> {
    await api.put(`${BASE}/coverage/branches/${branchId}/schedule`, input);
  },

  async setScheduleException(
    branchId: number,
    input: { exceptionDate: string; opensAt: string; closesAt: string; isClosed: boolean },
  ): Promise<void> {
    await api.post(`${BASE}/coverage/branches/${branchId}/schedule-exceptions`, input);
  },

  async updateZone(
    zoneId: number,
    input: {
      deliveryFee?: number;
      cakeDeliveryFee?: number;
      extraCoverageKm?: number;
      extraFeePerKm?: number;
      minimumOrder?: number;
      estimatedMinutes?: number;
      isActive?: boolean;
      name?: string;
      priority?: number;
      polygon?: Array<{ lat: number; lng: number }> | null;
      expectedVersion?: number;
      effectiveFrom?: string | null;
      archivedAt?: string | null;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/coverage/zones/${zoneId}`, input);
  },

  async archiveZone(zoneId: number, expectedVersion?: number): Promise<void> {
    await api.post(`${BASE}/coverage/zones/${zoneId}/archive`, { expectedVersion });
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

  async builderHealth(productId: number): Promise<BuilderHealth> {
    const { data } = await api.get<ApiSuccess<BuilderHealth>>(`${BASE}/builder/${productId}/health`);
    return data.data;
  },

  async builderCatalogHealth(): Promise<BuilderCatalogHealthRow[]> {
    const { data } = await api.get<ApiSuccess<BuilderCatalogHealthRow[]>>(`${BASE}/builder/catalog-health`);
    return data.data;
  },

  async builderGovernance(productId: number): Promise<BuilderGovernance> {
    const { data } = await api.get<ApiSuccess<BuilderGovernance>>(`${BASE}/builder/${productId}/governance`);
    return data.data;
  },

  async builderOptionImpact(optionId: number): Promise<BuilderOptionImpact> {
    const { data } = await api.get<ApiSuccess<BuilderOptionImpact>>(`${BASE}/builder/options/${optionId}/impact`);
    return data.data;
  },

  async saveBuilderDraft(productId: number, publishAt?: string | null): Promise<{ id: number; status: string; publishAt: string | null; health: BuilderHealth }> {
    const { data } = await api.put<ApiSuccess<{ id: number; status: string; publishAt: string | null; health: BuilderHealth }>>(`${BASE}/builder/${productId}/draft`, { publishAt: publishAt ?? null });
    return data.data;
  },

  async publishBuilder(productId: number, idempotencyKey = crypto.randomUUID()): Promise<{ id: number; version: number; publishedAt: string; idempotent: boolean }> {
    const { data } = await api.post<ApiSuccess<{ id: number; version: number; publishedAt: string; idempotent: boolean }>>(`${BASE}/builder/${productId}/publish`, { idempotencyKey });
    return data.data;
  },

  async builderReleases(productId: number): Promise<BuilderRelease[]> {
    const { data } = await api.get<ApiSuccess<BuilderRelease[]>>(`${BASE}/builder/${productId}/releases`);
    return data.data;
  },

  async rollbackBuilder(productId: number, releaseId: number, idempotencyKey = crypto.randomUUID()): Promise<{ id: number; version: number; publishedAt: string; restoredFrom: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number; version: number; publishedAt: string; restoredFrom: number }>>(`${BASE}/builder/${productId}/releases/${releaseId}/rollback`, { idempotencyKey });
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
      expectedVersion?: number;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/builder/groups/${groupId}`, input);
  },

  async createGroup(
    productId: number,
    input: {
      code: string;
      name: string;
      variantId?: number | null;
      description?: string | null;
      imageUrl?: string | null;
      selectionType: 'SINGLE' | 'MULTIPLE';
      minSelection: number;
      maxSelection: number;
      freeQuantity: number;
      sortOrder: number;
      expectedVersion?: number;
    },
  ): Promise<{ id: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number }>>(`${BASE}/builder/${productId}/groups`, input);
    return data.data;
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
      cakeScaleWithServings?: boolean;
      maxPerItem: number;
      inventoryItemId?: number | null;
      consumptionQuantity?: number;
      expectedVersion?: number;
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
      cakeScaleWithServings?: boolean;
      maxPerItem?: number;
      status?: 'ACTIVE' | 'OUT_OF_STOCK' | 'INACTIVE';
      inventoryItemId?: number | null;
      consumptionQuantity?: number;
      expectedVersion?: number;
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
    expectedVersion?: number;
  }): Promise<void> {
    await api.put(`${BASE}/builder/options/${optionId}/availability`, input);
  },

  async createPreset(productId: number, input: Omit<BuilderPreset, 'id' | 'version'>): Promise<void> {
    await api.post(`${BASE}/builder/${productId}/presets`, input);
  },

  async updatePreset(presetId: number, input: Partial<Omit<BuilderPreset, 'id' | 'code'>> & { expectedVersion?: number }): Promise<void> {
    await api.patch(`${BASE}/builder/presets/${presetId}`, input);
  },

  async deletePreset(presetId: number): Promise<void> {
    await api.delete(`${BASE}/builder/presets/${presetId}`);
  },
};
