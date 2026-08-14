import type { StaffModuleKey } from '../../constants/staffModules';
import { apiCall, apiPaged, apiRequest, type PaginationMeta } from './client';

export type StaffRow = Record<string, unknown>;

export interface StaffLoadOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export interface StaffModulePayload {
  rows: StaffRow[];
  summary?: Record<string, unknown>;
  meta?: PaginationMeta;
}

const rows = (value: unknown): StaffRow[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is StaffRow => Boolean(entry && typeof entry === 'object'))
    : [];

const PAGE_SIZE = 20;

const label = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());

/** Configuraciones anidadas convertidas en filas, sin exponer secretos. */
const settingRows = (value: StaffRow, group = 'Configuración'): StaffRow[] =>
  Object.entries(value).flatMap(([key, entry]) => {
    if (['smtpPassword', 'secret', 'token', 'apiKey'].some((term) => key.toLowerCase().includes(term.toLowerCase()))) return [];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return settingRows(entry as StaffRow, label(key));
    }
    if (Array.isArray(entry)) return [];
    return [{ id: `${group}:${key}`, name: label(key), value: entry, group }];
  });

const needsBranch = new Set<StaffModuleKey>([
  'dashboard', 'orders', 'cash', 'dining', 'kitchen', 'delivery', 'inventory',
]);

const singlePage = (items: StaffRow[]): PaginationMeta => ({
  page: 1,
  pageSize: items.length,
  total: items.length,
  totalPages: 1,
});

export const staffApi = {
  async load(
    module: StaffModuleKey,
    branchId?: number,
    options: StaffLoadOptions = {},
  ): Promise<StaffModulePayload> {
    if (needsBranch.has(module) && !branchId) throw new Error('Elige el local que deseas operar.');
    const page = options.page ?? 1;
    const pageSize = Math.min(50, Math.max(10, options.pageSize ?? PAGE_SIZE));

    switch (module) {
      case 'dashboard': {
        const data = await apiRequest<StaffRow>('/admin/reports', { auth: true, query: { branchId } });
        return { rows: rows(data.topProducts), summary: data };
      }
      case 'orders': {
        const result = await apiPaged<StaffRow>('/admin/orders', {
          auth: true,
          query: { branchId, page, pageSize, search: options.search, status: options.status },
        });
        return { rows: result.items, meta: result.meta };
      }
      case 'cash': {
        const [items, reports] = await Promise.all([
          apiRequest<StaffRow[]>('/payments/mobile/pending', { auth: true, query: { branchId } }),
          apiRequest<StaffRow>('/admin/reports', { auth: true, query: { branchId } }),
        ]);
        return { rows: items, meta: singlePage(items), summary: reports };
      }
      case 'dining': return { rows: await apiRequest<StaffRow[]>('/operations/dining/tables', { auth: true, query: { branchId } }) };
      case 'kitchen': {
        const data = await apiRequest<StaffRow>('/operations/kitchen/board', { auth: true, query: { branchId } });
        const scheduled = rows(data.scheduled).map((order) => ({
          id: -Number(order.id),
          sourceOrderId: order.id,
          status: 'SCHEDULED',
          isScheduledPreview: true,
          releaseAt: order.releaseAt,
          targetAt: order.scheduledAt,
          order,
        }));
        return {
          rows: [...scheduled, ...rows(data.tickets)],
          summary: (data.stats as StaffRow) ?? undefined,
        };
      }
      case 'delivery': return { rows: await apiRequest<StaffRow[]>('/delivery/board', { auth: true, query: { branchId } }) };
      case 'inventory': return { rows: await apiRequest<StaffRow[]>('/operations/inventory', { auth: true, query: { branchId } }) };
      case 'catalog': return { rows: await apiRequest<StaffRow[]>('/admin/catalog/products', { auth: true, query: { search: options.search, status: options.status } }) };
      case 'builder': {
        const products = await apiRequest<StaffRow[]>('/admin/catalog/products', { auth: true });
        return { rows: products.filter((product) => product.type === 'CUSTOMIZABLE') };
      }
      case 'media': {
        const envelope = await apiCall<StaffRow[]>('/media', { auth: true, query: { page, limit: pageSize, search: options.search } });
        const items = envelope.data ?? [];
        return { rows: items, meta: envelope.meta ?? singlePage(items) };
      }
      case 'coupons': return { rows: await apiRequest<StaffRow[]>('/admin/coupons', { auth: true }) };
      case 'plans': return { rows: await apiRequest<StaffRow[]>('/admin/plans', { auth: true }) };
      case 'coverage': {
        const data = await apiRequest<StaffRow>('/admin/coverage', { auth: true });
        return { rows: [...rows(data.branches), ...rows(data.zones)], summary: data };
      }
      case 'users': return { rows: await apiRequest<StaffRow[]>('/access/staff', { auth: true }) };
      case 'roles': return { rows: await apiRequest<StaffRow[]>('/access/roles', { auth: true }) };
      case 'complaints': {
        const result = await apiPaged<StaffRow>('/complaints', { auth: true, query: { page, pageSize, search: options.search, status: options.status } });
        return { rows: result.items, meta: result.meta };
      }
      case 'audit': {
        const result = await apiPaged<StaffRow>('/admin/audit-logs', { auth: true, query: { page, pageSize } });
        return { rows: result.items, meta: result.meta };
      }
      case 'business': {
        const [business, payments, receipts, communication, notifications] = await Promise.all([
          apiRequest<StaffRow>('/settings/business', { auth: true }),
          apiRequest<StaffRow>('/settings/local-payments', { auth: true }),
          apiRequest<StaffRow>('/settings/receipts', { auth: true }),
          apiRequest<StaffRow>('/settings/communication', { auth: true }),
          apiRequest<StaffRow>('/settings/notification-history', { auth: true }),
        ]);
        return {
          rows: [
            ...settingRows((business.business as StaffRow) ?? {}, 'Datos legales'),
            ...settingRows((payments.localPayments as StaffRow) ?? {}, 'Yape y Plin'),
            ...settingRows((receipts.receipts as StaffRow) ?? {}, 'Tickets'),
            ...settingRows((communication.communication as StaffRow) ?? {}, 'Comunicaciones'),
          ],
          summary: { business, payments, receipts, communication, notifications },
        };
      }
      case 'design': {
        const data = await apiRequest<StaffRow>('/settings/public');
        return { rows: settingRows(data, 'Sistema compartido'), summary: data };
      }
    }
  },

  orderDetail: (orderNumber: string) =>
    apiRequest<StaffRow>(`/admin/orders/${encodeURIComponent(orderNumber)}`, { auth: true }),
  updateOrder: (orderNumber: string, status: string, comment?: string) =>
    apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, { method: 'POST', auth: true, body: { status, comment } }),
  registerInvoice: (orderNumber: string, input: { series: string; number: string; providerReference?: string; pdfUrl?: string; xmlUrl?: string }) =>
    apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/invoice`, { method: 'POST', auth: true, body: input }),
  recordInternalReceiptPrint: (orderNumber: string) =>
    apiRequest<StaffRow>(`/admin/orders/${encodeURIComponent(orderNumber)}/internal-receipt/print`, { method: 'POST', auth: true }),
  refundPayment: (paymentId: number, amount: number, reason: string) =>
    apiRequest(`/payments/${paymentId}/refund`, { method: 'POST', auth: true, body: { amount, reason } }),

  advanceKitchen: (ticketId: number, status: string, comment?: string) =>
    apiRequest(`/operations/kitchen/tickets/${ticketId}/advance`, { method: 'POST', auth: true, body: { status, comment } }),
  advanceDelivery: (deliveryId: number, status: string, comment?: string) =>
    apiRequest(`/delivery/${deliveryId}/advance`, { method: 'POST', auth: true, body: { status, comment } }),
  drivers: (branchId: number) => apiRequest<StaffRow[]>('/delivery/drivers', { auth: true, query: { branchId } }),
  assignDriver: (deliveryId: number, driverId: number, reason?: string) =>
    apiRequest(`/delivery/${deliveryId}/assign`, { method: 'POST', auth: true, body: { driverId, reason } }),
  reviewPayment: (paymentId: number, decision: 'APPROVE' | 'REJECT', reason?: string) =>
    apiRequest(`/payments/${paymentId}/mobile/review`, { method: 'POST', auth: true, body: { decision, reason } }),

  createDiningTable: (input: { branchId: number; code: string; area: string; capacity: number }) =>
    apiRequest('/operations/dining/tables', { method: 'POST', auth: true, body: input }),
  diningCatalog: (branchId: number) => apiRequest<StaffRow[]>('/operations/dining/catalog', { auth: true, query: { branchId } }),
  openDiningCommand: (input: { branchId: number; tableId: number; guestName?: string; notes?: string; items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number; specialInstructions?: string }> }) =>
    apiRequest('/operations/dining/commands', { method: 'POST', auth: true, body: input }),
  addDiningCommandItems: (orderNumber: string, branchId: number, items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number; specialInstructions?: string }>) =>
    apiRequest(`/operations/dining/commands/${encodeURIComponent(orderNumber)}/items`, { method: 'POST', auth: true, body: { branchId, items } }),
  setDiningQr: (tableId: number, input: { branchId: number; enabled?: boolean; regenerate?: boolean }) =>
    apiRequest(`/operations/dining/tables/${tableId}/qr`, { method: 'PATCH', auth: true, body: input }),
  closeDiningCommand: (orderNumber: string, input: {
    branchId: number;
    payments: Array<{ method: string; amount: number }>;
    documentType: 'BOLETA' | 'FACTURA';
    billingDocType?: 'DNI' | 'RUC' | 'CE' | null;
    billingDocNumber?: string | null;
    billingName?: string | null;
    billingAddress?: string | null;
  }) =>
    apiRequest(`/operations/dining/commands/${encodeURIComponent(orderNumber)}/close`, { method: 'POST', auth: true, body: input }),

  createInventoryItem: (input: { branchId: number; code: string; name: string; unit: string; unitCost: number; minLevel: number; initialStock: number }) =>
    apiRequest('/operations/inventory/items', { method: 'POST', auth: true, body: input }),
  adjustStock: (input: { branchId: number; inventoryItemId: number; type: 'PURCHASE' | 'WASTE' | 'ADJUSTMENT'; quantity: number; reason: string }) =>
    apiRequest('/operations/inventory/adjust', { method: 'POST', auth: true, body: input }),

  changeProductStatus: (productId: number, status: 'DRAFT' | 'ACTIVE' | 'INACTIVE') =>
    apiRequest(`/admin/catalog/products/${productId}/status`, { method: 'PATCH', auth: true, body: { status } }),
  updateProduct: (productId: number, input: StaffRow) =>
    apiRequest(`/admin/catalog/products/${productId}`, { method: 'PATCH', auth: true, body: input }),
  catalogMeta: () => apiRequest<StaffRow>('/admin/catalog/meta', { auth: true }),
  createProduct: (input: StaffRow) => apiRequest('/admin/catalog/products', { method: 'POST', auth: true, body: input }),
  updateVariant: (variantId: number, input: StaffRow) =>
    apiRequest(`/admin/catalog/variants/${variantId}`, { method: 'PATCH', auth: true, body: input }),
  addVariant: (productId: number, input: { name: string; basePrice: number }) =>
    apiRequest(`/admin/catalog/products/${productId}/variants`, { method: 'POST', auth: true, body: input }),
  updateNutrition: (variantId: number, input: StaffRow) =>
    apiRequest(`/admin/catalog/variants/${variantId}/nutrition`, { method: 'PATCH', auth: true, body: input }),
  setAllergens: (productId: number, allergenIds: number[]) =>
    apiRequest(`/admin/catalog/products/${productId}/allergens`, { method: 'PATCH', auth: true, body: { allergenIds } }),
  setDietaryTags: (productId: number, tagIds: number[]) =>
    apiRequest(`/admin/catalog/products/${productId}/dietary-tags`, { method: 'PATCH', auth: true, body: { tagIds } }),
  setProductAvailability: (productId: number, input: { branchId?: number; isAvailable: boolean; reason?: string }) =>
    apiRequest(`/admin/catalog/products/${productId}/availability`, { method: 'PATCH', auth: true, body: input }),
  updateBuilderOption: (optionId: number, input: StaffRow) =>
    apiRequest(`/admin/builder/options/${optionId}`, { method: 'PATCH', auth: true, body: input }),
  builder: (productId: number) => apiRequest<StaffRow>(`/admin/builder/${productId}`, { auth: true }),

  toggleCoupon: (couponId: number, isActive: boolean) =>
    apiRequest(`/admin/coupons/${couponId}`, { method: 'PATCH', auth: true, body: { isActive } }),
  createCoupon: (input: StaffRow) => apiRequest('/admin/coupons', { method: 'POST', auth: true, body: input }),
  updateCoupon: (couponId: number, input: StaffRow) => apiRequest(`/admin/coupons/${couponId}`, { method: 'PATCH', auth: true, body: input }),
  createPlan: (input: StaffRow) => apiRequest('/admin/plans', { method: 'POST', auth: true, body: input }),
  updatePlan: (planId: number, input: StaffRow) =>
    apiRequest(`/admin/plans/${planId}`, { method: 'PATCH', auth: true, body: input }),
  setPlanBenefit: (planId: number, input: StaffRow) =>
    apiRequest(`/admin/plans/${planId}/benefits`, { method: 'PUT', auth: true, body: input }),
  removePlanBenefit: (planId: number, benefitId: number) =>
    apiRequest(`/admin/plans/${planId}/benefits/${benefitId}`, { method: 'DELETE', auth: true }),
  createBranch: (input: StaffRow) => apiRequest('/admin/coverage/branches', { method: 'POST', auth: true, body: input }),
  createZone: (input: StaffRow) => apiRequest('/admin/coverage/zones', { method: 'POST', auth: true, body: input }),
  updateBranch: (branchId: number, input: StaffRow) =>
    apiRequest(`/admin/coverage/branches/${branchId}`, { method: 'PATCH', auth: true, body: input }),
  updateZone: (zoneId: number, input: StaffRow) =>
    apiRequest(`/admin/coverage/zones/${zoneId}`, { method: 'PATCH', auth: true, body: input }),
  setBranchSchedule: (branchId: number, input: StaffRow) =>
    apiRequest(`/admin/coverage/branches/${branchId}/schedule`, { method: 'PUT', auth: true, body: input }),

  setStaffStatus: (userId: number, status: 'ACTIVE' | 'BLOCKED') =>
    apiRequest(`/access/staff/${userId}/status`, { method: 'PATCH', auth: true, body: { status } }),
  setSuperAdmin: (userId: number, value: boolean) =>
    apiRequest(`/access/staff/${userId}/superadmin`, { method: 'PATCH', auth: true, body: { value } }),
  permissions: () => apiRequest<StaffRow[]>('/access/permissions', { auth: true }),
  roles: () => apiRequest<StaffRow[]>('/access/roles', { auth: true }),
  createRole: (input: StaffRow) => apiRequest('/access/roles', { method: 'POST', auth: true, body: input }),
  updateRole: (roleId: number, input: StaffRow) => apiRequest(`/access/roles/${roleId}`, { method: 'PATCH', auth: true, body: input }),
  deleteRole: (roleId: number) => apiRequest(`/access/roles/${roleId}`, { method: 'DELETE', auth: true }),
  createStaff: (input: StaffRow) => apiRequest('/access/staff', { method: 'POST', auth: true, body: input }),
  updateStaffRoles: (userId: number, input: StaffRow) => apiRequest(`/access/staff/${userId}/roles`, { method: 'PATCH', auth: true, body: input }),
  complaintDetail: (id: number) => apiRequest<StaffRow>(`/complaints/${id}`, { auth: true }),
  respondComplaint: (id: number, response: string, status: 'IN_PROGRESS' | 'RESOLVED') =>
    apiRequest(`/complaints/${id}/respond`, { method: 'POST', auth: true, body: { response, status } }),

  updateBusiness: (input: StaffRow) => apiRequest('/settings/business', { method: 'PUT', auth: true, body: input }),
  updateLocalPayments: (input: StaffRow) => apiRequest('/settings/local-payments', { method: 'PUT', auth: true, body: input }),
  updateReceipts: (input: StaffRow) => apiRequest('/settings/receipts', { method: 'PUT', auth: true, body: input }),
  updateCommunication: (input: StaffRow) => apiRequest('/settings/communication', { method: 'PUT', auth: true, body: input }),
  sendTestEmail: (recipient: string) => apiRequest('/settings/communication/test', { method: 'POST', auth: true, body: { recipient } }),
  uploadMedia: (input: { fileName: string; mimeType: 'image/webp' | 'image/jpeg' | 'image/png'; dataUrl: string; altText?: string | null; category?: string }) =>
    apiRequest('/media', { method: 'POST', auth: true, body: input }),
  importMediaFromUrl: (input: { sourceUrl: string; altText?: string | null; category?: string }) =>
    apiRequest('/media/import-url', { method: 'POST', auth: true, body: input }),
  updateMedia: (id: number, input: StaffRow) => apiRequest(`/media/${id}`, { method: 'PATCH', auth: true, body: input }),
  removeMedia: (id: number) => apiRequest(`/media/${id}`, { method: 'DELETE', auth: true }),
  restoreMedia: (id: number) => apiRequest(`/media/${id}/restore`, { method: 'POST', auth: true }),
};
