import { apiRequest } from './client';

export interface CakeProfile { productId: number; saleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED'; minLeadHours: number }
export interface CakeDesignBrief { occasion: string; theme: string; style: string; colors: string[]; servings: number | null; message: string; budget: string; notes: string; flavor?: string; filling?: string }
export interface CakeDesignRequest {
  id: number; productId: number; variantId: number; branchId: number; desiredAt: string;
  requestKind: 'ADVANCED' | 'FREEFORM'; description: string; brief: CakeDesignBrief; status: string; referenceCount: number;
  selectionsJson: Array<{ optionId: number; quantity: number }>;
  referenceIds: number[]; quotes: Array<{ id: number; version: number; price: number; status: string; proposedAt: string; expiresAt: string; terms: string; orderId: number | null; allergenCodesJson: string[] | null }>;
  whatsappOptInAt?: string | null;
}
export const cakesApi = {
  profile: (productId: number) => apiRequest<CakeProfile>(`/cakes/products/${productId}/profile`),
  submitDesign: (input: { branchId: number; productId: number; variantId: number; desiredAt: string; requestKind?: 'ADVANCED' | 'FREEFORM'; selections?: Array<{ optionId: number; quantity: number }>; description: string; brief: CakeDesignBrief; referenceDataUrl?: string; referenceDataUrls?: string[]; whatsappOptIn?: boolean }) => apiRequest<CakeDesignRequest>('/cakes/design-requests', { method: 'POST', auth: true, body: { ...input, selections: input.selections ?? [] } }),
  mine: () => apiRequest<CakeDesignRequest[]>('/cakes/design-requests/mine', { auth: true }),
  stopDesignWhatsapp: (requestId: number) => apiRequest<{ whatsappOptInAt: null }>(`/cakes/design-requests/${requestId}/whatsapp/stop`, { method: 'POST', auth: true }),
  acceptQuote: (quoteId: number) => apiRequest<CakeDesignRequest>(`/cakes/quotes/${quoteId}/accept`, { method: 'POST', auth: true }),
};
