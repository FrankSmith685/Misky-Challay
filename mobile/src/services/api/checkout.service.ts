import type { CheckoutInput, OrderQuote, PlacedOrder } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const checkoutApi = {
  quote: (input: CheckoutInput) => apiRequest<OrderQuote>(ENDPOINTS.checkout.quote, { method: 'POST', body: { ...input, client: 'MOBILE' }, auth: true }),
  place: (input: CheckoutInput & { idempotencyKey: string }) => apiRequest<PlacedOrder>(ENDPOINTS.checkout.place, { method: 'POST', body: { ...input, client: 'MOBILE' }, auth: true, timeoutMs: 30_000 }),
};
