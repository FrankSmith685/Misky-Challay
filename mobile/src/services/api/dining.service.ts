import type { PublicDiningTable } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const diningApi = {
  table: (token: string) => apiRequest<PublicDiningTable>(ENDPOINTS.dining.table(token)),
  order: (token: string, input: { guestName?: string; notes?: string; items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number }> }) =>
    apiRequest<{ orderNumber: string; status: string; total: number }>(ENDPOINTS.dining.order(token), { method: 'POST', body: input }),
};
