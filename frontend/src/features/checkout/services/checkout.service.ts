import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { CheckoutInput, OrderQuote, OrderWithPayment, PlacedOrder } from '../types';
import { announceOrderChanged } from '@features/orders/orderChanged';

export const checkoutApi = {
  async availability(input: CheckoutInput): Promise<{ branchId: number; slots: import('@features/geo/types').DeliverySlot[]; reasons: Array<{ code: string; message: string }> }> {
    const { data } = await api.post('/checkout/availability', { ...input, serviceMode: 'ASAP', deliverySlotId: undefined, couponCode: undefined, useWallet: false });
    return data.data;
  },
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
    announceOrderChanged();
    return data.data;
  },

  async getOrder(orderNumber: string): Promise<OrderWithPayment> {
    const { data } = await api.get<ApiSuccess<OrderWithPayment>>(
      ENDPOINTS.orders.detail(orderNumber),
    );
    announceOrderChanged(data.data.order);
    return data.data;
  },

  async reconcileOrder(orderNumber: string): Promise<OrderWithPayment> {
    const { data } = await api.post<ApiSuccess<OrderWithPayment>>(
      `/orders/${encodeURIComponent(orderNumber)}/payment/reconcile`,
    );
    announceOrderChanged(data.data.order);
    return data.data;
  },

  async retryPayment(orderNumber: string): Promise<{ checkoutUrl: string | null }> {
    const { data } = await api.post<ApiSuccess<{ checkoutUrl: string | null }>>(
      `/orders/${encodeURIComponent(orderNumber)}/payment/retry`, { client: 'WEB' },
    );
    return data.data;
  },

  /**
   * Cancela un pedido que nunca llego a pagarse. Devuelve el stock reservado, el
   * cupon y el saldo (RN-018); sin esto, abandonar la pasarela dejaba todo eso
   * retenido hasta que alguien lo mirara a mano.
   */
  async cancelOrder(orderNumber: string, reason: string): Promise<void> {
    await api.post(ENDPOINTS.orders.cancel(orderNumber), { reason });
    announceOrderChanged();
  },

  /** Solo desarrollo: la pagina del simulador "paga" o "rechaza". */
  async simulatePayment(providerReference: string, outcome: 'pay' | 'fail'): Promise<void> {
    await api.post(ENDPOINTS.payments.simulate, { providerReference, outcome });
  },
};
