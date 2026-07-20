import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import type {
  AdminOrderRow,
  DeliveryRow,
  DeliveryStatus,
  Driver,
  KitchenBoard,
  Reports,
  StockRow,
  AuditLogRow,
  TicketStatus,
} from '../types';

/** Todas estas llamadas exigen permisos: el backend las valida (seccion 7.1). */
export const adminApi = {
  async auditLogs(entity?: string): Promise<AuditLogRow[]> {
    const { data } = await api.get<ApiSuccess<AuditLogRow[]>>('/admin/audit-logs', { params: { entity, pageSize: 30 } });
    return data.data;
  },
  // --- Cocina ---
  async kitchenBoard(branchId: number): Promise<KitchenBoard> {
    const { data } = await api.get<ApiSuccess<KitchenBoard>>('/operations/kitchen/board', {
      params: { branchId },
    });
    return data.data;
  },

  async advanceTicket(ticketId: number, status: TicketStatus, comment?: string): Promise<void> {
    await api.post(`/operations/kitchen/tickets/${ticketId}/advance`, { status, comment });
  },

  // --- Inventario ---
  async stock(branchId: number): Promise<StockRow[]> {
    const { data } = await api.get<ApiSuccess<StockRow[]>>('/operations/inventory', {
      params: { branchId },
    });
    return data.data;
  },

  async createInventoryItem(input: {
    branchId: number;
    code: string;
    name: string;
    unit: string;
    unitCost: number;
    minLevel: number;
    initialStock: number;
  }): Promise<void> {
    await api.post('/operations/inventory/items', input);
  },

  async adjustStock(input: {
    branchId: number;
    inventoryItemId: number;
    type: 'PURCHASE' | 'WASTE' | 'ADJUSTMENT';
    quantity: number;
    reason: string;
  }): Promise<void> {
    await api.post('/operations/inventory/adjust', input);
  },

  // --- Delivery ---
  async deliveryBoard(branchId: number): Promise<DeliveryRow[]> {
    const { data } = await api.get<ApiSuccess<DeliveryRow[]>>('/delivery/board', {
      params: { branchId },
    });
    return data.data;
  },

  async drivers(branchId: number): Promise<Driver[]> {
    const { data } = await api.get<ApiSuccess<Driver[]>>('/delivery/drivers', {
      params: { branchId },
    });
    return data.data;
  },

  async assignDriver(deliveryId: number, driverId: number): Promise<void> {
    await api.post(`/delivery/${deliveryId}/assign`, { driverId });
  },

  async advanceDelivery(deliveryId: number, status: DeliveryStatus): Promise<void> {
    await api.post(`/delivery/${deliveryId}/advance`, { status });
  },

  // --- Pedidos y reportes ---
  async orders(params: { branchId?: number; status?: string; search?: string }): Promise<AdminOrderRow[]> {
    const { data } = await api.get<ApiSuccess<AdminOrderRow[]>>('/admin/orders', { params });
    return data.data;
  },

  async updateOrderStatus(orderNumber: string, status: string, comment?: string): Promise<void> {
    await api.post(`/admin/orders/${orderNumber}/status`, { status, comment });
  },

  async reports(branchId?: number): Promise<Reports> {
    const { data } = await api.get<ApiSuccess<Reports>>('/admin/reports', {
      params: branchId ? { branchId } : {},
    });
    return data.data;
  },
};
