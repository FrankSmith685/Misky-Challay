import type { OrderSummary, OrderWithPayment } from '../../types/domain';
import { apiPaged, apiRequest, type PagedResult } from './client';
import { ENDPOINTS } from './endpoints';

export interface OrdersPage {
  page?: number;
  /** Tope del backend: 50 por página. */
  pageSize?: number;
}

export interface CancelledOrder {
  orderNumber: string;
  status: string;
  refunded: boolean;
}

export interface PaymentRetry {
  orderNumber: string;
  status: string;
  /** Siempre viene: o se reabre la sesion o la peticion falla. Nunca es null. */
  checkoutUrl: string;
  provider: string;
  amount: number;
  currency: string;
  /** true = el enlace que ya tenias sigue vivo y se devuelve tal cual. */
  reused: boolean;
}

export const ordersApi = {
  /**
   * Historial paginado: devuelve también `meta`, así que la pantalla sabe
   * cuántos pedidos hay y puede pedir la página siguiente. Es la que hay que
   * usar en el historial.
   */
  listPaged: (page: OrdersPage = {}): Promise<PagedResult<OrderSummary>> =>
    apiPaged<OrderSummary>(ENDPOINTS.orders.root, {
      method: 'GET',
      auth: true,
      query: { page: page.page, pageSize: page.pageSize },
    }),

  /**
   * Atajo a la primera página, sin `meta`. Se queda en los 20 primeros pedidos
   * sin manera de saber que hay más: sirve para un resumen corto (los últimos
   * pedidos en la portada), nunca para el historial completo. Usa `listPaged`.
   */
  list: async (): Promise<OrderSummary[]> =>
    (await apiPaged<OrderSummary>(ENDPOINTS.orders.root, { method: 'GET', auth: true })).items,

  detail: (orderNumber: string) =>
    apiRequest<OrderWithPayment>(ENDPOINTS.orders.detail(orderNumber), { auth: true }),

  cancel: (orderNumber: string, reason: string) =>
    apiRequest<CancelledOrder>(ENDPOINTS.orders.cancel(orderNumber), {
      method: 'POST',
      auth: true,
      body: { reason },
    }),

  /**
   * Reintentar el cobro de un pedido en PENDING_PAYMENT.
   *
   * `client: 'MOBILE'` no es opcional en la práctica: sin él la pasarela devuelve
   * al cliente a la pantalla web en lugar de a la app.
   *
   * Errores esperables: 403 si el pedido no es suyo, 422 si ya no está en
   * PENDING_PAYMENT o si el pago es Yape/Plin esperando revisión de Caja, y 409
   * si otra petición está abriendo la sesión en ese mismo instante (basta con
   * reintentar a los pocos segundos).
   */
  retryPayment: (orderNumber: string) =>
    apiRequest<PaymentRetry>(ENDPOINTS.orders.paymentRetry(orderNumber), {
      method: 'POST',
      auth: true,
      body: { client: 'MOBILE' },
    }),
};
