import axios from 'axios';
import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { OrderDetail, OrderWithPayment } from '@features/checkout/types';

/**
 * Solo un 404 (no existe) o un 403 (no es tuyo) significan "ese pedido no esta ahi".
 * Cualquier otro fallo es del servidor o de la red y merece un reintento, no un
 * mensaje que le diga al cliente que su pedido no existe.
 */
export const isMissingOrder = (error: unknown): boolean =>
  axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403);

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
