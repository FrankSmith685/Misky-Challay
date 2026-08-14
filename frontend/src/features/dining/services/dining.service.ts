import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import type { DiningProduct } from '@features/admin/types';

export interface PublicDiningTable {
  table: { id: number; code: string; area: string; capacity: number };
  branch: { id: number; name: string };
  command: { orderNumber: string; status: string; total: number } | null;
  catalog: DiningProduct[];
}

export const diningApi = {
  async table(token: string): Promise<PublicDiningTable> {
    const { data } = await api.get<ApiSuccess<PublicDiningTable>>(`/operations/dining/qr/${token}`);
    return data.data;
  },

  async order(token: string, input: {
    guestName?: string;
    notes?: string;
    items: Array<{ productId: number; variantId: number; offeringId?: number; quantity: number }>;
  }): Promise<{ orderNumber: string; status: string; total: number }> {
    const { data } = await api.post<ApiSuccess<{ orderNumber: string; status: string; total: number }>>(`/operations/dining/qr/${token}/orders`, input);
    return data.data;
  },
};
