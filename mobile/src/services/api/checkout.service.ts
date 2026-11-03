import type { CheckoutInput, OrderQuote, PlacedOrder } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const checkoutApi = {
  availability: (input: Partial<CheckoutInput> & Pick<CheckoutInput, 'items' | 'deliveryType'>) => apiRequest<{branchId:number; slots: import('../../types/domain').DeliverySlot[]; reasons:Array<{code:string;message:string}>}>('/checkout/availability', {method:'POST',body:{...input,serviceMode:'ASAP',deliverySlotId:undefined,couponCode:undefined,useWallet:false},auth:true}),
  quote: (input: CheckoutInput) => apiRequest<OrderQuote>(ENDPOINTS.checkout.quote, { method: 'POST', body: { ...input, client: 'MOBILE' }, auth: true }),
  place: (input: CheckoutInput & { idempotencyKey: string }) => apiRequest<PlacedOrder>(ENDPOINTS.checkout.place, { method: 'POST', body: { ...input, client: 'MOBILE' }, auth: true, timeoutMs: 30_000 }),
};
