import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface SupplierRow {
  id: number; code: string; name: string; taxId?: string | null; contactName?: string | null;
  email?: string | null; phone?: string | null; address?: string | null; paymentTermsDays: number;
  notes?: string | null; isActive: boolean;
}

export interface ProcurementItem {
  id: number; code: string; name: string; unit: string; unitCost?: number;
}

export interface PurchaseOrderLine {
  id: number; inventoryItemId: number; item?: ProcurementItem | null; quantityOrdered: number;
  quantityReceived: number; unitCost: number; lotCode?: string | null; expiresAt?: string | null; notes?: string | null;
}

export interface PurchaseOrderRow {
  id: number; orderNumber: string; branchId: number; supplierId: number; supplier?: SupplierRow | null;
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'; orderedAt?: string | null;
  expectedAt?: string | null; receivedAt?: string | null; notes?: string | null; subtotal: number; tax: number; total: number;
  items: PurchaseOrderLine[];
}

export interface LotRow {
  id: number; lotCode: string; inventoryItemId: number; item?: ProcurementItem | null; supplier?: SupplierRow | null;
  purchaseOrderId?: number | null; status: string; receivedAt: string; expiresAt?: string | null;
  quantityReceived: number; quantityAvailable: number; unitCost: number; stockValue: number;
}

export interface CostSummary {
  purchasesTotal: number; stockValue: number; consumedCost: number;
  rows: Array<{ inventoryItemId: number; name: string; purchased: number; consumed: number; stockValue: number }>;
}

export const procurementApi = {
  async suppliers(includeInactive = false): Promise<SupplierRow[]> {
    const { data } = await api.get<ApiSuccess<SupplierRow[]>>('/operations/procurement/suppliers', { params: { includeInactive } });
    return data.data;
  },
  async createSupplier(input: Omit<SupplierRow, 'id' | 'isActive' | 'code'>): Promise<SupplierRow> {
    const { data } = await api.post<ApiSuccess<SupplierRow>>('/operations/procurement/suppliers', input);
    return data.data;
  },
  async updateSupplier(id: number, input: Partial<SupplierRow>): Promise<SupplierRow> {
    const { data } = await api.patch<ApiSuccess<SupplierRow>>(`/operations/procurement/suppliers/${id}`, input);
    return data.data;
  },
  async inventory(branchId: number): Promise<ProcurementItem[]> {
    const { data } = await api.get<ApiSuccess<ProcurementItem[]>>('/operations/procurement/items', { params: { branchId } });
    return data.data;
  },
  async purchaseOrders(branchId: number, status?: string): Promise<PurchaseOrderRow[]> {
    const { data } = await api.get<ApiSuccess<PurchaseOrderRow[]>>('/operations/procurement/purchase-orders', { params: { branchId, status } });
    return data.data;
  },
  async createPurchaseOrder(input: { branchId: number; supplierId: number; expectedAt?: string; notes?: string; tax?: number; items: Array<{ inventoryItemId: number; quantity: number; unitCost: number; notes?: string }> }): Promise<PurchaseOrderRow> {
    const { data } = await api.post<ApiSuccess<PurchaseOrderRow>>('/operations/procurement/purchase-orders', input);
    return data.data;
  },
  async updatePurchaseOrder(orderId: number, input: { branchId: number; supplierId: number; expectedAt?: string; notes?: string; tax?: number; items: Array<{ inventoryItemId: number; quantity: number; unitCost: number; notes?: string }> }): Promise<PurchaseOrderRow> {
    const { data } = await api.patch<ApiSuccess<PurchaseOrderRow>>(`/operations/procurement/purchase-orders/${orderId}`, input);
    return data.data;
  },
  async receivePurchaseOrder(orderId: number, input: { branchId: number; lines: Array<{ purchaseOrderItemId: number; quantity: number; lotCode: string; expiresAt?: string; unitCost?: number }> }): Promise<PurchaseOrderRow> {
    const { data } = await api.post<ApiSuccess<PurchaseOrderRow>>(`/operations/procurement/purchase-orders/${orderId}/receive`, input);
    return data.data;
  },
  async cancelPurchaseOrder(orderId: number, branchId: number, reason: string): Promise<PurchaseOrderRow> {
    const { data } = await api.post<ApiSuccess<PurchaseOrderRow>>(`/operations/procurement/purchase-orders/${orderId}/cancel`, { branchId, reason });
    return data.data;
  },
  async lots(branchId: number, status?: string): Promise<LotRow[]> {
    const { data } = await api.get<ApiSuccess<LotRow[]>>('/operations/procurement/lots', { params: { branchId, status } });
    return data.data;
  },
  async costSummary(branchId: number): Promise<CostSummary> {
    const { data } = await api.get<ApiSuccess<CostSummary>>('/operations/procurement/cost-summary', { params: { branchId } });
    return data.data;
  },
};
