import { api } from '@services/api/client';
import type { ApiSuccess, PaginationMeta } from '@/types/api';
import type {
  AdminOrderDetail,
  AdminOrderRow,
  DeliveryRow,
  DeliveryStatus,
  Driver,
  KitchenBoard,
  DiningProduct,
  DiningTableRow,
  DiningOffering,
  DiningPaymentMethod,
  DiningReceipt,
  Reports,
  PendingMobilePayment,
  StockRow,
  AuditLogRow,
  TicketStatus,
} from '../types';

/**
 * Meta de paginacion por defecto: el backend siempre la envia en las listas
 * paginadas, pero si faltara se asume una sola pagina para no romper la UI.
 */
const singlePage = (length: number): PaginationMeta => ({
  page: 1,
  pageSize: length,
  total: length,
  totalPages: 1,
});

export interface AdminOrderFilters {
  branchId?: number;
  status?: string;
  /** Numero de pedido, nombre o telefono del cliente (busqueda OR en el servidor). */
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogFilters {
  entity?: string;
  actorId?: number;
  page?: number;
  pageSize?: number;
}

/** Todas estas llamadas exigen permisos: el backend las valida (seccion 7.1). */
export const adminApi = {
  async pendingMobilePayments(branchId: number, signal?: AbortSignal): Promise<PendingMobilePayment[]> {
    const { data } = await api.get<ApiSuccess<PendingMobilePayment[]>>('/payments/mobile/pending', {
      params: { branchId }, signal,
    });
    return data.data;
  },

  async reviewMobilePayment(paymentId: number, decision: 'APPROVE' | 'REJECT', reason?: string): Promise<void> {
    await api.post(`/payments/${paymentId}/mobile/review`, { decision, reason });
  },

  /**
   * Ultimos cambios de una entidad, sin paginacion: lo usan los historiales
   * embebidos (Cobertura, Constructor), que solo pintan una lista corta.
   */
  async auditLogs(entity?: string, pageSize = 30): Promise<AuditLogRow[]> {
    const { data } = await api.get<ApiSuccess<AuditLogRow[]>>('/admin/audit-logs', {
      params: { entity, pageSize },
    });
    return data.data;
  },

  /** Bitacora completa con filtros y paginacion (pantalla /admin/bitacora). */
  async auditLogPage(
    filters: AuditLogFilters = {},
  ): Promise<{ rows: AuditLogRow[]; meta: PaginationMeta }> {
    const { data } = await api.get<ApiSuccess<AuditLogRow[]>>('/admin/audit-logs', {
      params: filters,
    });
    return { rows: data.data, meta: data.meta ?? singlePage(data.data.length) };
  },

  // --- Cocina ---
  async kitchenBoard(branchId: number, signal?: AbortSignal): Promise<KitchenBoard> {
    const { data } = await api.get<ApiSuccess<KitchenBoard>>('/operations/kitchen/board', {
      params: { branchId },
      signal,
    });
    return data.data;
  },

  async advanceTicket(ticketId: number, status: TicketStatus, comment?: string): Promise<void> {
    await api.post(`/operations/kitchen/tickets/${ticketId}/advance`, { status, comment });
  },

  async kitchenPushConfig(): Promise<{ enabled: boolean; publicKey: string }> {
    const { data } = await api.get<ApiSuccess<{ enabled: boolean; publicKey: string }>>('/operations/kitchen/push/config');
    return data.data;
  },

  async subscribeKitchenPush(input: {
    branchId: number;
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }): Promise<void> {
    await api.post('/operations/kitchen/push/subscriptions', input);
  },

  async unsubscribeKitchenPush(endpoint: string): Promise<void> {
    await api.delete('/operations/kitchen/push/subscriptions', { data: { endpoint } });
  },

  // --- Salón y comandas ---
  async diningTables(branchId: number, signal?: AbortSignal): Promise<DiningTableRow[]> {
    const { data } = await api.get<ApiSuccess<DiningTableRow[]>>('/operations/dining/tables', { params: { branchId }, signal });
    return data.data;
  },

  async diningCatalog(branchId: number): Promise<DiningProduct[]> {
    const { data } = await api.get<ApiSuccess<DiningProduct[]>>('/operations/dining/catalog', { params: { branchId } });
    return data.data;
  },

  async createDiningTable(input: { branchId: number; code: string; area: string; capacity: number }): Promise<void> {
    await api.post('/operations/dining/tables', input);
  },

  async openDiningCommand(input: {
    branchId: number;
    tableId: number;
    guestName?: string;
    notes?: string;
    items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number; specialInstructions?: string }>;
  }): Promise<{ orderNumber: string; status: string; total: number }> {
    const { data } = await api.post<ApiSuccess<{ orderNumber: string; status: string; total: number }>>('/operations/dining/commands', input);
    return data.data;
  },

  async addDiningCommandItems(orderNumber: string, branchId: number, items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number }>): Promise<void> {
    await api.post(`/operations/dining/commands/${orderNumber}/items`, { branchId, items });
  },

  async closeDiningCommand(orderNumber: string, input: {
    branchId: number;
    payments: Array<{ method: DiningPaymentMethod; amount: number }>;
    documentType: 'BOLETA' | 'FACTURA';
    billingDocType?: 'DNI' | 'RUC' | 'CE' | null;
    billingDocNumber?: string | null;
    billingName?: string | null;
    billingAddress?: string | null;
  }): Promise<DiningReceipt> {
    const { data } = await api.post<ApiSuccess<DiningReceipt>>(`/operations/dining/commands/${orderNumber}/close`, input);
    return data.data;
  },

  async diningOfferings(branchId: number): Promise<DiningOffering[]> {
    const { data } = await api.get<ApiSuccess<DiningOffering[]>>('/operations/dining/offerings', { params: { branchId } });
    return data.data;
  },

  async createDiningOffering(input: {
    branchId: number; productId: number; variantId: number; name: string; price: number;
    weekdays: number[]; startsAt: string; endsAt: string; dailyLimit?: number | null;
  }): Promise<void> {
    await api.post('/operations/dining/offerings', input);
  },

  async updateDiningOffering(offeringId: number, input: { branchId: number; isActive?: boolean; price?: number; dailyLimit?: number | null; startsAt?: string; endsAt?: string }): Promise<void> {
    await api.patch(`/operations/dining/offerings/${offeringId}`, input);
  },

  async updateDiningTableQr(tableId: number, input: { branchId: number; enabled?: boolean; regenerate?: boolean }): Promise<{ qrToken: string; qrEnabled: boolean }> {
    const { data } = await api.patch<ApiSuccess<{ qrToken: string; qrEnabled: boolean }>>(`/operations/dining/tables/${tableId}/qr`, input);
    return data.data;
  },

  // --- Inventario ---
  async stock(branchId: number, signal?: AbortSignal): Promise<StockRow[]> {
    const { data } = await api.get<ApiSuccess<StockRow[]>>('/operations/inventory', {
      params: { branchId },
      signal,
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
  async deliveryBoard(branchId: number, signal?: AbortSignal): Promise<DeliveryRow[]> {
    const { data } = await api.get<ApiSuccess<DeliveryRow[]>>('/delivery/board', {
      params: { branchId },
      signal,
    });
    return data.data;
  },

  async drivers(branchId: number, signal?: AbortSignal): Promise<Driver[]> {
    const { data } = await api.get<ApiSuccess<Driver[]>>('/delivery/drivers', {
      params: { branchId },
      signal,
    });
    return data.data;
  },

  async assignDriver(deliveryId: number, driverId: number): Promise<void> {
    await api.post(`/delivery/${deliveryId}/assign`, { driverId });
  },

  /**
   * Avanza el reparto. El `comment` es el motivo y viaja SIEMPRE: al marcar FAILED
   * es lo unico que explica por que no se pudo entregar (moto pinchada, cliente
   * ausente), y el backend lo guarda ademas como `failureReason`.
   */
  async advanceDelivery(
    deliveryId: number,
    status: DeliveryStatus,
    comment?: string,
  ): Promise<void> {
    await api.post(`/delivery/${deliveryId}/advance`, { status, comment });
  },

  // --- Pedidos y reportes ---
  /**
   * Tablero de pedidos PAGINADO. Antes se descartaba el `meta` que el controlador
   * ya devolvia y la lista se cortaba en 20 filas sin decirlo.
   */
  async orders(
    filters: AdminOrderFilters,
    signal?: AbortSignal,
  ): Promise<{ rows: AdminOrderRow[]; meta: PaginationMeta }> {
    const { data } = await api.get<ApiSuccess<AdminOrderRow[]>>('/admin/orders', {
      params: filters,
      signal,
    });
    return { rows: data.data, meta: data.meta ?? singlePage(data.data.length) };
  },

  /**
   * Ficha completa del pedido: lineas, personalizaciones, instrucciones,
   * historial de estados y pago. Endpoint a cargo del paquete F.
   */
  async orderDetail(orderNumber: string, signal?: AbortSignal): Promise<AdminOrderDetail> {
    const { data } = await api.get<ApiSuccess<AdminOrderDetail>>(`/admin/orders/${orderNumber}`, {
      signal,
    });
    return data.data;
  },

  async registerInvoice(
    orderNumber: string,
    input: {
      series: string;
      number: string;
      providerReference?: string;
      pdfUrl?: string;
      xmlUrl?: string;
    },
  ): Promise<void> {
    await api.post(`/admin/orders/${orderNumber}/invoice`, input);
  },

  async recordInternalReceiptPrint(orderNumber: string): Promise<{
    orderNumber: string;
    printCount: number;
    firstPrintedAt: string;
    lastPrintedAt: string;
  }> {
    const { data } = await api.post<ApiSuccess<{
      orderNumber: string;
      printCount: number;
      firstPrintedAt: string;
      lastPrintedAt: string;
    }>>(`/admin/orders/${orderNumber}/internal-receipt/print`);
    return data.data;
  },

  /**
   * Devuelve el MENSAJE del servidor, no `void`.
   *
   * Al cancelar, el backend avisa cuando el reembolso automatico no salio
   * ("Revisa si el pedido tenia un cobro con tarjeta pendiente de devolver") y ese
   * aviso se estaba tirando a la basura: el dinero se quedaba sin devolver y nadie
   * se enteraba. `refunded` dice si el proveedor acepto la devolucion.
   */
  async updateOrderStatus(
    orderNumber: string,
    status: string,
    comment?: string,
  ): Promise<{ orderNumber: string; status: string; refunded: boolean; message: string }> {
    const { data } = await api.post<
      ApiSuccess<{ orderNumber: string; status: string; refunded: boolean }>
    >(`/admin/orders/${orderNumber}/status`, { status, comment });
    return { ...data.data, message: data.message };
  },

  /**
   * Devolucion manual contra un cobro concreto (permiso `payment.refund`).
   * El importe es obligatorio en el esquema del servidor: no hay reembolso "total"
   * implicito.
   */
  async refundPayment(
    paymentId: number,
    input: { amount: number; reason: string },
  ): Promise<{ id: number; status: string; amount: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number; status: string; amount: number }>>(
      `/payments/${paymentId}/refund`,
      input,
    );
    return data.data;
  },

  async reports(
    branchId?: number,
    signal?: AbortSignal,
    range?: { from?: string; to?: string },
  ): Promise<Reports> {
    const { data } = await api.get<ApiSuccess<Reports>>('/admin/reports', {
      params: { ...(branchId ? { branchId } : {}), ...range },
      signal,
    });
    return data.data;
  },
};
