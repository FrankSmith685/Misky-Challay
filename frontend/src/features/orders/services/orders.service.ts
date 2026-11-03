import axios from 'axios';
import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { OrderDetail, OrderWithPayment } from '@features/checkout/types';
import { announceOrderChanged } from '../orderChanged';

/**
 * Solo un 404 (no existe) o un 403 (no es tuyo) significan "ese pedido no esta ahi".
 * Cualquier otro fallo es del servidor o de la red y merece un reintento, no un
 * mensaje que le diga al cliente que su pedido no existe.
 */
export const isMissingOrder = (error: unknown): boolean =>
  axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403);

export const ordersApi = {
  async listPage(page = 1, filter = 'ALL', signal?: AbortSignal): Promise<{ orders: OrderDetail[]; meta: { totalPages: number; counts: Record<'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED', number> } }> {
    const { data } = await api.get(ENDPOINTS.orders.root, { params: { page, pageSize: 20, filter }, signal });
    return { orders: data.data, meta: data.meta };
  },
  async active(): Promise<OrderDetail[]> {
    const result: OrderDetail[] = [];
    for (let page = 1; ; page++) {
      const response = await this.listPage(page, 'ACTIVE');
      result.push(...response.orders);
      if (page >= response.meta.totalPages) break;
    }
    return result;
  },
  async summary(): Promise<{ orders: OrderDetail[]; total: number }> {
    const [history, active] = await Promise.all([this.listPage(), this.active()]);
    return { orders: [...new Map([...history.orders, ...active].map((order) => [order.id, order])).values()], total: history.meta.counts.ALL };
  },
  async list(): Promise<OrderDetail[]> {
    const { data } = await api.get<ApiSuccess<OrderDetail[]>>(ENDPOINTS.orders.root);
    return data.data;
  },

  async detail(orderNumber: string): Promise<OrderWithPayment> {
    const { data } = await api.get<ApiSuccess<OrderWithPayment>>(
      ENDPOINTS.orders.detail(orderNumber),
    );
    announceOrderChanged(data.data.order);
    return data.data;
  },

  async stopWhatsapp(orderNumber: string): Promise<void> {
    await api.post(`/orders/${encodeURIComponent(orderNumber)}/whatsapp/stop`);
  },

  /** RN-018: el backend decide si todavia se puede cancelar. */
  async cancel(orderNumber: string, reason: string): Promise<string> {
    const { data } = await api.post(ENDPOINTS.orders.cancel(orderNumber), { reason });
    announceOrderChanged();
    return data.message ?? 'Pedido cancelado';
  },

  async payBalance(orderNumber: string): Promise<{ checkoutUrl: string | null }> {
    const { data } = await api.post<ApiSuccess<{ checkoutUrl: string | null }>>(`/orders/${encodeURIComponent(orderNumber)}/payment/balance`, { client: 'WEB' });
    return data.data;
  },

  async retryPayment(orderNumber: string): Promise<{ checkoutUrl: string | null }> {
    const { data } = await api.post<ApiSuccess<{ checkoutUrl: string | null }>>(
      `/orders/${encodeURIComponent(orderNumber)}/payment/retry`, { client: 'WEB' },
    );
    return data.data;
  },
};
