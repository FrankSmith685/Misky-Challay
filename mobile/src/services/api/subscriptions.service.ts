import { apiRequest } from './client';

export interface SubscriptionItem {
  variantId: number; productName: string; variantName: string; quantity: number; catalogPrice?: number;
}
export interface SubscriptionPlan {
  id: number; name: string; description: string; monthlyPrice: number; items: SubscriptionItem[];
  branchIds: number[]; leadDays: number; remainingSubscriptions: number;
}
export interface SubscriptionCycle {
  id: number; paidAt: string; expiresAt: string; orderId: number | null; scheduledAt: string | null;
}
export interface CustomerSubscription {
  termsAcceptance?:{title:string;content:string;version:number;acceptedAt:string}|null;
  id: number; name: string; price: number; branchId: number; leadDays: number;
  status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'; nextChargeAt: string | null;
  cycles: SubscriptionCycle[];
}
export interface PickupBranch { id: number; name: string; addressLine: string; acceptsPickup: boolean }
export interface PickupSlot { id: number; startsAt: string; available: number }

export const subscriptionsApi = {
  config: () => apiRequest<{ termsVersion: string; available: boolean }>('/subscriptions/config'),
  plans: () => apiRequest<SubscriptionPlan[]>('/subscriptions/plans'),
  branches: () => apiRequest<PickupBranch[]>('/locations/branches'),
  mine: () => apiRequest<CustomerSubscription[]>('/subscriptions/mine', { auth: true }),
  slots: (branchId: number) => apiRequest<PickupSlot[]>('/locations/slots', { query: { branchId, days: 45 } }),
  subscribe: (planId: number, branchId: number, termsVersion: string) =>
    apiRequest<{ id: number; checkoutUrl: string }>('/subscriptions/subscribe', {
      method: 'POST', auth: true, body: { planId, branchId, termsVersion, termsAccepted: true, client: 'MOBILE' },
    }),
  sync: (id: number) => apiRequest<{ status: string; paidCycles: number }>(`/subscriptions/${id}/sync`, { method: 'POST', auth: true }),
  checkout: (id: number) => apiRequest<{ checkoutUrl: string }>(`/subscriptions/${id}/checkout`, { auth: true }),
  cancel: (id: number) => apiRequest<{ canceled: boolean }>(`/subscriptions/${id}/cancel`, { method: 'POST', auth: true }),
  redeem: (cycleId: number, slotId: number) => apiRequest<{ orderId: number; orderNumber: string }>(`/subscriptions/cycles/${cycleId}/redeem`, {
    method: 'POST', auth: true, body: { slotId },
  }),
};
