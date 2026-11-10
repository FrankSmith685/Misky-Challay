import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface BoxItem {
  variantId: number; productId: number; productName: string; productSlug?: string; variantName: string; imageUrl?: string | null; quantity: number; catalogPrice: number;
}
export interface SubscriptionPlan {
  id: number; code: string; name: string; description: string; monthlyPrice: number; items: BoxItem[];
  branchIds: number[]; leadDays: number; maxActiveSubscribers: number; remainingSubscriptions: number; maxDailyPickups: number;
  isActive: boolean; sortOrder: number;
  version: number; effectiveFrom: string | null; archivedAt: string | null;
  publicationStatus: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  retailValue: number; customerSavings: number; savingsPercent: number;
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
  leadDays: number; maxActiveSubscribers: number; maxDailyPickups: number; isActive: boolean; sortOrder: number; effectiveFrom?: string | null; expectedVersion?: number;
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
  adminDashboard: () => get<{ providerAvailable: boolean; mrr: number; active: number; pastDue: number; canceled: number; pending: number; churnRate: number; grossCollected: number; redeemedCycles: number; pendingRedemption: number; expiredUnredeemed: number; commissionAccrued: number; byPlan: Array<{ planId: number; active: number; pastDue: number; grossCollected: number; pendingRedemption: number }> }>('/subscriptions/admin/dashboard'),
  adminSubscribers: (params: { page?: number; pageSize?: number; status?: string; planId?: number } = {}) => get<{ rows: Array<{ id: number; planId: number; planName: string; status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'; user: { id: number; firstName: string | null; lastName: string | null; email: string | null }; price: number; nextChargeAt: string | null; branchId: number; createdAt: string; lastSyncAt: string | null; lastSyncError: string | null; cancellationReason: string | null; paidCycles: number; pendingBoxes: number; expiredBoxes: number; scheduledBoxes: number }>; total: number; page: number; pageSize: number }>(`/subscriptions/admin/subscribers?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  createPlan: (input: PlanInput) => post<SubscriptionPlan>('/subscriptions/admin/plans', input),
  updatePlan: async (id: number, input: PlanInput) => (await api.put<ApiSuccess<SubscriptionPlan>>(`/subscriptions/admin/plans/${id}`, input)).data.data,
  archivePlan: (id: number, expectedVersion?: number) => post<SubscriptionPlan>(`/subscriptions/admin/plans/${id}/archive`, { expectedVersion }),
  adminSync: (id: number) => post(`/subscriptions/admin/subscribers/${id}/sync`),
  adminCancel: (id: number, reason?: string) => post(`/subscriptions/admin/subscribers/${id}/cancel`, { reason }),
};
