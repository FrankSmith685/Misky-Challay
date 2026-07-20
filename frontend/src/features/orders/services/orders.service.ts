import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { OrderDetail, OrderWithPayment } from '@features/checkout/types';

export const ordersApi = {
  async list(): Promise<OrderDetail[]> {
    const { data } = await api.get<ApiSuccess<OrderDetail[]>>(ENDPOINTS.orders.root);
    return data.data;
  },

  async detail(orderNumber: string): Promise<OrderWithPayment> {
    const { data } = await api.get<ApiSuccess<OrderWithPayment>>(
      ENDPOINTS.orders.detail(orderNumber),
    );
    return data.data;
  },

  /** RN-018: el backend decide si todavia se puede cancelar. */
  async cancel(orderNumber: string, reason: string): Promise<void> {
    await api.post(ENDPOINTS.orders.cancel(orderNumber), { reason });
  },
};
