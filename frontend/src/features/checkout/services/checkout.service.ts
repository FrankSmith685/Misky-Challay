import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { CheckoutInput, OrderQuote, OrderWithPayment, PlacedOrder } from '../types';

export const checkoutApi = {
  /** RN-007: el total que se muestra siempre viene del backend. */
  async quote(input: CheckoutInput): Promise<OrderQuote> {
    const { data } = await api.post<ApiSuccess<OrderQuote>>(ENDPOINTS.checkout.quote, input);
    return data.data;
  },

  /**
   * Crea el pedido y devuelve la URL de pago.
   * `idempotencyKey` se genera UNA vez por intento: si el cliente hace doble clic
   * o recarga, el backend devuelve el mismo pedido en lugar de crear otro (RN-015).
   */
  async place(input: CheckoutInput, idempotencyKey: string): Promise<PlacedOrder> {
    const { data } = await api.post<ApiSuccess<PlacedOrder>>(ENDPOINTS.checkout.place, {
      ...input,
      idempotencyKey,
    });
    return data.data;
  },

  async getOrder(orderNumber: string): Promise<OrderWithPayment> {
    const { data } = await api.get<ApiSuccess<OrderWithPayment>>(
      ENDPOINTS.orders.detail(orderNumber),
    );
    return data.data;
  },

  /** Solo desarrollo: la pagina del simulador "paga" o "rechaza". */
  async simulatePayment(providerReference: string, outcome: 'pay' | 'fail'): Promise<void> {
    await api.post(ENDPOINTS.payments.simulate, { providerReference, outcome });
  },
};
