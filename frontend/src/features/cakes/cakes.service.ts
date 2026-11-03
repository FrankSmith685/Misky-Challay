import type { ProductFamily, PreparationMode } from '@features/catalog/pastry';
import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import type { CakeVisualDesign } from './utils/cakeVisualDesign';

export type Station = 'DESIGN' | 'BAKING' | 'COOLING' | 'FILLING' | 'DECORATING' | 'QA' | 'DISPATCH';
export type Effort = Partial<Record<Station, number>>;
export interface CakeSizeGuide { variantId: number; diameterCm: number; minServings: number; maxServings: number }
export interface CakeCustomServings { enabled: boolean; baseVariantId: number | null; minServings: number; maxServings: number; pricePerExtraServing: number; sizeGuides?: CakeSizeGuide[] }
export interface CakeProfile { productId: number; saleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED'; minLeadHours: number; baseEffortJson: Effort; stationOffsetsJson: Partial<Record<Station, number>>; customServingsJson: CakeCustomServings }
export interface CakeVisualPreviewInput {
  flavor: string; filling: string; addons: string; description: string;
  sizeLabel?: string; diameterCm?: number | null; servings?: number | null;
  options?: Array<{ groupName: string; optionName: string; quantity: number }>;
  referenceDataUrl?: string;
}
export interface CakeAvailability { available: boolean; stations: Array<{ station: Station; workDate: string; minutes: number; availableMinutes: number; configured: boolean; available: boolean }> }
export interface DesignQuote { id: number; requestId: number; version: number; price: number; effortJson: Effort; materialExtrasJson: Array<{ inventoryItemId: number; quantity: number }>; allergenCodesJson: string[] | null; estimatedLaborCost: number; estimatedPackagingCost: number; proposedAt: string; expiresAt: string; terms: string; status: 'PROPOSED' | 'ACCEPTED' | 'SUPERSEDED'; orderId: number | null }
export interface DesignBrief { visualDesign?: CakeVisualDesign; occasion: string; theme: string; style: string; colors: string[]; servings: number | null; message: string; budget: string; notes: string; flavor?: string; filling?: string; selectedOptions?: Array<{ optionId?: number; group: string; option: string; quantity: number }> }
export interface DesignRequest { id: number; productId: number; variantId: number; branchId: number; desiredAt: string; updatedAt: string; requestKind: 'ADVANCED' | 'FREEFORM'; selectionsJson: Array<{ optionId: number; quantity: number }>; description: string; brief: DesignBrief | null; status: string; hasReference: boolean; referenceCount: number; referenceIds: number[]; quotes: DesignQuote[]; whatsappOptInAt?: string | null; themeSnapshotJson?: import('./cakeThemes.service').ThemeSnapshot | null }
export interface ProductionTask { order?: { orderNumber: string; status: string; scheduledAt: string | null; contactName: string | null; notes: string | null; deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN'; items: Array<{ id: number; quantity: number; productNameSnapshot: string; variantNameSnapshot: string | null; requestedServings: number | null; descriptionSnapshot: string | null; specialInstructions: string | null; allergenSnapshotJson: string[] | null; customizations: Array<{ id: number; groupNameSnapshot: string; optionNameSnapshot: string; quantity: number }>; reference?: { id: number } | null; designImages?: import('./components/OrderCakeReference').OrderDesignImage[]; themeSnapshotJson?: import('./cakeThemes.service').ThemeSnapshot | null }> }; id: number; orderId: number; branchId: number; station: Station; workDate: string; plannedMinutes: number; sequence: number; status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'; assignedTo: number | null; checklistJson: Record<string, boolean> | null; materialPlanJson: Record<string, number> | null; materialConsumedJson: Record<string, number> | null; materialWasteJson: Record<string, number> | null; evidenceUrl: string | null; evidenceMime: string | null }
export interface StationCapacity { id: number; branchId: number; station: Station; workDate: string; capacityMinutes: number; reservedMinutes: number; confirmedMinutes: number }
export interface CakeConfiguration { profile: CakeProfile & { isActive: boolean }; product: { id: number; name: string; slug: string; family: ProductFamily; preparationMode: PreparationMode; status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'; allergensReviewedAt: string | null; category?: { name: string } | null }; variants: Array<{ id: number; name: string; basePrice: number; isActive: boolean; servingSize: number | null; servingUnit: string | null; productionMinutesJson: Effort }>; options: Array<{ id: number; groupId: number; name: string; productionMinutesJson: Effort; inventoryItemId: number | null; consumptionQuantity: number }> }
export interface RecipeInventoryItem { itemType?: 'INGREDIENT' | 'FINISHED_PRODUCT'; id: number; name: string; unit: string; unitCost: number }
export interface NewCakeGroup {
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  maxSelection: number;
  options: Array<{ name: string; priceDelta: number; inventoryItemId: number | null; consumptionQuantity: number }>;
}
export interface AvailableCakeGroup { id: number; name: string; code: string; options: Array<{ id: number; name: string }> }
export interface CakeCategory { id: number; name: string; slug: string }
export interface RecipeVariant { preparationMode: PreparationMode; id: number; productId: number; productName: string; name: string; basePrice: number; servingSize: number | null; servingUnit: string | null; isActive: boolean; recipe: { id: number; yieldQuantity: number; items: Array<{ inventoryItemId: number; quantity: number; wastePercent: number; item: RecipeInventoryItem | null }> } | null }
export interface CakeCommissionRow { id: number; orderId: number; baseAmount: number; rate: number; adjustmentAmount: number; refundAmount: number; commissionAmount: number; settledAmount: number; outstandingAmount: number; overpaidAmount: number; settlements: Array<{ id: number; amount: number; reference: string; createdAt: string }>; status: 'PENDING' | 'LIQUIDATED'; liquidatedAt: string | null; order?: { orderNumber: string; placedAt: string; status: string } }
export interface CakeCommissionReport { canManage: boolean; rows: CakeCommissionRow[]; summary: { baseAmount: number; adjustments: number; refunds: number; commission: number; settled: number; outstanding: number; overpaid: number } }
export interface CakeFinanceReport {
  canManagePlatform: boolean;
  canManageFinance: boolean;
  summary: { revenue: number; estimatedMaterials: number; materials: number; directExpenses: number; paymentFees: number; commission: number; contribution: number; generalExpenses: number; operatingContribution: number; supplierPaid: number; supplierCommitted: number; supplierOutstanding: number; incompleteOrders: number };
  platform?: { earned: number; received: number; operatingExpenses: number; contribution: number };
  rows: Array<{ orderId: number; orderNumber: string; status: string; placedAt: string; revenue: number; estimatedMaterialCost: number; actualMaterialCost: number; materialCost: number; materialCostType: 'ACTUAL' | 'ESTIMATED'; directExpenses: number; paymentFees: number; platformCommission: number; paidCommission: number; contribution: number; costsComplete: boolean; missingMaterialCost: boolean; missingPaymentFee: boolean; missingLabor: boolean; missingPackaging: boolean; mixedProducts: boolean; payments: Array<{ id: number; amount: number; provider: string; reconciled: boolean }> }>;
  purchaseOrders: Array<{ id: number; orderNumber: string; total: number; paid: number }>;
  entries: Array<{ id: number; kind: string; category: string; amount: number; netAmount: number | null; reference: string; occurredAt: string; orderId: number | null; purchaseOrderId: number | null; paymentId: number | null }>;
}

const unwrap = <T>(response: { data: ApiSuccess<T> }): T => response.data.data;
export const cakesApi = {
  visualPreviewCapabilities: async () => unwrap(await api.get<ApiSuccess<{ enabled: boolean; maxPerHour: number }>>('/cakes/visual-preview/capabilities')),
  visualPreview: async (input: CakeVisualPreviewInput) => unwrap(await api.post<ApiSuccess<{ dataUrl: string; mimeType: string }>>('/cakes/visual-preview', input, { timeout: 90_000 })),
  orderReference: async (orderNumber: string, itemId: number) => (await api.get<Blob>(`/cakes/orders/${encodeURIComponent(orderNumber)}/items/${itemId}/reference`, { responseType: 'blob' })).data,
  orderImage: async (orderNumber: string, itemId: number, imageId: number) => (await api.get<Blob>(`/cakes/orders/${encodeURIComponent(orderNumber)}/items/${itemId}/images/${imageId}`, { responseType: 'blob' })).data,
  profile: async (productId: number) => unwrap(await api.get<ApiSuccess<CakeProfile>>(`/cakes/products/${productId}/profile`)),
  updateCustomServings: async (productId: number, input: Omit<CakeCustomServings, 'baseVariantId'> & { baseVariantId: number }) => unwrap(await api.put<ApiSuccess<CakeProfile>>(`/cakes/products/${productId}/custom-servings`, input)),
  getCustomServings: async (productId: number) => unwrap(await api.get<ApiSuccess<CakeCustomServings>>(`/cakes/products/${productId}/custom-servings`)),
  configuration: async () => unwrap(await api.get<ApiSuccess<CakeConfiguration[]>>('/cakes/configuration')),
  createCake: async (input: { existingProductId?: number; name: string; categoryId: number; description: string; imageUrl?: string | null; imageAlt?: string | null; saleMode: CakeProfile['saleMode']; minLeadHours: number; variantName: string; servings: number; basePrice: number; yieldQuantity: number; groupIds: number[]; newGroups: NewCakeGroup[]; effort: Effort; items: Array<{ inventoryItemId: number; quantity: number; wastePercent: number }> }) => unwrap(await api.post<ApiSuccess<{ productId: number; variantId: number; status: string; converted: boolean }>>('/cakes/configuration', input)),
  creationSetup: async () => unwrap(await api.get<ApiSuccess<{ categories: CakeCategory[]; allergenOptionCount: number }>>('/cakes/creation-setup')),
  availableGroups: async () => unwrap(await api.get<ApiSuccess<AvailableCakeGroup[]>>('/cakes/available-groups')),
  recipes: async () => unwrap(await api.get<ApiSuccess<{ inventoryItems: RecipeInventoryItem[]; variants: RecipeVariant[] }>>('/cakes/recipes')),
  updateRecipe: async (variantId: number, input: { yieldQuantity: number; items: Array<{ inventoryItemId: number; quantity: number; wastePercent: number }> }) => unwrap(await api.put<ApiSuccess<unknown>>(`/cakes/recipes/${variantId}`, input)),
  deleteRecipe: async (variantId: number) => unwrap(await api.delete<ApiSuccess<{ variantId: number }>>(`/cakes/recipes/${variantId}`)),
  updateProfile: async (productId: number, input: { saleMode: CakeProfile['saleMode']; minLeadHours: number; baseEffortJson: Effort; stationOffsetsJson: Partial<Record<Station, number>>; isActive: boolean }) => unwrap(await api.put<ApiSuccess<CakeProfile>>(`/cakes/products/${productId}/profile`, input)),
  updateVariantEffort: async (variantId: number, effort: Effort) => unwrap(await api.put<ApiSuccess<unknown>>(`/cakes/variants/${variantId}/effort`, { productionMinutesJson: effort })),
  updateOptionEffort: async (optionId: number, effort: Effort) => unwrap(await api.put<ApiSuccess<unknown>>(`/cakes/options/${optionId}/effort`, { productionMinutesJson: effort })),
  availability: async (input: { branchId: number; deliveryAt: string; items: Array<{ productId: number; variantId: number; quantity: number; requestedServings?: number; selections: Array<{ optionId: number; quantity: number }>; designQuoteId?: number; themeId?: number; themeVersion?: number }> }) => unwrap(await api.post<ApiSuccess<CakeAvailability>>('/cakes/availability', input)),
  submitDesign: async (input: { branchId: number; productId: number; variantId: number; desiredAt: string; requestKind?: 'ADVANCED' | 'FREEFORM'; themeId?: number; themeVersion?: number; selections: Array<{ optionId: number; quantity: number }>; description: string; brief: DesignBrief; referenceDataUrl?: string; referenceDataUrls?: string[]; whatsappOptIn?: boolean }) => unwrap(await api.post<ApiSuccess<DesignRequest>>('/cakes/design-requests', input)),
  myDesigns: async () => unwrap(await api.get<ApiSuccess<DesignRequest[]>>('/cakes/design-requests/mine')),
  stopDesignWhatsapp: async (requestId: number) => unwrap(await api.post<ApiSuccess<{ whatsappOptInAt: null }>>(`/cakes/design-requests/${requestId}/whatsapp/stop`)),
  updatePendingDesign: async (requestId: number, input: { description: string; flavor: string; filling: string; message: string; notes: string }) => unwrap(await api.patch<ApiSuccess<DesignRequest>>(`/cakes/design-requests/${requestId}`, input)),
  acceptQuote: async (quoteId: number) => unwrap(await api.post<ApiSuccess<{ quote: DesignQuote; request: DesignRequest }>>(`/cakes/quotes/${quoteId}/accept`)),
  designBoard: async (branchId: number) => unwrap(await api.get<ApiSuccess<DesignRequest[]>>('/cakes/design-requests', { params: { branchId } })),
  propose: async (requestId: number, input: { branchId: number; requestUpdatedAt: string; price: number; effort: Effort; proposedAt: string; expiresAt: string; terms: string; specification: { flavor: string; filling: string; finish: string; inscription: string; notes: string }; materialExtras: Array<{ inventoryItemId: number; quantity: number }>; estimatedLaborCost: number; estimatedPackagingCost: number }) => unwrap(await api.post<ApiSuccess<DesignQuote>>(`/cakes/design-requests/${requestId}/quotes`, input)),
  reject: async (requestId: number, branchId: number) => unwrap(await api.post<ApiSuccess<DesignRequest>>(`/cakes/design-requests/${requestId}/reject`, { branchId })),
  capacities: async (branchId: number) => unwrap(await api.get<ApiSuccess<StationCapacity[]>>('/cakes/capacity', { params: { branchId } })),
  setCapacity: async (input: { branchId: number; workDate: string; station: Station; capacityMinutes: number }) => unwrap(await api.put<ApiSuccess<StationCapacity>>('/cakes/capacity', input)),
  restoreCapacity: async (input: { branchId: number; workDate: string; station: Station }) => unwrap(await api.delete<ApiSuccess<StationCapacity>>('/cakes/capacity', { data: input })),
  tasks: async (branchId: number, mine = false) => unwrap(await api.get<ApiSuccess<ProductionTask[]>>('/cakes/tasks', { params: { branchId, mine: mine ? 'true' : 'false' } })),
  productionStaff: async (branchId: number) => unwrap(await api.get<ApiSuccess<Array<{ id: number; firstName: string; lastName: string }>>>('/cakes/staff', { params: { branchId } })),
  recordMaterials: async (taskId: number, input: { branchId: number; consumed: Record<string, number>; waste: Record<string, number>; expectedMaterials?: { consumed: Record<string, number>; waste: Record<string, number> } }) => unwrap(await api.patch<ApiSuccess<ProductionTask>>(`/cakes/tasks/${taskId}/materials`, input)),
  updateTask: async (taskId: number, input: { branchId: number; status?: 'IN_PROGRESS' | 'BLOCKED' | 'DONE'; assignedTo?: number | null; checklistJson?: Record<string, boolean>; evidenceUrl?: string | null }) => unwrap(await api.patch<ApiSuccess<ProductionTask>>(`/cakes/tasks/${taskId}`, input)),
  uploadEvidence: async (taskId: number, branchId: number, dataUrl: string) => unwrap(await api.post<ApiSuccess<{ id: number; hasEvidence: boolean }>>(`/cakes/tasks/${taskId}/evidence`, { branchId, dataUrl })),
  reference: async (requestId: number) => (await api.get<Blob>(`/cakes/design-requests/${requestId}/reference`, { responseType: 'blob' })).data,
  referenceAttachment: async (requestId: number, referenceId: number) => (await api.get<Blob>(`/cakes/design-requests/${requestId}/references/${referenceId}`, { responseType: 'blob' })).data,
  evidence: async (taskId: number, branchId: number) => (await api.get<Blob>(`/cakes/tasks/${taskId}/evidence`, { params: { branchId }, responseType: 'blob' })).data,
  commissions: async (branchId: number) => unwrap(await api.get<ApiSuccess<CakeCommissionReport>>('/admin/cake-commissions', { params: { branchId } })),
  adjustCommission: async (id: number, adjustmentAmount: number, notes?: string) => unwrap(await api.patch<ApiSuccess<CakeCommissionRow>>(`/admin/cake-commissions/${id}/adjustment`, { adjustmentAmount, notes })),
  liquidateCommission: async (id: number, reference: string, amount: number, notes?: string) => unwrap(await api.post<ApiSuccess<CakeCommissionRow>>(`/admin/cake-commissions/${id}/liquidate`, { reference, amount, notes })),
  financeReport: async (branchId: number, from?: string, to?: string) => unwrap(await api.get<ApiSuccess<CakeFinanceReport>>('/admin/cake-finance/report', { params: { branchId, from, to } })),
  createExpense: async (input: { branchId: number; orderId?: number; category: string; amount: number; reference: string; occurredAt: string; notes?: string }) => unwrap(await api.post<ApiSuccess<unknown>>('/admin/cake-finance/expenses', input)),
  createPlatformExpense: async (input: { category: string; amount: number; reference: string; occurredAt: string; notes?: string }) => unwrap(await api.post<ApiSuccess<unknown>>('/admin/cake-finance/platform-expenses', input)),
  recordSupplierPayment: async (input: { branchId: number; purchaseOrderId: number; amount: number; reference: string; occurredAt: string; notes?: string }) => unwrap(await api.post<ApiSuccess<unknown>>('/admin/cake-finance/supplier-payments', input)),
  reconcilePayment: async (input: { branchId: number; paymentId: number; fee: number; netAmount: number; reference: string; occurredAt: string; notes?: string }) => unwrap(await api.post<ApiSuccess<unknown>>('/admin/cake-finance/payment-fees', input)),
};
