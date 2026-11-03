import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface BoxItem {
  variantId: number; productId: number; productName: string; productSlug?: string; variantName: string; imageUrl?: string | null; quantity: number; catalogPrice: number;
}
export interface SubscriptionPlan {
  id: number; code: string; name: string; description: string; monthlyPrice: number; items: BoxItem[];
  branchIds: number[]; leadDays: number; maxActiveSubscribers: number; remainingSubscriptions: number; maxDailyPickups: number;
  isActive: boolean; sortOrder: number;
}
export interface SubscriptionCycle {
  id: number; amount: number; paidAt: string; expiresAt: string; scheduledAt: string | null; orderId: number | null;
}
export interface CustomerSubscription {
  termsAcceptance?:{title:string;content:string;version:number;acceptedAt:string}|null;
  id: number; planId: number; name: string; price: number; items: BoxItem[]; branchId: number; leadDays: number;
  status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'; nextChargeAt: string | null; canceledAt: string | null;
  cycles: SubscriptionCycle[];
}
export interface PlanInput {
  code: string; name: string; description: string; monthlyPrice: number;
  items: Array<{ variantId: number; quantity: number }>; branchIds: number[];
  leadDays: number; maxActiveSubscribers: number; maxDailyPickups: number; isActive: boolean; sortOrder: number;
}
export interface Slot { id: number; startsAt: string; endsAt: string; available: number }

const get = async <T>(url: string): Promise<T> => (await api.get<ApiSuccess<T>>(url)).data.data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await api.post<ApiSuccess<T>>(url, body)).data.data;

export const subscriptionsApi = {
  config: () => get<{ termsVersion: string; available: boolean }>('/subscriptions/config'),
  plans: () => get<SubscriptionPlan[]>('/subscriptions/plans'),
  mine: () => get<CustomerSubscription[]>('/subscriptions/mine'),
  subscribe: (planId: number, branchId: number, termsVersion: string) => post<{ id: number; checkoutUrl: string }>('/subscriptions/subscribe', { planId, branchId, termsAccepted: true, termsVersion }),
  sync: (id: number) => post<{ status: string; paidCycles: number }>(`/subscriptions/${id}/sync`),
  checkout: (id: number) => get<{ checkoutUrl: string }>(`/subscriptions/${id}/checkout`),
  cancel: (id: number) => post<{ canceled: boolean }>(`/subscriptions/${id}/cancel`),
  redeem: (cycleId: number, slotId: number) => post<{ orderNumber: string; orderId: number }>(`/subscriptions/cycles/${cycleId}/redeem`, { slotId }),
  branches: () => get<Array<{ id: number; name: string; addressLine: string; acceptsPickup: boolean }>>('/locations/branches'),
  slots: (branchId: number) => get<Slot[]>(`/locations/slots?branchId=${branchId}&days=30`),
  adminPlans: () => get<SubscriptionPlan[]>('/subscriptions/admin/plans'),
  adminOptions: () => get<{ products: Array<{ id: number; name: string; price: number }>; branches: Array<{ id: number; name: string }> }>('/subscriptions/admin/options'),
  adminSubscribers: () => get<Array<{ id: number; planId: number; planName: string; status: string; user: { id: number; firstName: string | null; lastName: string | null; email: string | null }; price: number; nextChargeAt: string | null; branchId: number; createdAt: string; paidCycles: number; pendingBoxes: number; scheduledBoxes: number }>>('/subscriptions/admin/subscribers'),
  createPlan: (input: PlanInput) => post<SubscriptionPlan>('/subscriptions/admin/plans', input),
  updatePlan: async (id: number, input: PlanInput) => (await api.put<ApiSuccess<SubscriptionPlan>>(`/subscriptions/admin/plans/${id}`, input)).data.data,
  adminSync: (id: number) => post(`/subscriptions/admin/subscribers/${id}/sync`),
  adminCancel: (id: number) => post(`/subscriptions/admin/subscribers/${id}/cancel`),
};
