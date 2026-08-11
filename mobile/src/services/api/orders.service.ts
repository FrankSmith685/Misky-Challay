import type { OrderSummary, OrderWithPayment } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const ordersApi = {
  list: () => apiRequest<OrderSummary[]>(ENDPOINTS.orders.root, { method: 'GET', auth: true }),
  detail: (orderNumber: string) => apiRequest<OrderWithPayment>(ENDPOINTS.orders.detail(orderNumber), { auth: true }),
  cancel: (orderNumber: string, reason: string) => apiRequest<{ orderNumber: string; status: string; refunded: boolean }>(ENDPOINTS.orders.cancel(orderNumber), { method: 'POST', auth: true, body: { reason } }),
};
